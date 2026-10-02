<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Tuteur extends Model
{
    protected $fillable = ['user_id', 'profession'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function eleves(): BelongsToMany
    {
        return $this->belongsToMany(Eleve::class, 'eleve_tuteur')
            ->withPivot(['lien_parente', 'est_responsable_legal', 'est_payeur'])
            ->withTimestamps();
    }
}
