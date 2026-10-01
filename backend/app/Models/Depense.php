<?php

namespace App\Models;

use App\Enums\StatutDepense;
use Illuminate\Database\Eloquent\Model;

class Depense extends Model
{
    protected $fillable = [
        'categorie',
        'description',
        'montant',
        'date_depense',
        'statut',
    ];

    protected function casts(): array
    {
        return [
            'date_depense' => 'date',
            'montant' => 'decimal:2',
            'statut' => StatutDepense::class,
        ];
    }
}
