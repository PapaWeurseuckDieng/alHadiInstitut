<?php

namespace App\Services\WhatsApp;

/**
 * Résultat d'un envoi : statut « envoye », « simule » (pilote log) ou « echec » (+ raison).
 */
final class ResultatEnvoi
{
    public function __construct(
        public readonly string $statut,
        public readonly ?string $erreur = null,
    ) {}

    public function estReussi(): bool
    {
        return $this->statut !== 'echec';
    }
}
