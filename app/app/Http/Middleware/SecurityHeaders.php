<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        if ($request->isSecure() && app()->environment('production', 'staging')) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000');
        }
        if (str_contains((string) $response->headers->get('Content-Type'), 'text/html') && ! $response->headers->has('Content-Security-Policy')) {
            // Inline scripts (such as the theme bootstrap in the built pages) are allowed by hash, not by 'unsafe-inline'.
            preg_match_all('#<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>#s', (string) $response->getContent(), $inline);
            $hashes = collect($inline[1])->map(fn (string $code): string => "'sha256-".base64_encode(hash('sha256', $code, true))."'")->implode(' ');
            $response->headers->set('Content-Security-Policy', implode('; ', [
                "default-src 'self'",
                trim("script-src 'self' ".$hashes),
                "style-src 'self' 'unsafe-inline'",
                "img-src 'self' data: blob:",
                "font-src 'self' data:",
                "connect-src 'self'",
                "object-src 'none'",
                "base-uri 'self'",
                "form-action 'self'",
                "frame-ancestors 'none'",
            ]));
        }

        return $response;
    }
}
