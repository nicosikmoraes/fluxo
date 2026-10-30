<?php

namespace App\Http\Middleware;

use App\Models\AdminSetting;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class EnforceAccountAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->disabled_at) {
            Auth::logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
            if ($request->is('api/*')) {
                return response()->json(['message' => __('Esta conta está desativada. Entre em contato com o suporte.')], 401);
            }

            return redirect()->route('login');
        }
        if ($request->user() && ! $request->user()->is_admin && $request->is('api/*')
         && ! $request->is('api/auth/*', 'api/billing', 'api/billing/*')
         && AdminSetting::preferences()['maintenance']) {
            return response()->json(['message' => __('O Fluxo está em manutenção. Tente novamente em breve.')], 503)->header('Retry-After', '300');
        }

        return $next($request);
    }
}
