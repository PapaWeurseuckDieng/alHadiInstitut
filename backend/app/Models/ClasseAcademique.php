<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ClasseAcademique extends Model
{
    protected $table = 'classes_academiques';

    protected $fillable = [
        'nom',
        'niveau',
        'effectif',
    ];

    protected function casts(): array
    {
        return [
            'effectif' => 'integer',
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
}
