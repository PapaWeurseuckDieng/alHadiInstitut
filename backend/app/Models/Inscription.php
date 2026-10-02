<?php

namespace App\Models;

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
    ];

    protected function casts(): array
    {
        return [
            'date_inscription' => 'date',
            'montant_inscription' => 'decimal:2',
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
}
