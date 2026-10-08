<?php

namespace App\Models;

use App\Enums\Role;
use App\Enums\StatutUtilisateur;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasOne;
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
        'sexe',
        'photo',
        'date_naissance',
        'telephone',
        'adresse',
        'password',
        'must_change_password',
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
            'must_change_password' => 'boolean',
            'is_archived' => 'boolean',
            'archived_at' => 'datetime',
        ];
    }

    /**
     * Normalise les numéros sénégalais vers E.164 : "77 123-45.67" → "+221771234567".
     */
    public static function normaliserTelephone(string $telephone): string
    {
        $telephone = preg_replace('/[\s.\-()]/', '', trim($telephone));
        if (str_starts_with($telephone, '00')) {
            $telephone = '+'.substr($telephone, 2);
        }

        if (preg_match('/^\d{9}$/', $telephone)) {
            return '+221'.$telephone;
        }

        if (preg_match('/^221\d{9}$/', $telephone)) {
            return '+'.$telephone;
        }

        return $telephone;
    }

    protected function telephone(): Attribute
    {
        return Attribute::make(
            set: fn (string $value) => static::normaliserTelephone($value),
        );
    }

    public function estActif(): bool
    {
        return $this->statut === StatutUtilisateur::Actif && ! $this->is_archived;
    }

    public function tuteur(): HasOne
    {
        return $this->hasOne(Tuteur::class);
    }

    public function oustaz(): HasOne
    {
        return $this->hasOne(Oustaz::class);
    }
}
