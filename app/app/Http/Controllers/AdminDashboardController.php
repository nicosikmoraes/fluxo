<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Laravel\Cashier\Subscription;

class AdminDashboardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $request->validate(['period' => ['sometimes', 'in:week,month']]);
        $days = $request->input('period') === 'week' ? 7 : 30;
        $start = now()->startOfDay()->subDays($days - 1);
        $registrations = User::query()->where('created_at', '>=', $start)->selectRaw('DATE(created_at) as day, COUNT(*) as total')->groupByRaw('DATE(created_at)')->pluck('total', 'day');
        $series = [];
        for ($day = $start->copy(); $day->lte(now()); $day->addDay()) {
            $series[] = ['date' => $day->toDateString(), 'label' => $day->format('d/m'), 'value' => (int) ($registrations[$day->toDateString()] ?? 0)];
        }
        $paid = User::whereHas('paidSubscriptions')->count();
        $manual = User::whereDoesntHave('paidSubscriptions')->manualPro()->count();
        $units = Subscription::query()->where('type', 'default')->where('stripe_price', config('billing.pro_price_id') ?: '__unconfigured__')
            ->where('stripe_status', 'active')->whereHas('user')->where(fn (Builder $q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', now()))
            ->sum(DB::raw('COALESCE(quantity, 1)'));
        $currency = config('billing.currency');

        return response()->json([
            'counts' => ['total' => User::count(), 'active' => $paid + $manual, 'paid' => $paid, 'manual' => $manual,
                'canceled' => AdminUserController::filter(User::query(), ['status' => 'canceled'])->count(),
                'pending' => AdminUserController::filter(User::query(), ['status' => 'past_due'])->count(),
                'free' => AdminUserController::filter(User::query(), ['status' => 'free'])->count(),
                'disabled' => User::whereNotNull('disabled_at')->count(),
                'subscribed' => User::where(fn (Builder $q) => $q->whereHas('adminSubscription')->orWhereNotNull('pro_granted_at'))->count(),
                'new' => User::where('created_at', '>=', $start)->count()],
            'revenue' => ['amount' => $units * (int) config('billing.amounts.'.$currency) / 100, 'currency' => $currency, 'estimated' => true],
            'registrations' => $series, 'period_label' => __('Últimos :days dias', ['days' => $days]), 'as_of' => now()->toIso8601String(), 'timezone' => config('app.timezone'), 'min_grant_date' => now()->addDay()->toDateString(),
            'recent' => AdminUserController::baseQuery()->latest('id')->limit(5)->get()->map(fn (User $user) => $user->administrationData()),
        ])->header('Cache-Control', 'no-store, private');
    }
}
