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
        'date_inscription',
        'montant_inscription',
        'mode_paiement',
    ];

    protected function casts(): array
    {
        return [
            'date_inscription' => 'date',
            'montant_inscription' => 'decimal:2',
            'mode_paiement' => ModePaiement::class,
        ];
    }

    public function eleve(): BelongsTo
    {
        return $this->belongsTo(User::class, 'eleve_id');
    }

    public function classeAcademique(): BelongsTo
    {
        return $this->belongsTo(ClasseAcademique::class);
    }
}
