<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FicheHebdomadaire extends Model
{
    protected $table = 'fiches_hebdomadaires';

    protected $fillable = [
        'eleve_id',
        'enseignant_id',
        'date_debut',
        'date_fin',
        'sourate_debut',
        'verset_debut',
        'sourate_fin',
        'verset_fin',
        'debut_revision',
        'fin_revision',
        'statut',
    ];

    protected function casts(): array
    {
        return [
            'date_debut' => 'date',
            'date_fin' => 'date',
            'verset_debut' => 'integer',
            'verset_fin' => 'integer',
        ];
    }

    public function eleve(): BelongsTo
    {
        return $this->belongsTo(Eleve::class, 'eleve_id');
    }

    public function enseignant(): BelongsTo
    {
        return $this->belongsTo(User::class, 'enseignant_id');
    }

    public function notes(): HasMany
    {
        return $this->hasMany(Note::class);
    }
}
