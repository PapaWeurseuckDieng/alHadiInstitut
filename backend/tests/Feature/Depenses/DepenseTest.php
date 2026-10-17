<?php

namespace Tests\Feature\Depenses;

use App\Enums\Role;
use App\Models\ClasseAcademique;
use App\Models\Depense;
use App\Models\Eleve;
use App\Models\Inscription;
use App\Models\Paiement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Dépenses : saisie, correction, validation/rejet, totaux et solde de la période.
 */
class DepenseTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-15 10:00:00');
        $this->admin = User::factory()->role(Role::Admin)->create();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function creer(array $donnees = [])
    {
        return $this->actingAs($this->admin)->postJson('/api/v1/depenses', [
            'categorie' => 'fournitures',
            'description' => 'Corans et cahiers',
            'montant' => 25000,
            'mode_paiement' => 'especes',
            'beneficiaire' => 'Librairie Al-Maarif',
            'date_depense' => '2026-11-10',
            ...$donnees,
        ]);
    }

    public function test_une_depense_est_creee_en_attente_avec_l_annee_scolaire_calculee(): void
    {
        $this->creer()
            ->assertCreated()
            ->assertJsonPath('data.statut', 'en_attente')
            ->assertJsonPath('data.annee_scolaire', '2026-2027')
            ->assertJsonPath('data.montant', 25000)
            ->assertJsonPath('data.enregistree_par', $this->admin->prenom.' '.$this->admin->nom);

        $this->assertDatabaseHas('audit_events', ['action' => 'depense.created']);
    }

    public function test_validations_de_saisie(): void
    {
        $this->actingAs($this->admin)->postJson('/api/v1/depenses', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['categorie', 'montant']);

        $this->creer(['categorie' => 'voyage'])->assertJsonValidationErrors('categorie');
        $this->creer(['categorie' => 'autre', 'description' => null])->assertJsonValidationErrors('description');
        $this->creer(['date_depense' => '2026-12-01'])->assertJsonValidationErrors('date_depense');
        $this->creer(['statut' => 'validee'])->assertJsonValidationErrors('statut');
        $this->creer(['annee_scolaire' => '2025-2026'])->assertJsonValidationErrors('annee_scolaire');

        $this->assertDatabaseCount('depenses', 0);
    }

    public function test_seule_une_depense_en_attente_peut_etre_modifiee_puis_traitee_une_fois(): void
    {
        $id = $this->creer()->json('data.id');

        $this->actingAs($this->admin)->patchJson("/api/v1/depenses/$id", ['montant' => 30000, 'date_depense' => '2026-09-20'])
            ->assertOk()
            ->assertJsonPath('data.montant', 30000)
            // Date de septembre : l'année scolaire suit la date
            ->assertJsonPath('data.annee_scolaire', '2025-2026');

        $this->actingAs($this->admin)->postJson("/api/v1/depenses/$id/valider")
            ->assertOk()
            ->assertJsonPath('data.statut', 'validee')
            ->assertJsonPath('data.traitee_par', $this->admin->prenom.' '.$this->admin->nom);

        $this->actingAs($this->admin)->patchJson("/api/v1/depenses/$id", ['montant' => 1])
            ->assertStatus(409)
            ->assertJsonPath('message', 'Seule une dépense en attente peut être modifiée.');
        $this->actingAs($this->admin)->postJson("/api/v1/depenses/$id/rejeter", ['motif' => 'Erreur'])
            ->assertStatus(409)
            ->assertJsonPath('message', 'Cette dépense a déjà été traitée.');
    }

    public function test_le_rejet_exige_un_motif_et_conserve_la_depense(): void
    {
        $id = $this->creer()->json('data.id');

        $this->actingAs($this->admin)->postJson("/api/v1/depenses/$id/rejeter")
            ->assertJsonValidationErrors('motif');

        $this->actingAs($this->admin)->postJson("/api/v1/depenses/$id/rejeter", ['motif' => 'Facture en double'])
            ->assertOk()
            ->assertJsonPath('data.statut', 'rejetee')
            ->assertJsonPath('data.motif_rejet', 'Facture en double');

        $this->assertDatabaseHas('depenses', ['id' => $id, 'statut' => 'rejetee']);
    }

    public function test_totaux_par_categorie_et_solde_ne_comptent_que_les_depenses_validees(): void
    {
        $loyer = $this->creer(['categorie' => 'loyer', 'montant' => 100000, 'date_depense' => '2026-11-01', 'beneficiaire' => 'Propriétaire'])->json('data.id');
        $fournitures = $this->creer(['montant' => 20000])->json('data.id');
        $this->creer(['montant' => 5000]); // reste en attente
        $rejetee = $this->creer(['montant' => 999])->json('data.id');
        $this->creer(['montant' => 7000, 'date_depense' => '2026-10-05']); // autre mois

        $this->actingAs($this->admin)->postJson("/api/v1/depenses/$loyer/valider");
        $this->actingAs($this->admin)->postJson("/api/v1/depenses/$fournitures/valider");
        $this->actingAs($this->admin)->postJson("/api/v1/depenses/$rejetee/rejeter", ['motif' => 'Doublon']);

        // Recettes de novembre : 1 mensualité de 10 000 + 3 000 de frais d'inscription
        $classe = ClasseAcademique::create(['nom' => 'Halaqa A', 'niveau' => 'Débutant', 'annee_scolaire' => '2026-2027', 'statut' => 'active']);
        $eleve = Eleve::create(['matricule' => 'ELV-2026-000001', 'nom' => 'Sarr', 'prenom' => 'Awa', 'statut' => 'actif']);
        $inscription = Inscription::create([
            'eleve_id' => $eleve->id, 'classe_academique_id' => $classe->id, 'annee_scolaire' => '2026-2027',
            'date_inscription' => '2026-11-02', 'statut' => 'active', 'montant_inscription' => 3000, 'mode_paiement' => 'especes',
        ]);
        Paiement::create([
            'eleve_id' => $eleve->id, 'inscription_id' => $inscription->id, 'annee_scolaire' => '2026-2027', 'mois' => '2026-11',
            'montant_du' => 10000, 'montant' => 10000, 'mode_paiement' => 'especes', 'date_paiement' => '2026-11-03',
        ]);

        $this->actingAs($this->admin)->getJson('/api/v1/depenses?mois=2026-11')
            ->assertOk()
            ->assertJsonPath('data.periode', ['type' => 'mois', 'valeur' => '2026-11'])
            ->assertJsonPath('data.stats.total_valide', 120000)
            ->assertJsonPath('data.stats.total_en_attente', 5000)
            ->assertJsonPath('data.stats.nombre_en_attente', 1)
            ->assertJsonPath('data.stats.par_categorie.0', ['categorie' => 'loyer', 'total' => 100000])
            ->assertJsonPath('data.stats.recettes', ['mensualites' => 10000, 'frais_inscription' => 3000, 'total' => 13000])
            ->assertJsonPath('data.stats.solde', -107000)
            ->assertJsonCount(4, 'data.items')
            ->assertJsonPath('data.pagination.total', 4);

        // Filtres et année scolaire complète (par défaut)
        $this->actingAs($this->admin)->getJson('/api/v1/depenses?statut=en_attente')
            ->assertJsonCount(2, 'data.items')
            ->assertJsonPath('data.periode.valeur', '2026-2027');
        $this->actingAs($this->admin)->getJson('/api/v1/depenses?categorie=loyer&mois=2026-11')->assertJsonCount(1, 'data.items');
        $this->actingAs($this->admin)->getJson('/api/v1/depenses?q=Maarif&mois=2026-11')->assertJsonCount(3, 'data.items');
    }

    public function test_seul_l_administrateur_gere_les_depenses(): void
    {
        $this->getJson('/api/v1/depenses')->assertUnauthorized();

        $oustaz = User::factory()->role(Role::Oustaz)->create();
        $depense = Depense::create(['categorie' => 'loyer', 'montant' => 1000, 'date_depense' => '2026-11-01', 'statut' => 'en_attente']);

        $this->actingAs($oustaz)->getJson('/api/v1/depenses')->assertForbidden();
        $this->actingAs($oustaz)->postJson('/api/v1/depenses', ['categorie' => 'loyer', 'montant' => 1])->assertForbidden();
        $this->actingAs($oustaz)->postJson("/api/v1/depenses/{$depense->id}/valider")->assertForbidden();
    }
}
