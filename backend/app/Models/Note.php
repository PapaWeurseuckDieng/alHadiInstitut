<?php

namespace App\Models;

use App\Enums\Jour;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Évaluation d'un jour (samedi → mercredi) d'une fiche hebdomadaire.
 */
class Note extends Model
{
    protected $fillable = [
        'fiche_hebdomadaire_id',
        'jour',
        'nouvelle_lecon',
        'revision_partielle',
        'revision_generale',
    ];

    protected function casts(): array
    {
        return [
            'jour' => Jour::class,
        ];
    }

    public function ficheHebdomadaire(): BelongsTo
    {
        return $this->belongsTo(FicheHebdomadaire::class);
    }
}
