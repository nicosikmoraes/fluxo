<?php
namespace App\Http\Middleware;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
class LocalAccess {
    public function handle(Request $request, Closure $next): Response {
        $origin = $request->headers->get('Origin');
        $allowed = ['http://127.0.0.1:8787', 'http://localhost:8787', 'http://127.0.0.1:8001', 'http://localhost:8001', 'http://127.0.0.1:5173', 'http://localhost:5173'];
        if ($request->is('api/*') && (($origin && !in_array($origin, $allowed, true)) || $request->headers->get('Sec-Fetch-Site') === 'cross-site')) abort(403, 'Acesso permitido apenas pela aplicação local.');
        return $next($request);
    }
}
