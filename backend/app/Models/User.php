<?php

namespace App\Models;

use App\Enums\Role;
use App\Enums\StatutUtilisateur;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'matricule',
        'nom',
        'prenom',
        'photo',
        'date_naissance',
        'telephone',
        'adresse',
        'password',
        'role',
        'statut',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'date_naissance' => 'date',
            'password' => 'hashed',
            'role' => Role::class,
            'statut' => StatutUtilisateur::class,
        ];
    }

    /**
     * Supprime espaces, points, tirets et parenthèses : "77 123-45.67" → "771234567".
     */
    public static function normaliserTelephone(string $telephone): string
    {
        return preg_replace('/[\s.\-()]/', '', $telephone);
    }

    protected function telephone(): Attribute
    {
        return Attribute::make(
            set: fn (string $value) => static::normaliserTelephone($value),
        );
    }

    public function estActif(): bool
    {
        return $this->statut === StatutUtilisateur::Actif;
    }

    public function inscriptions(): HasMany
    {
        return $this->hasMany(Inscription::class, 'eleve_id');
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
