<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ClasseAcademique extends Model
{
    protected $table = 'classes_academiques';

    protected $fillable = [
        'nom',
        'niveau',
        'effectif',
        'annee_scolaire',
        'oustaz_id',
        'statut',
        'mensualite',
    ];

    protected function casts(): array
    {
        return [
            'effectif' => 'integer',
            'mensualite' => 'decimal:2',
            'is_archived' => 'boolean',
            'archived_at' => 'datetime',
        ];
    }

    public function inscriptions(): HasMany
    {
        return $this->hasMany(Inscription::class);
    }

    public function plannings(): HasMany
    {
        return $this->hasMany(Planning::class);
    }

    public function oustaz(): BelongsTo
    {
        return $this->belongsTo(Oustaz::class, 'oustaz_id');
    }
}
