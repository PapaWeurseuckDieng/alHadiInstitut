<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $role = $request->user()?->role?->value;

        if (! $role || ! in_array($role, $roles, true)) {
            return response()->json(['message' => 'Action non autorisée.'], 403);
        }

        return $next($request);
    }
}
