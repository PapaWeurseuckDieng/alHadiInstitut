<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePasswordChanged
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user() && ! $request->user()->estActif()) {
            return response()->json([
                'message' => 'Ce compte est désactivé ou archivé. Veuillez contacter l’administration.',
            ], 403);
        }

        if ($request->user()?->must_change_password) {
            return response()->json([
                'message' => 'Le changement de mot de passe est obligatoire.',
                'next_action' => 'change_password',
            ], 403);
        }

        return $next($request);
    }
}
