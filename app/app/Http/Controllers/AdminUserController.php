<?php

namespace App\Http\Controllers;

use App\Models\AdminEvent;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AdminUserController extends Controller
{
    public static function baseQuery(): Builder
    {
        return User::query()->select(['id', 'name', 'email', 'created_at', 'is_admin', 'disabled_at', 'admin_version', 'pro_granted_at', 'pro_expires_at', 'pro_revoked_at', 'pro_reason', 'stripe_checkout_id', 'stripe_checkout_expires_at', 'stripe_checkout_payload'])
            ->with('adminSubscription')->withExists(['paidSubscriptions as paid_pro', 'ongoingSubscriptions as ongoing_billing']);
    }

    public static function filter(Builder $query, array $filters): Builder
    {
        if (! empty($filters['search'])) {
            $search = '%'.mb_strtolower($filters['search']).'%';
            $query->where(fn (Builder $q) => $q->whereRaw('LOWER(name) LIKE ?', [$search])->orWhereRaw('LOWER(email) LIKE ?', [$search]));
        }
        $status = $filters['status'] ?? 'all';
        if ($status === 'active') {
            $query->where(fn (Builder $q) => $q->whereHas('paidSubscriptions')->orWhere(fn (Builder $q) => $q->manualPro()));
        } elseif ($status === 'manual') {
            $query->whereDoesntHave('paidSubscriptions')->manualPro();
        } elseif ($status === 'canceled') {
            $query->whereDoesntHave('paidSubscriptions')->whereNot(fn (Builder $q) => $q->manualPro())
                ->where(function (Builder $q): void {
                    $q->whereHas('adminSubscription', fn (Builder $s) => $s->whereIn('stripe_status', ['canceled', 'incomplete_expired'])->orWhere('ends_at', '<=', now()))
                        ->orWhere(fn (Builder $u) => $u->whereNotNull('pro_granted_at')->where(fn (Builder $p) => $p->whereNotNull('pro_revoked_at')->orWhere('pro_expires_at', '<=', now())));
                });
        } elseif ($status === 'past_due') {
            $query->whereHas('adminSubscription', fn (Builder $s) => $s->whereIn('stripe_status', ['past_due', 'unpaid', 'incomplete'])->where(fn (Builder $e) => $e->whereNull('ends_at')->orWhere('ends_at', '>', now())));
        } elseif ($status === 'free') {
            $query->whereDoesntHave('adminSubscription')->whereNull('pro_granted_at');
        } elseif ($status === 'disabled') {
            $query->whereNotNull('disabled_at');
        }
        if (($filters['origin'] ?? 'all') === 'manual') {
            $query->whereDoesntHave('paidSubscriptions')->manualPro();
        } elseif (($filters['origin'] ?? 'all') === 'paid') {
            $query->whereHas('adminSubscription')->whereNot(fn (Builder $q) => $q->manualPro()->whereDoesntHave('paidSubscriptions'));
        }
        if (! empty($filters['subscribed'])) {
            $query->where(fn (Builder $q) => $q->whereHas('adminSubscription')->orWhereNotNull('pro_granted_at'));
        }
        if (! empty($filters['eligible'])) {
            $query->whereNull('disabled_at')->whereDoesntHave('ongoingSubscriptions')
                ->where(fn (Builder $q) => $q->whereNull('stripe_checkout_id')->orWhere('stripe_checkout_expires_at', '<=', now()))
                ->where(fn (Builder $q) => $q->whereNull('stripe_checkout_payload')->orWhereNull('stripe_checkout_payload->expires_at')->orWhere('stripe_checkout_payload->expires_at', '<=', now()->timestamp));
        }

        return $query;
    }

    private function filters(Request $request): array
    {
        return $request->validate(['search' => ['nullable', 'string', 'max:254'], 'status' => ['sometimes', Rule::in(['all', 'active', 'manual', 'canceled', 'past_due', 'free', 'disabled'])], 'origin' => ['sometimes', Rule::in(['all', 'paid', 'manual'])], 'subscribed' => ['sometimes', 'boolean'], 'eligible' => ['sometimes', 'boolean'], 'page' => ['sometimes', 'integer', 'min:1', 'max:1000000'], 'per_page' => ['sometimes', 'integer', 'min:1', 'max:100']]);
    }

    public function index(Request $request): JsonResponse
    {
        $filters = $this->filters($request);
        $users = self::filter(self::baseQuery(), $filters)->latest('id')->paginate($filters['per_page'] ?? 8);

        return response()->json(['data' => $users->getCollection()->map(fn (User $user) => $user->administrationData()), 'total' => $users->total(), 'current_page' => $users->currentPage(), 'last_page' => $users->lastPage()])->header('Cache-Control', 'no-store, private');
    }

    public function show(User $user): JsonResponse
    {
        return response()->json(self::baseQuery()->findOrFail($user->id)->administrationData())->header('Cache-Control', 'no-store, private');
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $data = $request->validate(['disabled' => ['required', 'boolean'], 'version' => ['required', 'integer', 'min:0'], 'reason' => ['required', 'string', 'min:3', 'max:300']]);
        DB::transaction(function () use ($request, $user, $data): void {
            $target = User::query()->lockForUpdate()->findOrFail($user->id);
            abort_if($target->is_admin, 403, __('Contas administrativas não podem ser desativadas pelo painel.'));
            abort_if($target->admin_version !== (int) $data['version'], 409, __('Esta conta foi alterada. Atualize os dados e tente novamente.'));
            $target->forceFill(['disabled_at' => $data['disabled'] ? now() : null, 'admin_version' => $target->admin_version + 1])->save();
            AdminEvent::record($request->user(), $target, $data['disabled'] ? 'account.disabled' : 'account.enabled', $data['reason']);
        });

        return $this->show($user);
    }

    public function export(Request $request): StreamedResponse
    {
        $filters = $this->filters($request);
        AdminEvent::record($request->user(), null, 'users.exported', __('Exportação da lista de usuários.'), ['filters' => array_intersect_key($filters, array_flip(['status', 'origin', 'subscribed']))]);

        return response()->streamDownload(function () use ($filters): void {
            $output = fopen('php://output', 'w');
            fwrite($output, "\xEF\xBB\xBF");
            fputcsv($output, ['Nome', 'E-mail', 'Situação', 'Origem', 'Fim do acesso', 'Conta'], ';', '"', '');
            self::filter(self::baseQuery(), $filters)->chunkById(200, function ($users) use ($output): void {
                foreach ($users as $user) {
                    $row = $user->administrationData();
                    $fields = [$row['name'], $row['email'], $row['status'], $row['source'] ?? '', $row['expires'] ?? '', $row['disabled'] ? 'Desativada' : 'Habilitada'];
                    $fields = array_map(fn (string $value): string => preg_match('/^[\s]*[=+\-@\t\r]/u', $value) ? "'".$value : $value, $fields);
                    fputcsv($output, $fields, ';', '"', '');
                }
            });
            fclose($output);
        }, 'fluxo-usuarios-'.now()->format('Y-m-d').'.csv', ['Content-Type' => 'text/csv; charset=UTF-8', 'Cache-Control' => 'no-store, private']);
    }
}
