<?php

namespace Tests\Feature\Daara;

use App\Enums\Role;
use App\Models\ClasseAcademique;
use App\Models\Eleve;
use App\Models\Oustaz;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Inscription avec paiement dans le même formulaire, photos de profil
 * et réinitialisation du mot de passe par l'administrateur.
 */
class InscriptionPaiementPhotoTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private ClasseAcademique $classe;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-15 10:00:00');
        config(['paiements.mensualite_par_defaut' => 10000]);
        Storage::fake('public');

        $this->admin = User::factory()->role(Role::Admin)->create();
        // Frais d'inscription fixés pour la classe : 7 500 FCFA
        $this->classe = ClasseAcademique::create(['nom' => 'Halaqa Al-Falah', 'niveau' => 'Débutant', 'annee_scolaire' => '2026-2027', 'statut' => 'active', 'frais_inscription' => 7500]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /**
     * Vraie image PNG 1×1 (sans dépendre de l'extension GD pour la générer).
     * Le nom n'influence pas la validation : le type est lu dans le contenu.
     */
    private function photo(string $nom): UploadedFile
    {
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');

        return UploadedFile::fake()->createWithContent($nom, $png);
    }

    /** Données d'inscription minimales : élève + nouveau tuteur payeur. */
    private function inscription(array $extra = []): array
    {
        return [
            'nom' => 'Diop',
            'prenom' => 'Moussa',
            'sexe' => 'M',
            'classe_id' => $this->classe->id,
            'tuteurs' => [[
                'mode' => 'creer',
                'compte' => ['nom' => 'Diop', 'prenom' => 'Fatou', 'sexe' => 'F', 'telephone' => '77 555 44 33'],
                'est_payeur' => true,
            ]],
            ...$extra,
        ];
    }

    public function test_inscription_avec_frais_et_mensualites_produit_les_recus_dans_la_meme_requete(): void
    {
        $reponse = $this->actingAs($this->admin)->postJson('/api/v1/eleves', $this->inscription([
            'paiement' => [
                'mode_paiement' => 'wave',
                'frais_inscription' => true,
                'mensualites' => [
                    ['mois' => '2026-11', 'montant' => 10000],
                    ['mois' => '2026-12', 'montant' => 4000],
                ],
            ],
        ]))->assertCreated()
            // Montant de la classe, jamais celui saisi : reçu des frais émis immédiatement
            ->assertJsonPath('data.inscription.montant_inscription', 7500)
            ->assertJsonPath('data.inscription.mode_paiement', 'wave')
            ->assertJsonPath('data.recu_inscription.type', 'inscription')
            ->assertJsonPath('data.recu_inscription.montant', 7500)
            ->assertJsonPath('data.recu_inscription.classe', 'Halaqa Al-Falah')
            ->assertJsonCount(2, 'data.recus')
            ->assertJsonPath('data.recus.0.mois', '2026-11')
            ->assertJsonPath('data.recus.0.reste', 0)
            ->assertJsonPath('data.recus.1.reste', 6000)
            ->assertJsonPath('data.recus.1.mode_paiement', 'wave');

        $this->assertMatchesRegularExpression('/^REC-2026-\d{6}$/', $reponse->json('data.recus.0.numero_recu'));
        $this->assertMatchesRegularExpression('/^INS-2026-\d{6}$/', $reponse->json('data.recu_inscription.numero_recu'));

        // La rubrique Paiements voit immédiatement l'élève à jour pour novembre
        $this->actingAs($this->admin)->getJson('/api/v1/paiements?mois=2026-11')
            ->assertJsonPath('data.items.0.statut', 'paye');
        $this->actingAs($this->admin)->getJson('/api/v1/paiements?mois=2026-12')
            ->assertJsonPath('data.items.0.statut', 'partiel');
    }

    public function test_un_paiement_invalide_annule_toute_l_inscription(): void
    {
        // Octobre n'est pas dû (inscription en novembre) : rien ne doit être créé
        $this->actingAs($this->admin)->postJson('/api/v1/eleves', $this->inscription([
            'photo' => $this->photo('moussa.jpg'),
            'paiement' => ['mode_paiement' => 'especes', 'mensualites' => [
                ['mois' => '2026-11', 'montant' => 10000],
                ['mois' => '2026-10', 'montant' => 10000],
            ]],
        ]))->assertUnprocessable()
            ->assertJsonValidationErrors('paiement.mensualites.1.mois');

        // Montant supérieur à la mensualité
        $this->actingAs($this->admin)->postJson('/api/v1/eleves', $this->inscription([
            'paiement' => ['mode_paiement' => 'especes', 'mensualites' => [['mois' => '2026-11', 'montant' => 15000]]],
        ]))->assertJsonValidationErrors('paiement.mensualites.0.montant');

        $this->assertDatabaseCount('eleves', 0);
        $this->assertDatabaseCount('paiements', 0);
        $this->assertDatabaseMissing('users', ['telephone' => '+221775554433']);
        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    public function test_validations_du_bloc_paiement(): void
    {
        $this->actingAs($this->admin)->postJson('/api/v1/eleves', $this->inscription(['paiement' => ['frais_inscription' => true]]))
            ->assertJsonValidationErrors('paiement.mode_paiement');
        // Le montant des frais n'est jamais saisi : un montant est refusé
        $this->actingAs($this->admin)->postJson('/api/v1/eleves', $this->inscription(['paiement' => ['mode_paiement' => 'especes', 'frais_inscription' => 5000]]))
            ->assertJsonValidationErrors('paiement.frais_inscription');
        $this->actingAs($this->admin)->postJson('/api/v1/eleves', $this->inscription(['paiement' => ['mode_paiement' => 'especes']]))
            ->assertJsonValidationErrors('paiement');
        $this->actingAs($this->admin)->postJson('/api/v1/eleves', $this->inscription(['paiement' => ['mode_paiement' => 'especes', 'mensualites' => [
            ['mois' => '2026-11', 'montant' => 5000],
            ['mois' => '2026-11', 'montant' => 5000],
        ]]]))->assertJsonValidationErrors('paiement.mensualites.0.mois');
    }

    public function test_inscription_sans_paiement_reste_possible(): void
    {
        $this->actingAs($this->admin)->postJson('/api/v1/eleves', $this->inscription())
            ->assertCreated()
            ->assertJsonPath('data.recus', [])
            ->assertJsonPath('data.inscription.montant_inscription', null)
            ->assertJsonPath('data.eleve.photo', null);
    }

    public function test_photo_prise_a_l_inscription_en_multipart(): void
    {
        // Multipart : les booléens arrivent en texte
        $donnees = $this->inscription(['photo' => $this->photo('moussa.jpg')]);
        $donnees['tuteurs'][0]['est_payeur'] = 'true';

        $reponse = $this->actingAs($this->admin)->post('/api/v1/eleves', $donnees, ['Accept' => 'application/json'])
            ->assertCreated();

        $eleve = Eleve::firstOrFail();
        $this->assertNotNull($eleve->photo);
        Storage::disk('public')->assertExists($eleve->photo);
        $this->assertStringEndsWith('/storage/'.$eleve->photo, $reponse->json('data.eleve.photo'));
        $this->assertTrue((bool) $eleve->tuteurs()->first()->pivot->est_payeur);

        // Visible dans la fiche élève
        $this->actingAs($this->admin)->getJson("/api/v1/eleves/{$eleve->id}")
            ->assertJsonPath('data.photo', $reponse->json('data.eleve.photo'));
    }

    public function test_remplacer_la_photo_d_un_eleve_supprime_l_ancienne(): void
    {
        $this->actingAs($this->admin)->post('/api/v1/eleves', $this->inscription(['photo' => $this->photo('a.jpg')]), ['Accept' => 'application/json']);
        $eleve = Eleve::firstOrFail();
        $ancienne = $eleve->photo;

        $this->actingAs($this->admin)->post("/api/v1/eleves/{$eleve->id}/photo", ['photo' => $this->photo('b.png')], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('message', 'Photo enregistrée.');

        Storage::disk('public')->assertMissing($ancienne);
        Storage::disk('public')->assertExists($eleve->fresh()->photo);

        // Fichier non image / trop lourd refusés
        $this->actingAs($this->admin)->post("/api/v1/eleves/{$eleve->id}/photo", ['photo' => UploadedFile::fake()->create('cv.pdf', 10, 'application/pdf')], ['Accept' => 'application/json'])
            ->assertJsonValidationErrors('photo');
        $this->actingAs($this->admin)->post("/api/v1/eleves/{$eleve->id}/photo", ['photo' => $this->photo('grande.jpg')->size(3000)], ['Accept' => 'application/json'])
            ->assertJsonValidationErrors('photo');
    }

    public function test_photo_d_un_oustaz_a_la_creation_et_visible_par_ses_eleves(): void
    {
        $reponse = $this->actingAs($this->admin)->post('/api/v1/admin/users', [
            'nom' => 'Ndiaye', 'prenom' => 'Oumar', 'sexe' => 'M', 'telephone' => '77 600 00 01', 'role' => 'oustaz',
            'photo' => $this->photo('oustaz.jpg'),
        ], ['Accept' => 'application/json'])->assertCreated();

        $oustaz = User::where('telephone', '+221776000001')->firstOrFail();
        Storage::disk('public')->assertExists($oustaz->photo);
        $this->assertNotNull($reponse->json('data.photo'));

        // Remplacement par la route dédiée
        $this->actingAs($this->admin)->post("/api/v1/admin/users/{$oustaz->id}/photo", ['photo' => $this->photo('nouvelle.jpg')], ['Accept' => 'application/json'])
            ->assertOk();
        $this->assertNotSame($oustaz->photo, $oustaz->fresh()->photo);

        // L'oustaz voit la photo de ses élèves (utile pour l'appel)
        $this->classe->update(['oustaz_id' => Oustaz::where('user_id', $oustaz->id)->value('id')]);
        $this->actingAs($this->admin)->post('/api/v1/eleves', $this->inscription(['photo' => $this->photo('e.jpg')]), ['Accept' => 'application/json']);
        $oustaz->forceFill(['must_change_password' => false])->save();
        $this->actingAs($oustaz->fresh())->getJson('/api/v1/oustaz/me/classes')
            ->assertOk()
            ->assertJsonPath('data.0.eleves.0.photo', fn ($url) => is_string($url) && str_contains($url, '/storage/photos/eleves/'));
    }

    public function test_le_tableau_de_bord_fournit_tarifs_mois_dus_et_photos_au_formulaire(): void
    {
        $this->classe->update(['mensualite' => 12500]);
        $this->actingAs($this->admin)->post('/api/v1/eleves', $this->inscription(['photo' => $this->photo('e.png')]), ['Accept' => 'application/json']);

        $reponse = $this->actingAs($this->admin)->getJson('/api/v1/admin/dashboard?section=eleves')
            ->assertOk()
            ->assertJsonPath('data.options.classes.0.mensualite', 12500)
            ->assertJsonPath('data.options.paiement.devise', 'FCFA');

        // Mi-novembre : octobre n'est plus proposé, novembre → juillet le sont
        $mois = $reponse->json('data.options.paiement.mois');
        $this->assertSame('2026-11', $mois[0]);
        $this->assertSame('2027-07', end($mois));
        $this->assertContains('wave', $reponse->json('data.options.paiement.modes'));
        $this->assertStringContainsString('/storage/photos/eleves/', $reponse->json('data.items.0.photo'));
    }

    public function test_seul_l_admin_peut_changer_une_photo(): void
    {
        $tuteur = User::factory()->role(Role::Tuteur)->create();

        $this->actingAs($tuteur)->post("/api/v1/admin/users/{$tuteur->id}/photo", ['photo' => $this->photo('x.jpg')], ['Accept' => 'application/json'])
            ->assertForbidden();
    }

    public function test_reinitialisation_du_mot_de_passe_par_l_admin(): void
    {
        $oustaz = User::factory()->role(Role::Oustaz)->create(['telephone' => '771112233', 'password' => 'monSecret6']);
        $oustaz->createToken('api');

        $this->actingAs($this->admin)->postJson("/api/v1/admin/users/{$oustaz->id}/reset-password")
            ->assertOk()
            ->assertJsonPath('data.must_change_password', true);

        $oustaz->refresh();
        $this->assertTrue($oustaz->must_change_password);
        $this->assertTrue(Hash::check('passer', $oustaz->password));
        $this->assertSame(0, $oustaz->tokens()->count());
        $this->assertDatabaseHas('audit_events', ['action' => 'user.password_reset', 'entity_id' => $oustaz->id]);

        // L'ancien mot de passe ne marche plus ; « passer » donne un jeton de changement
        $this->postJson('/api/v1/auth/login', ['telephone' => '771112233', 'password' => 'monSecret6'])->assertUnauthorized();
        $this->postJson('/api/v1/auth/login', ['telephone' => '771112233', 'password' => 'passer'])
            ->assertOk()
            ->assertJsonPath('must_change_password', true)
            ->assertJsonPath('next_action', 'change_password');
    }

    public function test_reinitialisation_refusee_pour_soi_meme_un_compte_archive_ou_un_non_admin(): void
    {
        $this->actingAs($this->admin)->postJson("/api/v1/admin/users/{$this->admin->id}/reset-password")
            ->assertJsonValidationErrors('user');

        $archive = User::factory()->role(Role::Tuteur)->create();
        $archive->forceFill(['is_archived' => true])->save();
        $this->actingAs($this->admin)->postJson("/api/v1/admin/users/{$archive->id}/reset-password")
            ->assertJsonValidationErrors('user');

        $tuteur = User::factory()->role(Role::Tuteur)->create();
        $this->actingAs($tuteur)->postJson("/api/v1/admin/users/{$archive->id}/reset-password")->assertForbidden();
        $this->actingAs($this->admin)->postJson('/api/v1/admin/users/999999/reset-password')->assertNotFound();
    }
}
