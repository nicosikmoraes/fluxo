<?php

namespace App\Providers;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Laravel\Cashier\Cashier;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        Cashier::ignoreRoutes();
    }

    public function boot(): void
    {
        Gate::define('access-admin', fn (User $user): bool => $user->is_admin && $user->disabled_at === null);
        RateLimiter::for('login', function (Request $request): array {
            $email = $request->input('email');
            $identity = is_string($email) ? Str::lower(trim($email)) : '';

            return [
                Limit::perMinute(20)->by('login-ip|'.$request->ip()),
                Limit::perMinute(5)->by('login-account|'.hash('sha256', $identity.'|'.$request->ip())),
            ];
        });
        RateLimiter::for('registration', fn (Request $request): Limit => Limit::perHour(10)->by($request->ip()));
        RateLimiter::for('password-recovery', fn (Request $request): Limit => Limit::perMinute(5)->by($request->ip()));
        ResetPassword::createUrlUsing(fn (object $user, string $token): string => rtrim(config('app.url'), '/').route('password.reset', ['token' => $token, 'email' => $user->email], false));
    }
}
