<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Rappel de mensualité envoyé à un tuteur (journal des envois WhatsApp).
 * statut : envoye | simule (pilote « log ») | echec
 */
class RappelPaiement extends Model
{
    protected $table = 'rappels_paiement';

    protected $fillable = [
        'tuteur_id',
        'mois',
        'canal',
        'telephone',
        'statut',
        'automatique',
        'message',
        'erreur',
        'envoye_par',
    ];

    protected function casts(): array
    {
        return [
            'automatique' => 'boolean',
        ];
    }

    public function tuteur(): BelongsTo
    {
        return $this->belongsTo(Tuteur::class);
    }
}
