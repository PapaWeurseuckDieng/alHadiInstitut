<?php

namespace Database\Seeders;

use App\Enums\Role;
use App\Models\Oustaz;
use App\Models\Tuteur;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Comptes de démonstration (mot de passe temporaire : "passer").
     */
    public function run(): void
    {
        $comptes = [
            ['matricule' => 'AH-ADMIN-001', 'nom' => 'Admin', 'prenom' => 'Al Hadi', 'telephone' => '770000001', 'role' => Role::Admin],
            ['matricule' => 'AH-ENS-001', 'nom' => 'Diop', 'prenom' => 'Oustaz', 'telephone' => '770000002', 'role' => Role::Oustaz],
            ['matricule' => 'AH-PAR-001', 'nom' => 'Fall', 'prenom' => 'Aminata', 'telephone' => '770000004', 'role' => Role::Tuteur],
        ];

        foreach ($comptes as $compte) {
            $user = User::factory()->create([
                ...$compte,
                'password' => 'passer',
                'must_change_password' => true,
            ]);
            if ($user->role === Role::Tuteur) {
                Tuteur::create(['user_id' => $user->id]);
            } elseif ($user->role === Role::Oustaz) {
                Oustaz::create(['user_id' => $user->id]);
            }
        }
    }
}
