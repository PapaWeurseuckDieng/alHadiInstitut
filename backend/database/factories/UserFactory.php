<?php

namespace Database\Factories;

use App\Enums\Role;
use App\Enums\StatutUtilisateur;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'matricule' => 'AH-'.fake()->unique()->numerify('######'),
            'nom' => fake()->lastName(),
            'prenom' => fake()->firstName(),
            'date_naissance' => fake()->dateTimeBetween('-40 years', '-6 years')->format('Y-m-d'),
            'telephone' => '77'.fake()->unique()->numerify('#######'),
            'adresse' => fake()->city(),
            'password' => static::$password ??= Hash::make('password'),
            'role' => Role::Eleve,
            'statut' => StatutUtilisateur::Actif,
            'remember_token' => Str::random(10),
        ];
    }

    public function role(Role $role): static
    {
        return $this->state(fn () => ['role' => $role]);
    }

    public function inactif(): static
    {
        return $this->state(fn () => ['statut' => StatutUtilisateur::Inactif]);
    }
}
