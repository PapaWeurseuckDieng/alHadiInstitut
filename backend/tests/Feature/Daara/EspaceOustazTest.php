<?php

namespace Tests\Feature\Daara;

use App\Enums\Role;
use App\Models\ClasseAcademique;
use App\Models\Eleve;
use App\Models\Inscription;
use App\Models\Oustaz;
use App\Models\Planning;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Compléments API de l'espace Oustaz : appel un jour sans cours, liste complète
 * d'une classe et lecture de l'exemplarité saisie.
 */
class EspaceOustazTest extends TestCase
{
    use RefreshDatabase;

    private User $oustaz;

    private ClasseAcademique $classe;

    protected function setUp(): void
    {
        parent::setUp();
        // Mercredi 14 octobre 2026
        Carbon::setTestNow('2026-10-14 10:00:00');
        $this->oustaz = User::factory()->role(Role::Oustaz)->create();
        $profil = Oustaz::create(['user_id' => $this->oustaz->id]);
        $this->classe = ClasseAcademique::create(['nom' => 'Halaqa A', 'niveau' => 'Débutant', 'annee_scolaire' => '2026-2027', 'statut' => 'active', 'oustaz_id' => $profil->id]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function eleves(int $nombre): void
    {
        for ($i = 1; $i <= $nombre; $i++) {
            $eleve = Eleve::create(['matricule' => sprintf('ELV-2026-%06d', $i), 'nom' => 'Eleve'.str_pad((string) $i, 2, '0', STR_PAD_LEFT), 'prenom' => 'Test', 'statut' => 'actif']);
            Inscription::create(['eleve_id' => $eleve->id, 'classe_academique_id' => $this->classe->id, 'annee_scolaire' => '2026-2027', 'date_inscription' => '2026-10-01', 'statut' => 'active']);
        }
    }

    public function test_l_appel_un_jeudi_ou_vendredi_renvoie_une_erreur_claire(): void
    {
        $this->eleves(1);
        $seance = Planning::create(['classe_academique_id' => $this->classe->id, 'jour_semaine' => 'samedi', 'date' => '2026-10-17', 'heure_debut' => '08:00', 'heure_fin' => '10:00', 'activite' => 'Hifz']);

        // 15 octobre 2026 = jeudi
        $this->actingAs($this->oustaz)->getJson("/api/v1/plannings/{$seance->id}/presences?date_cours=2026-10-15")
            ->assertUnprocessable()
            ->assertJsonValidationErrors('date_cours');
        $this->actingAs($this->oustaz)->putJson("/api/v1/plannings/{$seance->id}/presences", [
            'date_cours' => '2026-10-16',
            'presences' => [['eleve_id' => Eleve::firstOrFail()->id, 'statut' => 'present']],
        ])->assertJsonValidationErrors('date_cours');
    }

    public function test_la_liste_des_eleves_d_une_classe_peut_tout_renvoyer(): void
    {
        $this->eleves(25);

        $this->actingAs($this->oustaz)->getJson("/api/v1/classes/{$this->classe->id}/eleves")
            ->assertOk()->assertJsonCount(20, 'data');
        $this->actingAs($this->oustaz)->getJson("/api/v1/classes/{$this->classe->id}/eleves?per_page=200")
            ->assertOk()->assertJsonCount(25, 'data');
        $this->actingAs($this->oustaz)->getJson("/api/v1/classes/{$this->classe->id}/eleves?per_page=500")
            ->assertJsonValidationErrors('per_page');
    }

    public function test_l_oustaz_relit_l_exemplarite_saisie_pour_sa_classe(): void
    {
        $this->eleves(2);
        $eleve = Eleve::where('nom', 'Eleve01')->firstOrFail();

        $this->actingAs($this->oustaz)->getJson("/api/v1/classes/{$this->classe->id}/exemplarite?mois=2026-10")
            ->assertOk()
            ->assertJsonPath('data.mois', '2026-10')
            ->assertJsonCount(5, 'data.criteres')
            ->assertJsonCount(2, 'data.eleves')
            ->assertJsonPath('data.eleves.0.evaluation', null);

        $notes = ['assiduite_ponctualite' => 4, 'discipline_comportement' => 3, 'proprete_hygiene' => 4, 'camaraderie_respect' => 2, 'prieres_devotion' => 3];
        $this->actingAs($this->oustaz)->postJson("/api/v1/eleves/{$eleve->id}/exemplarite", ['mois' => '2026-10', ...$notes])->assertOk();

        $this->actingAs($this->oustaz)->getJson("/api/v1/classes/{$this->classe->id}/exemplarite?mois=2026-10")
            ->assertJsonPath('data.eleves.0.eleve_id', $eleve->id)
            ->assertJsonPath('data.eleves.0.evaluation', $notes)
            ->assertJsonPath('data.eleves.0.score.exemplarite_sur_100', 80)
            ->assertJsonPath('data.eleves.1.evaluation', null);

        // Un autre mois : rien de saisi
        $this->actingAs($this->oustaz)->getJson("/api/v1/classes/{$this->classe->id}/exemplarite?mois=2026-11")
            ->assertJsonPath('data.eleves.0.evaluation', null);
    }

    public function test_eleve_du_mois_classe_les_eleves_complets_et_explique_les_autres(): void
    {
        $this->eleves(2);
        [$awa, $autre] = Eleve::orderBy('nom')->get()->all();
        $admin = User::factory()->role(Role::Admin)->create();
        $notes = ['mois' => '2026-10', 'assiduite_ponctualite' => 4, 'discipline_comportement' => 4, 'proprete_hygiene' => 4, 'camaraderie_respect' => 4, 'prieres_devotion' => 4];

        // Élève 1 : fiche validée (objectif couvert) + récitation + exemplarité → classé
        $fiche = $this->actingAs($this->oustaz)->postJson('/api/v1/fiches-hebdomadaires', [
            'eleve_id' => $awa->id, 'date_debut' => '2026-10-10', 'date_fin' => '2026-10-14',
            'sourate_debut_id' => 67, 'verset_debut' => 1, 'sourate_fin_id' => 67, 'verset_fin' => 10,
        ])->assertCreated()->json('data.id');
        $this->actingAs($this->oustaz)->putJson("/api/v1/fiches-hebdomadaires/$fiche/jours/samedi", [
            'reperes' => ['D' => ['sourate_debut_id' => 67, 'verset_debut' => 1, 'sourate_fin_id' => 67, 'verset_fin' => 10]],
            'qualite_recitation' => 4,
        ])->assertOk();
        $this->actingAs($this->oustaz)->postJson("/api/v1/fiches-hebdomadaires/$fiche/valider")->assertOk();
        $this->actingAs($this->oustaz)->postJson("/api/v1/eleves/{$awa->id}/exemplarite", $notes)->assertOk();

        // Élève 2 : exemplarité seule → non classé, avec les composantes manquantes
        $this->actingAs($this->oustaz)->postJson("/api/v1/eleves/{$autre->id}/exemplarite", $notes)->assertOk();

        $this->actingAs($admin)->getJson('/api/v1/admin/eleve-du-mois?mois=2026-10')
            ->assertOk()
            ->assertJsonPath('data.gagnant.rang', 1)
            ->assertJsonPath('data.gagnant.eleve.id', $awa->id)
            ->assertJsonPath('data.gagnant.eleve.classe', 'Halaqa A')
            ->assertJsonPath('data.gagnant.score_total', 100)
            ->assertJsonCount(1, 'data.classement')
            ->assertJsonPath('data.non_classes.0.eleve.id', $autre->id)
            ->assertJsonPath('data.non_classes.0.manque', ['objectifs', 'recitation']);

        $this->actingAs($admin)->getJson('/api/v1/admin/eleve-du-mois?mois=octobre')->assertJsonValidationErrors('mois');
    }

    public function test_le_detail_d_un_compte_donne_profession_ou_specialite(): void
    {
        $admin = User::factory()->role(Role::Admin)->create();
        $this->oustaz->oustaz()->update(['specialite' => 'Tajwid']);

        $this->actingAs($admin)->getJson("/api/v1/admin/users/{$this->oustaz->id}")
            ->assertOk()
            ->assertJsonPath('data.specialite', 'Tajwid')
            ->assertJsonPath('data.profession', null);
    }

    public function test_un_oustaz_ne_lit_pas_l_exemplarite_d_une_autre_classe(): void
    {
        $autre = User::factory()->role(Role::Oustaz)->create();
        Oustaz::create(['user_id' => $autre->id]);

        $this->actingAs($autre)->getJson("/api/v1/classes/{$this->classe->id}/exemplarite")->assertForbidden();
        $this->actingAs(User::factory()->role(Role::Tuteur)->create())->getJson("/api/v1/classes/{$this->classe->id}/exemplarite")->assertForbidden();
    }
}
