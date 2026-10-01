<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Planning extends Model
{
    protected $fillable = [
        'classe_academique_id',
        'date',
        'heure_debut',
        'heure_fin',
        'activite',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date',
        ];
    }

    public function classeAcademique(): BelongsTo
    {
        return $this->belongsTo(ClasseAcademique::class);
    }
}
