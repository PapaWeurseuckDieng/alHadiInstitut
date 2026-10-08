<?php

namespace Tests\Feature\Daara;

use App\Enums\Role;
use App\Models\ClasseAcademique;
use App\Models\Eleve;
use App\Models\FicheHebdomadaire;
use App\Models\Inscription;
use App\Models\Note;
use App\Models\Oustaz;
use App\Models\Tuteur;
use App\Models\User;
use App\Support\AnneeScolaire;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
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
            'sexe' => 'F',
            'telephone' => '+221771234567',
            'role' => 'tuteur',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.role', 'tuteur')
            ->assertJsonPath('data.sexe', 'F')
            ->assertJsonPath('data.profil_id', Tuteur::firstOrFail()->id)
            ->assertJsonPath('data.must_change_password', true)
            ->assertJsonMissingPath('data.password');

        $user = User::where('telephone', '+221771234567')->firstOrFail();
        $this->assertTrue(Hash::check('passer', $user->password));
        $this->assertTrue($user->must_change_password);
        $this->assertSame('F', $user->sexe);
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
        $this->getJson('/api/v1/admin/users')->assertForbidden();
    }

    public function test_sexe_doit_etre_choisi_parmi_m_ou_f(): void
    {
        $admin = User::factory()->role(Role::Admin)->create();

        $this->actingAs($admin)->postJson('/api/v1/admin/users', [
            'nom' => 'NDIAYE',
            'prenom' => 'Moussa',
            'telephone' => '+221771234569',
            'sexe' => 'X',
            'role' => 'tuteur',
        ])->assertUnprocessable()->assertJsonValidationErrors('sexe');

        $this->postJson('/api/v1/eleves', [
            'eleve' => ['nom' => 'BA', 'prenom' => 'Aliou', 'sexe' => 'X'],
            'inscription' => [
                'annee_scolaire' => '2026-2027',
                'date_inscription' => '2026-10-01',
            ],
            'tuteurs' => [
                ['mode' => 'existant', 'tuteur_id' => 1],
            ],
        ])->assertUnprocessable()->assertJsonValidationErrors('eleve.sexe');

        $this->assertDatabaseCount('eleves', 0);
    }

    public function test_annee_scolaire_bascule_le_premier_octobre(): void
    {
        $this->assertSame('2025-2026', AnneeScolaire::courante(Carbon::parse('2026-09-30', 'Africa/Dakar')->toImmutable()));
        $this->assertSame('2026-2027', AnneeScolaire::courante(Carbon::parse('2026-10-01', 'Africa/Dakar')->toImmutable()));
    }

    public function test_inscription_cree_un_dossier_eleve_et_le_lie_a_un_tuteur_existant(): void
    {
        $admin = User::factory()->role(Role::Admin)->create();
        $tuteurUser = User::factory()->role(Role::Tuteur)->create();
        $tuteur = Tuteur::create(['user_id' => $tuteurUser->id]);
        $classe = $this->createCurrentYearClass();

        $this->actingAs($admin)->postJson('/api/v1/eleves', [
            'classe_id' => $classe->id,
            'eleve' => [
                'nom' => 'SARR',
                'prenom' => 'Awa',
                'sexe' => 'F',
                'date_naissance' => '2017-04-12',
            ],
            'inscription' => [
                'date_inscription' => now()->toDateString(),
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
        $schoolYear = AnneeScolaire::courante();
        $this->assertMatchesRegularExpression('/^ELV-'.substr($schoolYear, 0, 4).'-\d{6}$/', $eleve->matricule);
        $this->assertSame('F', $eleve->sexe);
        $this->assertDatabaseHas('inscriptions', [
            'eleve_id' => $eleve->id,
            'annee_scolaire' => $schoolYear,
            'classe_academique_id' => $classe->id,
        ]);
        $this->assertTrue($eleve->tuteurs()->whereKey($tuteur->id)->exists());
    }

    public function test_inscription_sans_tuteur_est_refusee_sans_creer_de_dossier(): void
    {
        $admin = User::factory()->role(Role::Admin)->create();
        $classe = $this->createCurrentYearClass();

        $this->actingAs($admin)->postJson('/api/v1/eleves', [
            'classe_id' => $classe->id,
            'eleve' => ['nom' => 'BA', 'prenom' => 'Aliou', 'sexe' => 'M'],
            'inscription' => [
                'date_inscription' => now()->toDateString(),
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
        $classe = $this->createCurrentYearClass();

        $response = $this->actingAs($admin)->postJson('/api/v1/eleves', [
            'classe_id' => $classe->id,
            'eleve' => ['nom' => 'BA', 'prenom' => 'Aliou', 'sexe' => 'M'],
            'inscription' => [
                'date_inscription' => now()->toDateString(),
            ],
            'tuteurs' => [
                [
                    'mode' => 'creer',
                    'lien_parente' => 'pere',
                    'est_responsable_legal' => true,
                    'compte' => [
                        'nom' => 'BA',
                        'prenom' => 'Mamadou',
                        'sexe' => 'M',
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
        $this->assertSame('M', $tuteurUser->sexe);
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
            'new_password' => 'abcdef',
            'new_password_confirmation' => 'abcdef',
        ])->assertOk()
            ->assertJsonPath('message', 'Mot de passe modifié. Vous pouvez vous connecter.');

        $this->assertFalse($user->fresh()->must_change_password);
        $this->assertTrue(Hash::check('abcdef', $user->fresh()->password));
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
        $year = AnneeScolaire::courante();
        $eleve = Eleve::create([
            'matricule' => 'ELV-'.substr($year, 0, 4).'-000001',
            'nom' => 'FALL',
            'prenom' => 'Moussa',
        ]);
        $inscription = Inscription::create([
            'eleve_id' => $eleve->id,
            'annee_scolaire' => $year,
            'date_inscription' => now()->toDateString(),
            'statut' => 'active',
        ]);

        $this->actingAs($admin)->postJson('/api/v1/classes', [
            'nom' => 'Halaqa Al-Falah',
            'niveau' => 'Intermédiaire',
            'oustaz_id' => $oustaz->id,
            'inscription_ids' => [$inscription->id],
        ])->assertCreated()
            ->assertJsonPath('data.effectif', 1)
            ->assertJsonPath('data.eleves.0.matricule', $eleve->matricule);

        $this->assertDatabaseHas('classes_academiques', [
            'oustaz_id' => $oustaz->id,
            'annee_scolaire' => $year,
        ]);
        $this->assertNotNull($inscription->fresh()->classe_academique_id);
    }

    public function test_admin_peut_modifier_archiver_et_consulter_un_compte_archive(): void
    {
        $admin = User::factory()->role(Role::Admin)->create();
        $user = User::factory()->role(Role::Tuteur)->create();
        Tuteur::create(['user_id' => $user->id]);

        $this->actingAs($admin)->patchJson('/api/v1/admin/users/'.$user->id, [
            'telephone' => '77 123 45 68',
            'is_active' => false,
        ])->assertOk()
            ->assertJsonPath('data.telephone', '+221771234568')
            ->assertJsonPath('data.is_active', false);

        $this->postJson('/api/v1/admin/users/'.$user->id.'/archive', [
            'motif' => 'Fin de suivi',
        ])->assertOk()
            ->assertJsonPath('data.is_archived', true);

        $this->getJson('/api/v1/admin/users?role=tuteur')
            ->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/admin/users?role=tuteur&include_archived=true')
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.is_archived', true);
        $this->getJson('/api/v1/admin/users/'.$user->id)
            ->assertNotFound()
            ->assertJsonPath('message', 'La ressource demandée est introuvable.');
        $this->getJson('/api/v1/admin/users/'.$user->id.'?include_archived=true')
            ->assertOk()->assertJsonPath('data.is_archived', true);
        $this->getJson('/api/v1/admin/users?include_archived=perhaps')
            ->assertUnprocessable()
            ->assertJsonPath('errors.include_archived.0', 'Le champ consultation des archives doit être vrai ou faux.');
    }

    public function test_archiver_un_eleve_le_retire_des_listes_sans_le_supprimer(): void
    {
        $admin = User::factory()->role(Role::Admin)->create();
        $tuteur = Tuteur::create(['user_id' => User::factory()->role(Role::Tuteur)->create()->id]);
        $classe = $this->createCurrentYearClass();
        $eleve = Eleve::create([
            'matricule' => 'ELV-'.substr(AnneeScolaire::courante(), 0, 4).'-000099',
            'nom' => 'SARR',
            'prenom' => 'Awa',
            'sexe' => 'F',
        ]);
        $eleve->tuteurs()->attach($tuteur);
        Inscription::create([
            'eleve_id' => $eleve->id,
            'classe_academique_id' => $classe->id,
            'annee_scolaire' => AnneeScolaire::courante(),
            'date_inscription' => now()->toDateString(),
            'statut' => 'active',
        ]);

        $this->actingAs($admin)->getJson('/api/v1/eleves')->assertOk()->assertJsonCount(1, 'data');
        $this->postJson('/api/v1/eleves/'.$eleve->id.'/archive')->assertOk()
            ->assertJsonPath('data.is_archived', true);
        $this->getJson('/api/v1/eleves')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/eleves?include_archived=true')->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.is_archived', true);
        $this->assertDatabaseHas('eleves', ['id' => $eleve->id, 'is_archived' => true]);
    }

    public function test_les_erreurs_api_de_methode_non_autorisee_sont_json_et_en_francais(): void
    {
        $this->getJson('/api/v1/auth/login')
            ->assertStatus(405)
            ->assertJsonPath('message', 'Cette méthode HTTP n’est pas autorisée pour cette ressource.');
    }

    public function test_une_reinscription_annuelle_utilise_annee_et_classe_courantes(): void
    {
        $admin = User::factory()->role(Role::Admin)->create();
        $tuteur = Tuteur::create(['user_id' => User::factory()->role(Role::Tuteur)->create()->id]);
        $classe = $this->createCurrentYearClass();
        $eleve = Eleve::create([
            'matricule' => 'ELV-'.substr(AnneeScolaire::courante(), 0, 4).'-000098',
            'nom' => 'DIOP',
            'prenom' => 'Moussa',
            'sexe' => 'M',
        ]);
        $eleve->tuteurs()->attach($tuteur);

        $this->actingAs($admin)->postJson('/api/v1/inscriptions-annuelles', [
            'eleve_id' => $eleve->id,
            'classe_id' => $classe->id,
        ])->assertCreated()
            ->assertJsonPath('data.annee_scolaire', AnneeScolaire::courante())
            ->assertJsonPath('data.classe_id', $classe->id);

        $this->postJson('/api/v1/inscriptions-annuelles', [
            'eleve_id' => $eleve->id,
            'classe_id' => $classe->id,
        ])->assertUnprocessable()->assertJsonValidationErrors('eleve_id');

        $this->postJson('/api/v1/inscriptions-annuelles', [
            'eleve_id' => $eleve->id,
            'classe_id' => $classe->id,
            'annee_scolaire' => '1900-1901',
        ])->assertUnprocessable()->assertJsonValidationErrors('annee_scolaire');
    }

    public function test_tuteur_ne_peut_lire_que_la_synthese_de_son_enfant(): void
    {
        $user = User::factory()->role(Role::Tuteur)->create();
        $tuteur = Tuteur::create(['user_id' => $user->id]);
        $oustazUser = User::factory()->role(Role::Oustaz)->create();
        $oustaz = Oustaz::create(['user_id' => $oustazUser->id]);
        $classe = ClasseAcademique::create([
            'nom' => 'Classe progression',
            'niveau' => 'Débutant',
            'annee_scolaire' => AnneeScolaire::courante(),
            'oustaz_id' => $oustaz->id,
            'statut' => 'active',
        ]);
        $eleve = Eleve::create([
            'matricule' => 'ELV-'.substr(AnneeScolaire::courante(), 0, 4).'-000097',
            'nom' => 'BA',
            'prenom' => 'Aliou',
            'sexe' => 'M',
        ]);
        $eleve->tuteurs()->attach($tuteur);
        Inscription::create([
            'eleve_id' => $eleve->id,
            'classe_academique_id' => $classe->id,
            'annee_scolaire' => AnneeScolaire::courante(),
            'date_inscription' => now()->toDateString(),
            'statut' => 'active',
        ]);
        $fiche = FicheHebdomadaire::create([
            'eleve_id' => $eleve->id,
            'enseignant_id' => $oustazUser->id,
            'date_debut' => now()->startOfWeek()->toDateString(),
            'date_fin' => now()->toDateString(),
            'sourate_debut' => 'Al-Fatiha',
            'verset_debut' => 1,
            'sourate_fin' => 'Al-Baqara',
            'verset_fin' => 5,
        ]);
        Note::create([
            'fiche_hebdomadaire_id' => $fiche->id,
            'jour' => 'lundi',
            'nouvelle_lecon' => 'Très bien',
        ]);

        $this->actingAs($user)->getJson('/api/v1/tuteur/enfants/'.$eleve->id.'/synthese')
            ->assertOk()
            ->assertJsonPath('data.eleve.id', $eleve->id)
            ->assertJsonPath('data.progression.tendance', 'non_evalue')
            ->assertJsonPath('data.activite_hebdomadaire.0.notes.0.nouvelle_lecon', 'Très bien');

        $otherChild = Eleve::create([
            'matricule' => 'ELV-'.substr(AnneeScolaire::courante(), 0, 4).'-000096',
            'nom' => 'NDIAYE',
            'prenom' => 'Fatou',
            'sexe' => 'F',
        ]);
        $this->getJson('/api/v1/tuteur/enfants/'.$otherChild->id.'/synthese')
            ->assertForbidden()
            ->assertJsonPath('message', 'Cet élève n’est pas rattaché à votre compte.');
    }

    private function createCurrentYearClass(): ClasseAcademique
    {
        return ClasseAcademique::create([
            'nom' => 'Classe de test',
            'niveau' => 'Débutant',
            'annee_scolaire' => AnneeScolaire::courante(),
            'statut' => 'active',
        ]);
    }
}
