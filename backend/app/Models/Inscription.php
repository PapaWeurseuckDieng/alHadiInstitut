<?php

namespace App\Models;

use App\Enums\ModePaiement;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Inscription extends Model
{
    protected $fillable = [
        'eleve_id',
        'classe_academique_id',
        'annee_scolaire',
        'date_inscription',
        'statut',
        'montant_inscription',
        'mode_paiement',
        'created_by',
        'numero_recu_inscription',
        'date_paiement_inscription',
        'frais_encaisse_par',
    ];

    protected function casts(): array
    {
        return [
            'date_inscription' => 'date',
            'date_paiement_inscription' => 'date',
            'montant_inscription' => 'decimal:2',
            'mode_paiement' => ModePaiement::class,
            'is_archived' => 'boolean',
            'archived_at' => 'datetime',
        ];
    }

    public function eleve(): BelongsTo
    {
        return $this->belongsTo(Eleve::class, 'eleve_id');
    }

    public function classeAcademique(): BelongsTo
    {
        return $this->belongsTo(ClasseAcademique::class);
    }

    /** Agent qui a encaissé les frais d'inscription. */
    public function caissierFrais(): BelongsTo
    {
        return $this->belongsTo(User::class, 'frais_encaisse_par');
    }

    /** Frais d'inscription réglés (un reçu a été émis). */
    public function fraisPayes(): bool
    {
        return $this->numero_recu_inscription !== null;
    }
}
