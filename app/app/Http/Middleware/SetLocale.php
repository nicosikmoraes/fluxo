<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

class SetLocale
{
    public function handle(Request $request, Closure $next): Response
    {
        $locale = str_replace('_', '-', $request->user()?->locale ?? $request->getPreferredLanguage(['pt-BR', 'en-US']) ?? 'pt-BR');
        App::setLocale($locale === 'en-US' ? 'en' : 'pt_BR');

        $response = $next($request);
        $response->headers->set('Content-Language', $locale === 'en-US' ? 'en-US' : 'pt-BR');

        return $response;
    }
}
