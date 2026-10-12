<?php

namespace App\Providers;

use App\Services\WhatsApp\LogWhatsAppSender;
use App\Services\WhatsApp\MetaWhatsAppSender;
use App\Services\WhatsApp\WhatsAppSender;
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
        // Rappels de paiement : envoi WhatsApp réel (Meta) ou simulation (logs), selon WHATSAPP_DRIVER.
        $this->app->bind(WhatsAppSender::class, fn () => config('services.whatsapp.driver') === 'meta'
            ? new MetaWhatsAppSender(config('services.whatsapp'))
            : new LogWhatsAppSender);
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
