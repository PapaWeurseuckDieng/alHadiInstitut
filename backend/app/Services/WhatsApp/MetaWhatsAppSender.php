<?php

namespace App\Services\WhatsApp;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * Envoi réel via WhatsApp Business Cloud API (Meta).
 *
 * Pré-requis (côté Meta Business) : un numéro WhatsApp Business, un jeton d'accès
 * permanent et un modèle de message « utilitaire » approuvé, dont le corps contient
 * 4 variables dans cet ordre : {{1}} parent, {{2}} mois, {{3}} enfant(s), {{4}} montant restant.
 * Un message envoyé à l'initiative de l'institut doit obligatoirement utiliser un modèle approuvé.
 */
final class MetaWhatsAppSender implements WhatsAppSender
{
    /** @param  array<string, mixed>  $config  config('services.whatsapp') */
    public function __construct(private readonly array $config) {}

    public function envoyer(string $numero, string $message, array $parametres): ResultatEnvoi
    {
        if (blank($this->config['token'] ?? null) || blank($this->config['phone_number_id'] ?? null)) {
            return new ResultatEnvoi('echec', 'WhatsApp n’est pas configuré (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID).');
        }

        $url = sprintf(
            'https://graph.facebook.com/%s/%s/messages',
            $this->config['api_version'],
            $this->config['phone_number_id'],
        );

        try {
            $response = Http::withToken($this->config['token'])
                ->acceptJson()
                ->timeout(15)
                ->post($url, [
                    'messaging_product' => 'whatsapp',
                    'to' => $numero,
                    'type' => 'template',
                    'template' => [
                        'name' => $this->config['template'],
                        'language' => ['code' => $this->config['template_language']],
                        'components' => [[
                            'type' => 'body',
                            'parameters' => array_map(
                                fn (string $valeur) => ['type' => 'text', 'text' => $valeur],
                                $parametres,
                            ),
                        ]],
                    ],
                ]);
        } catch (ConnectionException $exception) {
            return new ResultatEnvoi('echec', 'Serveur WhatsApp injoignable : '.$exception->getMessage());
        }

        if ($response->successful()) {
            return new ResultatEnvoi('envoye');
        }

        return new ResultatEnvoi('echec', (string) ($response->json('error.message') ?? 'Erreur HTTP '.$response->status()));
    }

    public function pilote(): string
    {
        return 'meta';
    }
}
