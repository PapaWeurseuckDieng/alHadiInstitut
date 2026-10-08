<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Eleve extends Model
{
    protected $fillable = [
        'matricule',
        'nom',
        'prenom',
        'date_naissance',
        'sexe',
        'adresse',
        'statut',
    ];

    protected function casts(): array
    {
        return [
            'date_naissance' => 'date',
            'is_archived' => 'boolean',
            'archived_at' => 'datetime',
        ];
    }

    public function tuteurs(): BelongsToMany
    {
        return $this->belongsToMany(Tuteur::class, 'eleve_tuteur')
            ->withPivot(['lien_parente', 'est_responsable_legal', 'est_payeur'])
            ->withTimestamps();
    }

    public function inscriptions(): HasMany
    {
        return $this->hasMany(Inscription::class);
    }

    public function fichesHebdomadaires(): HasMany
    {
        return $this->hasMany(FicheHebdomadaire::class, 'eleve_id');
    }

    public function paiements(): HasMany
    {
        return $this->hasMany(Paiement::class, 'eleve_id');
    }
}
