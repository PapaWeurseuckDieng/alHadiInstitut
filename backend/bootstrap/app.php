<?php

use App\Http\Middleware\EnsurePasswordChanged;
use App\Http\Middleware\EnsurePasswordChangeToken;
use App\Http\Middleware\EnsureRole;
use App\Http\Middleware\NormalizeBooleanQueryParameters;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->append(NormalizeBooleanQueryParameters::class);
        $middleware->alias([
            'password.changed' => EnsurePasswordChanged::class,
            'password.change-token' => EnsurePasswordChangeToken::class,
            'role' => EnsureRole::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Toujours répondre en JSON sur /api/*, même sans header Accept.
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson()
        );

        $exceptions->render(function (AuthenticationException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json(['message' => 'Non authentifié.'], 401);
            }
        });
        $exceptions->render(function (ModelNotFoundException|NotFoundHttpException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json(['message' => 'La ressource demandée est introuvable.'], 404);
            }
        });
        $exceptions->render(function (ThrottleRequestsException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json(['message' => 'Trop de tentatives. Veuillez réessayer plus tard.'], 429);
            }
        });
        $exceptions->render(function (HttpExceptionInterface $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            $message = match ($e->getStatusCode()) {
                400 => 'La requête est invalide.',
                403 => 'Vous n’êtes pas autorisé à effectuer cette action.',
                405 => 'Cette méthode HTTP n’est pas autorisée pour cette ressource.',
                409 => 'Cette opération entre en conflit avec les données existantes.',
                default => null,
            };

            return $message === null
                ? null
                : response()->json(['message' => $message], $e->getStatusCode());
        });
    })->create();
