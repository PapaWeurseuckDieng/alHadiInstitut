<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePasswordChangeToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user?->must_change_password || ! $user->currentAccessToken()?->can('password:change')) {
            return response()->json(['message' => 'Jeton de changement de mot de passe invalide.'], 403);
        }

        return $next($request);
    }
}
