<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class NormalizeBooleanQueryParameters
{
    public function handle(Request $request, Closure $next): Response
    {
        $value = $request->query('include_archived');

        if (is_string($value)) {
            $normalized = match (strtolower($value)) {
                'true' => true,
                'false' => false,
                default => null,
            };

            if ($normalized !== null) {
                $request->query->set('include_archived', $normalized);
            }
        }

        return $next($request);
    }
}
