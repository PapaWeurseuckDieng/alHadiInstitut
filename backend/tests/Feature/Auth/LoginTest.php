<?php

namespace Tests\Feature\Auth;

use App\Enums\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LoginTest extends TestCase
{
    use RefreshDatabase;

    public function test_chaque_role_peut_se_connecter_avec_telephone_et_mot_de_passe(): void
    {
        foreach ([Role::Admin, Role::Tuteur, Role::Oustaz] as $i => $role) {
            User::factory()->role($role)->create(['telephone' => "77000000{$i}"]);

            $this->postJson('/api/auth/login', [
                'telephone' => "77000000{$i}",
                'password' => 'password',
            ])
                ->assertOk()
                ->assertJsonPath('token_type', 'Bearer')
                ->assertJsonPath('user.role', $role->value)
                ->assertJsonStructure(['message', 'token', 'user' => ['id', 'matricule', 'nom', 'prenom', 'telephone', 'role', 'statut']])
                ->assertJsonMissingPath('user.password');
        }
    }

    public function test_le_telephone_est_normalise(): void
    {
        User::factory()->create(['telephone' => '77 123 45 67']);

        $this->postJson('/api/auth/login', ['telephone' => '77-123.45 67', 'password' => 'password'])
            ->assertOk()
            ->assertJsonPath('user.telephone', '+221771234567');
    }

    public function test_mauvais_mot_de_passe_renvoie_401(): void
    {
        User::factory()->create(['telephone' => '771234567']);

        $this->postJson('/api/auth/login', ['telephone' => '771234567', 'password' => 'faux'])
            ->assertUnauthorized()
            ->assertJsonPath('message', 'Numéro de téléphone ou mot de passe incorrect.');
    }

    public function test_telephone_inconnu_renvoie_401(): void
    {
        $this->postJson('/api/auth/login', ['telephone' => '779999999', 'password' => 'password'])
            ->assertUnauthorized();
    }

    public function test_champs_obligatoires(): void
    {
        $this->postJson('/api/auth/login', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['telephone', 'password']);
    }

    public function test_compte_inactif_renvoie_403(): void
    {
        User::factory()->inactif()->create(['telephone' => '771234567']);

        $this->postJson('/api/auth/login', ['telephone' => '771234567', 'password' => 'password'])
            ->assertForbidden();

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_un_eleve_historique_ne_peut_pas_ouvrir_une_session(): void
    {
        User::factory()->role(Role::Eleve)->create(['telephone' => '771234567']);

        $this->postJson('/api/auth/login', [
            'telephone' => '771234567',
            'password' => 'password',
        ])->assertForbidden()
            ->assertJsonPath('message', 'Les élèves ne disposent pas de compte de connexion.');

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_trop_de_tentatives_renvoie_429(): void
    {
        User::factory()->create(['telephone' => '771234567']);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', ['telephone' => '771234567', 'password' => 'faux']);
        }

        $this->postJson('/api/auth/login', ['telephone' => '771234567', 'password' => 'password'])
            ->assertTooManyRequests();
    }

    public function test_me_renvoie_l_utilisateur_connecte(): void
    {
        $user = User::factory()->create(['telephone' => '771234567']);
        $token = $this->postJson('/api/auth/login', ['telephone' => '771234567', 'password' => 'password'])->json('token');

        $this->withToken($token)->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('data.id', $user->id);
    }

    public function test_me_sans_token_renvoie_401(): void
    {
        $this->getJson('/api/auth/me')
            ->assertUnauthorized()
            ->assertJsonPath('message', 'Non authentifié.');
    }

    public function test_logout_revoque_le_token(): void
    {
        User::factory()->create(['telephone' => '771234567']);
        $token = $this->postJson('/api/auth/login', ['telephone' => '771234567', 'password' => 'password'])->json('token');

        $this->withToken($token)->postJson('/api/auth/logout')->assertOk();

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }
}
