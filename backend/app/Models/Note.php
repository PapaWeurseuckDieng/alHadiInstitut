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
        'd_sourate_debut',
        'd_verset_debut',
        'd_sourate_fin',
        'd_verset_fin',
        'j_sourate_debut',
        'j_verset_debut',
        'j_sourate_fin',
        'j_verset_fin',
        'm_sourate_debut',
        'm_verset_debut',
        'm_sourate_fin',
        'm_verset_fin',
        'qualite_recitation',
    ];

    protected function casts(): array
    {
        return [
            'jour' => Jour::class,
            'd_sourate_debut' => 'integer',
            'd_verset_debut' => 'integer',
            'd_sourate_fin' => 'integer',
            'd_verset_fin' => 'integer',
            'j_sourate_debut' => 'integer',
            'j_verset_debut' => 'integer',
            'j_sourate_fin' => 'integer',
            'j_verset_fin' => 'integer',
            'm_sourate_debut' => 'integer',
            'm_verset_debut' => 'integer',
            'm_sourate_fin' => 'integer',
            'm_verset_fin' => 'integer',
            'qualite_recitation' => 'integer',
        ];
    }

    public function ficheHebdomadaire(): BelongsTo
    {
        return $this->belongsTo(FicheHebdomadaire::class);
    }
}
