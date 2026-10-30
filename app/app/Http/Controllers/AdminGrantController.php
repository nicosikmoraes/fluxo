<?php

namespace App\Http\Controllers;

use App\Models\AdminEvent;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AdminGrantController extends Controller
{
    public function store(Request $request, User $user): JsonResponse
    {
        if (is_string($request->input('reason'))) {
            $request->merge(['reason' => trim($request->input('reason'))]);
        }
        $data = $request->validate([
            'version' => ['required', 'integer', 'min:0'], 'reason' => ['required', 'string', 'min:3', 'max:300'],
            'duration' => ['required', Rule::in(['7', '30', '90', 'custom', 'forever'])],
            'until' => ['exclude_unless:duration,custom', 'required', 'date_format:Y-m-d', 'after:today', 'before_or_equal:'.now()->addYears(5)->toDateString()],
        ]);
        try {
            Cache::lock('billing:checkout:'.$user->id, 300)->block(3, function () use ($request, $user, $data): void {
                DB::transaction(function () use ($request, $user, $data): void {
                    $target = User::query()->lockForUpdate()->findOrFail($user->id);
                    abort_if($target->admin_version !== (int) $data['version'], 409, __('Esta conta foi alterada. Atualize os dados e tente novamente.'));
                    abort_if($target->disabled_at, 409, __('Reative a conta antes de conceder uma cortesia.'));
                    abort_if($target->hasOngoingBilling(), 409, __('Esta conta tem cobrança em andamento. Gerencie a assinatura Stripe antes de conceder uma cortesia.'));
                    $expires = match ($data['duration']) {
                        'forever' => null,
                        'custom' => CarbonImmutable::parse($data['until'])->endOfDay(),
                        default => now()->addDays((int) $data['duration']),
                    };
                    $target->forceFill(['pro_granted_at' => now(), 'pro_expires_at' => $expires, 'pro_revoked_at' => null, 'pro_granted_by' => $request->user()->id, 'pro_reason' => $data['reason'], 'admin_version' => $target->admin_version + 1])->save();
                    AdminEvent::record($request->user(), $target, 'grant.created', $data['reason'], ['expires_at' => $expires?->toIso8601String()]);
                }, 3);
            });
        } catch (LockTimeoutException) {
            abort(409, __('Existe outra operação de cobrança nesta conta. Aguarde e tente novamente.'));
        }

        return response()->json(AdminUserController::baseQuery()->findOrFail($user->id)->administrationData(), 201);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        $data = $request->validate(['version' => ['required', 'integer', 'min:0'], 'reason' => ['required', 'string', 'min:3', 'max:300']]);
        DB::transaction(function () use ($request, $user, $data): void {
            $target = User::query()->lockForUpdate()->findOrFail($user->id);
            abort_if($target->admin_version !== (int) $data['version'], 409, __('Esta conta foi alterada. Atualize os dados e tente novamente.'));
            abort_unless($target->hasManualPro(), 409, __('Esta conta não tem cortesia ativa.'));
            $target->forceFill(['pro_revoked_at' => now(), 'pro_expires_at' => now(), 'admin_version' => $target->admin_version + 1])->save();
            AdminEvent::record($request->user(), $target, 'grant.revoked', $data['reason']);
        }, 3);

        return response()->json(AdminUserController::baseQuery()->findOrFail($user->id)->administrationData());
    }
}
