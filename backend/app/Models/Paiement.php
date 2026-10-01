<?php

namespace App\Models;

use App\Enums\ModePaiement;
use App\Enums\StatutPaiement;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Paiement extends Model
{
    protected $fillable = [
        'eleve_id',
        'date_paiement',
        'montant_fixe',
        'remise',
        'montant_paye',
        'mode_paiement',
        'statut',
    ];

    protected function casts(): array
    {
        return [
            'date_paiement' => 'date',
            'montant_fixe' => 'decimal:2',
            'remise' => 'decimal:2',
            'montant_paye' => 'decimal:2',
            'mode_paiement' => ModePaiement::class,
            'statut' => StatutPaiement::class,
        ];
    }

    public function eleve(): BelongsTo
    {
        return $this->belongsTo(User::class, 'eleve_id');
    }
}
