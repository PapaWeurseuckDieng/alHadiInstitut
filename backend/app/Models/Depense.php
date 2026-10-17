<?php

namespace App\Models;

use App\Enums\CategorieDepense;
use App\Enums\ModePaiement;
use App\Enums\StatutDepense;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Dépense de l'institut. Cycle : en_attente → validee ou rejetee.
 * Seules les dépenses validées comptent dans les totaux ; rien n'est supprimé.
 */
class Depense extends Model
{
    protected $fillable = [
        'categorie',
        'description',
        'montant',
        'mode_paiement',
        'beneficiaire',
        'date_depense',
        'annee_scolaire',
        'statut',
        'created_by',
        'traite_par',
        'traite_at',
        'motif_rejet',
    ];

    protected function casts(): array
    {
        return [
            'categorie' => CategorieDepense::class,
            'date_depense' => 'date',
            'montant' => 'decimal:2',
            'mode_paiement' => ModePaiement::class,
            'statut' => StatutDepense::class,
            'traite_at' => 'datetime',
        ];
    }

    public function scopeValidees(Builder $query): Builder
    {
        return $query->where('statut', StatutDepense::Validee->value);
    }

    public function estEnAttente(): bool
    {
        return $this->statut === StatutDepense::EnAttente;
    }

    public function auteur(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function traiteePar(): BelongsTo
    {
        return $this->belongsTo(User::class, 'traite_par');
    }
}
