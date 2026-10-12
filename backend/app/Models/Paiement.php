<?php

namespace App\Models;

use App\Enums\ModePaiement;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Paiement reçu au secrétariat pour une mensualité (un reçu par paiement).
 * Un paiement annulé reste en base mais n'est plus compté.
 */
class Paiement extends Model
{
    protected $fillable = [
        'numero_recu',
        'eleve_id',
        'inscription_id',
        'annee_scolaire',
        'mois',
        'montant_du',
        'montant',
        'mode_paiement',
        'date_paiement',
        'note',
        'encaisse_par',
        'annule_at',
        'annule_par',
        'motif_annulation',
    ];

    protected function casts(): array
    {
        return [
            'montant_du' => 'decimal:2',
            'montant' => 'decimal:2',
            'mode_paiement' => ModePaiement::class,
            'date_paiement' => 'date',
            'annule_at' => 'datetime',
        ];
    }

    /** Paiements valides (non annulés). */
    public function scopeValides(Builder $query): Builder
    {
        return $query->whereNull('annule_at');
    }

    public function estAnnule(): bool
    {
        return $this->annule_at !== null;
    }

    public function eleve(): BelongsTo
    {
        return $this->belongsTo(Eleve::class);
    }

    public function inscription(): BelongsTo
    {
        return $this->belongsTo(Inscription::class);
    }

    public function caissier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'encaisse_par');
    }

    public function annulePar(): BelongsTo
    {
        return $this->belongsTo(User::class, 'annule_par');
    }
}
