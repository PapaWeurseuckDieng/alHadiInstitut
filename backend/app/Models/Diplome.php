<?php

namespace App\Models;

use App\Enums\MentionDiplome;
use App\Enums\TypeDiplome;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Diplôme délivré à un élève ; un diplôme annulé reste en base, marqué annulé. */
class Diplome extends Model
{
    protected $fillable = [
        'numero',
        'eleve_id',
        'type',
        'intitule',
        'mention',
        'date_obtention',
        'annee_scolaire',
        'classe',
        'observations',
        'delivre_par',
        'annule_at',
        'annule_par',
        'motif_annulation',
    ];

    protected function casts(): array
    {
        return [
            'type' => TypeDiplome::class,
            'mention' => MentionDiplome::class,
            'date_obtention' => 'date',
            'annule_at' => 'datetime',
        ];
    }

    public function estAnnule(): bool
    {
        return $this->annule_at !== null;
    }

    public function eleve(): BelongsTo
    {
        return $this->belongsTo(Eleve::class);
    }

    public function signataire(): BelongsTo
    {
        return $this->belongsTo(User::class, 'delivre_par');
    }

    public function annulePar(): BelongsTo
    {
        return $this->belongsTo(User::class, 'annule_par');
    }
}
