<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // 5 tentatives de connexion par minute pour un même numéro depuis une même IP.
        RateLimiter::for('login', function (Request $request) {
            return Limit::perMinute(5)
                ->by(((string) $request->input('telephone')).'|'.$request->ip())
                ->response(fn () => response()->json([
                    'message' => 'Trop de tentatives de connexion. Réessayez dans une minute.',
                ], 429));
        });
    }
}
