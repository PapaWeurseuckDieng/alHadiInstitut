<?php

namespace App\Services\WhatsApp;

use Illuminate\Support\Facades\Log;

/**
 * Pilote de simulation : le message est écrit dans storage/logs, rien n'est envoyé.
 * Utilisé par défaut tant que WhatsApp Business n'est pas configuré.
 */
final class LogWhatsAppSender implements WhatsAppSender
{
    public function envoyer(string $numero, string $message, array $parametres): ResultatEnvoi
    {
        Log::info('[WhatsApp simulé] Rappel de paiement', ['numero' => $numero, 'message' => $message]);

        return new ResultatEnvoi('simule');
    }

    public function pilote(): string
    {
        return 'log';
    }
}
