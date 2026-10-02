<?php

namespace Tests\Feature\Daara;

use App\Enums\Role;
use App\Models\Eleve;
use App\Models\Inscription;
use App\Models\Oustaz;
use App\Models\Tuteur;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class DaaraManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_cree_un_compte_tuteur_avec_mot_de_passe_temporaire(): void
    {
        $admin = User::factory()->role(Role::Admin)->create();

        $response = $this->actingAs($admin)->postJson('/api/v1/admin/users', [
            'nom' => 'DIOP',
            'prenom' => 'Fatou',
            'telephone' => '+221771234567',
            'role' => 'tuteur',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.role', 'tuteur')
            ->assertJsonPath('data.profil_id', Tuteur::firstOrFail()->id)
            ->assertJsonPath('data.must_change_password', true)
            ->assertJsonMissingPath('data.password');

        $user = User::where('telephone', '+221771234567')->firstOrFail();
        $this->assertTrue(Hash::check('passer', $user->password));
        $this->assertTrue($user->must_change_password);
        $this->assertDatabaseHas('tuteurs', ['user_id' => $user->id]);
    }

    public function test_un_non_admin_ne_peut_pas_creer_de_compte(): void
    {
        $tuteurUser = User::factory()->role(Role::Tuteur)->create();

        $this->actingAs($tuteurUser)->postJson('/api/v1/admin/users', [
            'nom' => 'NDIAYE',
            'prenom' => 'Moussa',
            'telephone' => '771234568',
            'role' => 'oustaz',
        ])->assertForbidden();

        $this->assertDatabaseMissing('users', ['telephone' => '771234568']);
    }

    public function test_inscription_cree_un_dossier_eleve_et_le_lie_a_un_tuteur_existant(): void
    {
        $admin = User::factory()->role(Role::Admin)->create();
        $tuteurUser = User::factory()->role(Role::Tuteur)->create();
        $tuteur = Tuteur::create(['user_id' => $tuteurUser->id]);

        $this->actingAs($admin)->postJson('/api/v1/eleves', [
            'eleve' => [
                'nom' => 'SARR',
                'prenom' => 'Awa',
                'date_naissance' => '2017-04-12',
            ],
            'inscription' => [
                'annee_scolaire' => '2026-2027',
                'date_inscription' => '2026-10-01',
            ],
            'tuteurs' => [
                [
                    'mode' => 'existant',
                    'tuteur_id' => $tuteur->id,
                    'lien_parente' => 'mere',
                    'est_responsable_legal' => true,
                    'est_payeur' => true,
                ],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.eleve.a_un_compte', false)
            ->assertJsonPath('data.tuteurs.0.user_id', $tuteurUser->id);

        $eleve = Eleve::firstOrFail();
        $this->assertMatchesRegularExpression('/^ELV-2026-\d{6}$/', $eleve->matricule);
        $this->assertDatabaseHas('inscriptions', [
            'eleve_id' => $eleve->id,
            'annee_scolaire' => '2026-2027',
            'classe_academique_id' => null,
        ]);
        $this->assertTrue($eleve->tuteurs()->whereKey($tuteur->id)->exists());
    }

    public function test_inscription_sans_tuteur_est_refusee_sans_creer_de_dossier(): void
    {
        $admin = User::factory()->role(Role::Admin)->create();

        $this->actingAs($admin)->postJson('/api/v1/eleves', [
            'eleve' => ['nom' => 'BA', 'prenom' => 'Aliou'],
            'inscription' => [
                'annee_scolaire' => '2026-2027',
                'date_inscription' => '2026-10-01',
            ],
            'tuteurs' => [],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('tuteurs');

        $this->assertDatabaseCount('eleves', 0);
        $this->assertDatabaseCount('inscriptions', 0);
    }

    public function test_inscription_cree_le_compte_du_nouveau_tuteur_dans_la_meme_transaction(): void
    {
        $admin = User::factory()->role(Role::Admin)->create();

        $response = $this->actingAs($admin)->postJson('/api/v1/eleves', [
            'eleve' => ['nom' => 'BA', 'prenom' => 'Aliou'],
            'inscription' => [
                'annee_scolaire' => '2026-2027',
                'date_inscription' => '2026-10-01',
            ],
            'tuteurs' => [
                [
                    'mode' => 'creer',
                    'lien_parente' => 'pere',
                    'est_responsable_legal' => true,
                    'compte' => [
                        'nom' => 'BA',
                        'prenom' => 'Mamadou',
                        'telephone' => '77 123 45 67',
                    ],
                ],
            ],
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.tuteurs.0.compte_cree', true)
            ->assertJsonPath('data.tuteurs.0.must_change_password', true);

        $tuteurUser = User::where('telephone', '+221771234567')->firstOrFail();
        $this->assertTrue(Hash::check('passer', $tuteurUser->password));
        $this->assertTrue($tuteurUser->must_change_password);
        $this->assertDatabaseCount('eleves', 1);
        $this->assertDatabaseCount('inscriptions', 1);
    }

    public function test_premiere_connexion_impose_le_changement_du_mot_de_passe(): void
    {
        $user = User::factory()->role(Role::Tuteur)->create([
            'telephone' => '+221771234567',
            'password' => Hash::make('passer'),
            'must_change_password' => true,
        ]);

        $login = $this->postJson('/api/v1/auth/login', [
            'telephone' => '+221771234567',
            'password' => 'passer',
        ])->assertOk()
            ->assertJsonPath('must_change_password', true)
            ->assertJsonPath('next_action', 'change_password');

        $token = $login->json('token');
        $this->withToken($token)->getJson('/api/auth/me')->assertForbidden();

        $this->withToken($token)->postJson('/api/v1/auth/change-password', [
            'new_password' => 'weak',
            'new_password_confirmation' => 'weak',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('new_password');

        $this->withToken($token)->postJson('/api/v1/auth/change-password', [
            'new_password' => 'Daara!Secure2026',
            'new_password_confirmation' => 'Daara!Secure2026',
        ])->assertNoContent();

        $this->assertFalse($user->fresh()->must_change_password);
        $this->assertTrue(Hash::check('Daara!Secure2026', $user->fresh()->password));
        $this->assertDatabaseCount('personal_access_tokens', 0);
        Auth::forgetGuards();
        $this->withToken($token)->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_le_mot_de_passe_temporaire_force_aussi_le_changement_sans_flag_preexistant(): void
    {
        $user = User::factory()->role(Role::Tuteur)->create([
            'telephone' => '771234569',
            'password' => Hash::make('passer'),
            'must_change_password' => false,
        ]);

        $this->postJson('/api/v1/auth/login', [
            'telephone' => '771234569',
            'password' => 'passer',
        ])->assertOk()
            ->assertJsonPath('must_change_password', true)
            ->assertJsonPath('next_action', 'change_password');

        $this->assertTrue($user->fresh()->must_change_password);
    }

    public function test_admin_cree_une_classe_et_y_affecte_les_inscriptions(): void
    {
        $admin = User::factory()->role(Role::Admin)->create();
        $oustazUser = User::factory()->role(Role::Oustaz)->create();
        $oustaz = Oustaz::create(['user_id' => $oustazUser->id]);
        $eleve = Eleve::create([
            'matricule' => 'ELV-2026-000001',
            'nom' => 'FALL',
            'prenom' => 'Moussa',
        ]);
        $inscription = Inscription::create([
            'eleve_id' => $eleve->id,
            'annee_scolaire' => '2026-2027',
            'date_inscription' => '2026-10-01',
            'statut' => 'active',
        ]);

        $this->actingAs($admin)->postJson('/api/v1/classes', [
            'nom' => 'Halaqa Al-Falah',
            'niveau' => 'Intermédiaire',
            'annee_scolaire' => '2026-2027',
            'oustaz_id' => $oustaz->id,
            'inscription_ids' => [$inscription->id],
        ])->assertCreated()
            ->assertJsonPath('data.effectif', 1)
            ->assertJsonPath('data.eleves.0.matricule', $eleve->matricule);

        $this->assertDatabaseHas('classes_academiques', [
            'oustaz_id' => $oustaz->id,
            'annee_scolaire' => '2026-2027',
        ]);
        $this->assertNotNull($inscription->fresh()->classe_academique_id);
    }
}
