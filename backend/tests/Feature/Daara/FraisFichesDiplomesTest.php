<?php

namespace Tests\Feature\Daara;

use App\Enums\Role;
use App\Models\ClasseAcademique;
use App\Models\Eleve;
use App\Models\Inscription;
use App\Models\Oustaz;
use App\Models\Paiement;
use App\Models\Tuteur;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Frais d'inscription fixés par classe et leurs reçus (consultables par le tuteur),
 * recherche de tuteurs, circuit des fiches (l'oustaz valide, l'administration rouvre),
 * Élève du mois par classe et diplômes.
 */
class FraisFichesDiplomesTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $oustaz;

    private ClasseAcademique $classe;

    protected function setUp(): void
    {
        parent::setUp();
        // Mercredi 14 octobre 2026
        Carbon::setTestNow('2026-10-14 10:00:00');
        config(['paiements.mensualite_par_defaut' => 10000, 'paiements.frais_inscription_par_defaut' => 5000]);
        $this->admin = User::factory()->role(Role::Admin)->create();
        $this->oustaz = User::factory()->role(Role::Oustaz)->create(['prenom' => 'Cheikh', 'nom' => 'Fall']);
        $profil = Oustaz::create(['user_id' => $this->oustaz->id]);
        $this->classe = ClasseAcademique::create(['nom' => 'Halaqa A', 'niveau' => 'Débutant', 'annee_scolaire' => '2026-2027', 'statut' => 'active', 'oustaz_id' => $profil->id]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** Élève inscrit dans une classe, avec un tuteur (créé si absent). */
    private function eleve(string $prenom, ?ClasseAcademique $classe = null, ?Tuteur $tuteur = null): array
    {
        static $numero = 0;
        $numero++;
        $eleve = Eleve::create(['matricule' => sprintf('ELV-2026-%06d', $numero), 'nom' => 'Ba', 'prenom' => $prenom, 'statut' => 'actif']);
        $inscription = Inscription::create(['eleve_id' => $eleve->id, 'classe_academique_id' => ($classe ?? $this->classe)->id, 'annee_scolaire' => '2026-2027', 'date_inscription' => '2026-10-01', 'statut' => 'active']);
        $tuteur ??= Tuteur::create(['user_id' => User::factory()->role(Role::Tuteur)->create()->id]);
        $eleve->tuteurs()->attach($tuteur->id, ['est_payeur' => true]);

        return [$eleve, $inscription, $tuteur];
    }

    public function test_frais_d_inscription_fixes_par_classe_et_recus_du_tuteur(): void
    {
        [$eleve, $inscription, $tuteur] = $this->eleve('Awa');
        [, $autreInscription] = $this->eleve('Fatou');

        // Montant de la classe fixé dans les tarifs ; la mensualité n'est pas touchée
        $this->actingAs($this->admin)->putJson('/api/v1/paiements/tarifs', ['tarifs' => [['classe_id' => $this->classe->id, 'frais_inscription' => 8000]]])->assertOk();
        $this->actingAs($this->admin)->getJson('/api/v1/paiements/tarifs')
            ->assertJsonPath('data.defaut_frais_inscription', 5000)
            ->assertJsonPath('data.classes.0.frais_inscription_appliques', 8000)
            ->assertJsonPath('data.classes.0.mensualite_appliquee', 10000);

        // Encaissement après l'inscription : reçu INS-… au montant de la classe
        $recu = $this->actingAs($this->admin)->postJson("/api/v1/inscriptions-annuelles/{$inscription->id}/frais-inscription", ['mode_paiement' => 'especes'])
            ->assertCreated()
            ->assertJsonPath('data.montant', 8000)
            ->assertJsonPath('data.reste', 0)
            ->assertJsonPath('data.libelle', 'Frais d’inscription 2026-2027');
        $this->assertMatchesRegularExpression('/^INS-2026-\d{6}$/', $recu->json('data.numero_recu'));
        $this->actingAs($this->admin)->postJson("/api/v1/inscriptions-annuelles/{$inscription->id}/frais-inscription", ['mode_paiement' => 'especes'])
            ->assertJsonValidationErrors('frais_inscription');
        $this->actingAs($this->admin)->getJson("/api/v1/eleves/{$eleve->id}")
            ->assertJsonPath('data.inscriptions.0.frais_payes', true)
            ->assertJsonPath('data.inscriptions.0.frais_inscription', 8000);

        // Une mensualité pour l'élève, une autre pour un enfant qui n'est pas le sien
        $mensualite = $this->actingAs($this->admin)->postJson('/api/v1/paiements', ['eleve_id' => $eleve->id, 'mois' => '2026-10', 'montant' => 10000, 'mode_paiement' => 'wave'])->assertCreated();
        $this->actingAs($this->admin)->postJson("/api/v1/inscriptions-annuelles/{$autreInscription->id}/frais-inscription", ['mode_paiement' => 'especes'])->assertCreated();

        // Le tuteur voit tous ses reçus et ouvre leur détail, mais pas ceux des autres familles
        $parent = User::find($tuteur->user_id);
        $this->actingAs($parent)->getJson('/api/v1/tuteur/me/recus')
            ->assertOk()
            ->assertJsonCount(2, 'data.recus')
            ->assertJsonPath('data.total_paye', 18000);
        $this->actingAs($parent)->getJson("/api/v1/inscriptions-annuelles/{$inscription->id}/recu")->assertOk()->assertJsonPath('data.eleve.prenom', 'Awa');
        $this->actingAs($parent)->getJson('/api/v1/paiements/'.$mensualite->json('data.id').'/recu')->assertOk()->assertJsonPath('data.type', 'mensualite');
        $this->actingAs($parent)->getJson("/api/v1/inscriptions-annuelles/{$autreInscription->id}/recu")->assertForbidden();
        $autrePaiement = Paiement::create(['eleve_id' => $autreInscription->eleve_id, 'inscription_id' => $autreInscription->id, 'annee_scolaire' => '2026-2027', 'mois' => '2026-10', 'montant_du' => 10000, 'montant' => 10000, 'mode_paiement' => 'especes', 'date_paiement' => '2026-10-10']);
        $this->actingAs($parent)->getJson("/api/v1/paiements/{$autrePaiement->id}/recu")->assertForbidden();
        // Annuler un reçu reste réservé à l'administration
        $this->actingAs($parent)->postJson("/api/v1/paiements/{$autrePaiement->id}/annuler", ['motif' => 'Erreur'])->assertForbidden();
    }

    public function test_recherche_de_tuteurs_par_nom_avec_homonymes_distingues_par_le_telephone(): void
    {
        $homonyme1 = Tuteur::create(['user_id' => User::factory()->role(Role::Tuteur)->create(['prenom' => 'Moussa', 'nom' => 'Diop', 'telephone' => '+221771110001'])->id]);
        Tuteur::create(['user_id' => User::factory()->role(Role::Tuteur)->create(['prenom' => 'Moussa', 'nom' => 'DIOP', 'telephone' => '+221771110002'])->id]);
        Tuteur::create(['user_id' => User::factory()->role(Role::Tuteur)->create(['prenom' => 'Aminata', 'nom' => 'Diop', 'telephone' => '+221771110003'])->id]);
        [$eleve] = $this->eleve('Ndeye', null, $homonyme1);

        $resultats = $this->actingAs($this->admin)->getJson('/api/v1/admin/tuteurs?q=moussa diop')->assertOk()->assertJsonCount(2, 'data');
        $this->assertSame([true, true], $resultats->json('data.*.homonyme'));
        $this->assertEqualsCanonicalizing(['+221771110001', '+221771110002'], $resultats->json('data.*.telephone'));
        $this->assertContains(['Ndeye Ba'], $resultats->json('data.*.enfants'));

        $this->actingAs($this->admin)->getJson('/api/v1/admin/tuteurs?q=Aminata')->assertJsonCount(1, 'data')->assertJsonPath('data.0.homonyme', false);
        $this->actingAs($this->admin)->getJson('/api/v1/admin/tuteurs?q=110002')->assertJsonCount(1, 'data');
        // Rattachement : le tuteur déjà lié à l'élève est écarté
        $this->actingAs($this->admin)->getJson("/api/v1/admin/tuteurs?q=moussa&exclure_eleve_id={$eleve->id}")->assertJsonCount(1, 'data');
        $this->actingAs($this->oustaz)->getJson('/api/v1/admin/tuteurs?q=moussa')->assertForbidden();
    }

    public function test_seul_l_oustaz_remplit_et_valide_la_fiche_l_administration_rouvre(): void
    {
        [$eleve] = $this->eleve('Awa');
        $fiche = ['eleve_id' => $eleve->id, 'date_debut' => '2026-10-10', 'date_fin' => '2026-10-14', 'sourate_debut_id' => 67, 'verset_debut' => 1, 'sourate_fin_id' => 67, 'verset_fin' => 10];
        $jour = ['reperes' => ['D' => ['sourate_debut_id' => 67, 'verset_debut' => 1, 'sourate_fin_id' => 67, 'verset_fin' => 10]], 'qualite_recitation' => 3];

        // L'administration ne crée ni ne remplit de fiche
        $this->actingAs($this->admin)->postJson('/api/v1/fiches-hebdomadaires', $fiche)->assertForbidden();
        $id = $this->actingAs($this->oustaz)->postJson('/api/v1/fiches-hebdomadaires', $fiche)->assertCreated()->json('data.id');
        $this->actingAs($this->admin)->putJson("/api/v1/fiches-hebdomadaires/$id/jours/samedi", $jour)->assertForbidden();

        // Validation : au moins un jour saisi
        $this->actingAs($this->oustaz)->postJson("/api/v1/fiches-hebdomadaires/$id/valider")->assertJsonValidationErrors('statut');
        $this->actingAs($this->oustaz)->putJson("/api/v1/fiches-hebdomadaires/$id/jours/samedi", $jour)->assertOk();
        $this->actingAs($this->oustaz)->postJson("/api/v1/fiches-hebdomadaires/$id/valider")
            ->assertOk()->assertJsonPath('data.statut', 'validee')->assertJsonPath('data.valide_par', 'Cheikh Fall');

        // Fiche validée : figée pour l'oustaz, qui demande une modification
        $this->actingAs($this->oustaz)->putJson("/api/v1/fiches-hebdomadaires/$id/jours/dimanche", $jour)->assertJsonValidationErrors('statut');
        $this->actingAs($this->oustaz)->postJson("/api/v1/fiches-hebdomadaires/$id/demander-modification", ['motif' => 'Erreur de verset'])
            ->assertOk()->assertJsonPath('data.motif_demande_modification', 'Erreur de verset');
        $this->actingAs($this->oustaz)->postJson("/api/v1/fiches-hebdomadaires/$id/demander-modification")->assertJsonValidationErrors('statut');

        // L'administration voit la demande, consulte la fiche et autorise la modification
        $this->actingAs($this->admin)->getJson('/api/v1/fiches-hebdomadaires?demande_modification=1')->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $id);
        $this->actingAs($this->admin)->getJson("/api/v1/fiches-hebdomadaires/$id")->assertOk()->assertJsonPath('data.enseignant', 'Cheikh Fall');
        $this->actingAs($this->oustaz)->postJson("/api/v1/fiches-hebdomadaires/$id/autoriser-modification")->assertForbidden();
        $this->actingAs($this->admin)->postJson("/api/v1/fiches-hebdomadaires/$id/autoriser-modification")
            ->assertOk()->assertJsonPath('data.statut', 'brouillon')->assertJsonPath('data.modification_demandee_at', null);
        $this->actingAs($this->admin)->getJson('/api/v1/fiches-hebdomadaires?demande_modification=1')->assertJsonCount(0, 'data');

        // L'oustaz corrige puis valide de nouveau
        $this->actingAs($this->oustaz)->putJson("/api/v1/fiches-hebdomadaires/$id/jours/dimanche", $jour)->assertOk();
        $this->actingAs($this->oustaz)->postJson("/api/v1/fiches-hebdomadaires/$id/valider")->assertOk();
        $this->actingAs($this->admin)->postJson("/api/v1/fiches-hebdomadaires/$id/autoriser-modification")->assertOk();
        $this->actingAs($this->admin)->postJson("/api/v1/fiches-hebdomadaires/$id/autoriser-modification")->assertJsonValidationErrors('statut');
    }

    public function test_eleve_du_mois_par_classe_avec_moyennes_et_classe_exemplaire(): void
    {
        $profilB = Oustaz::create(['user_id' => User::factory()->role(Role::Oustaz)->create()->id]);
        $classeB = ClasseAcademique::create(['nom' => 'Halaqa B', 'niveau' => 'Avancé', 'annee_scolaire' => '2026-2027', 'statut' => 'active', 'oustaz_id' => $profilB->id]);
        [$awa] = $this->eleve('Awa');
        [$binta] = $this->eleve('Binta');
        [$coumba] = $this->eleve('Coumba', $classeB);
        $notes = fn (int $note) => ['mois' => '2026-10', 'assiduite_ponctualite' => $note, 'discipline_comportement' => $note, 'proprete_hygiene' => $note, 'camaraderie_respect' => $note, 'prieres_devotion' => $note];
        // Fiche validée et notée (objectifs 100 %, récitation 4/4) pour chaque élève, saisie directement
        foreach ([$awa, $binta, $coumba] as $eleve) {
            $fiche = DB::table('fiches_hebdomadaires')->insertGetId(['eleve_id' => $eleve->id, 'date_debut' => '2026-10-10', 'date_fin' => '2026-10-14', 'sourate_debut' => 'Al-Mulk', 'verset_debut' => 1, 'sourate_fin' => 'Al-Mulk', 'verset_fin' => 10, 'statut' => 'validee', 'created_at' => now(), 'updated_at' => now()]);
            DB::table('notes')->insert(['fiche_hebdomadaire_id' => $fiche, 'jour' => 'samedi', 'd_sourate_debut' => 67, 'd_verset_debut' => 1, 'd_sourate_fin' => 67, 'd_verset_fin' => 10, 'qualite_recitation' => 4, 'created_at' => now(), 'updated_at' => now()]);
        }
        // Classe A : 100 et 62,5 (moyenne 81,25) ; classe B : 90 → classe exemplaire B, meilleur des meilleurs Awa
        $this->actingAs($this->admin)->postJson("/api/v1/eleves/{$awa->id}/exemplarite", $notes(4))->assertOk();
        $this->actingAs($this->admin)->postJson("/api/v1/eleves/{$binta->id}/exemplarite", $notes(1))->assertOk();
        $this->actingAs($this->admin)->postJson("/api/v1/eleves/{$coumba->id}/exemplarite", ['mois' => '2026-10', 'assiduite_ponctualite' => 4, 'discipline_comportement' => 4, 'proprete_hygiene' => 3, 'camaraderie_respect' => 3, 'prieres_devotion' => 2])->assertOk();

        $this->actingAs($this->admin)->getJson('/api/v1/admin/eleve-du-mois?mois=2026-10')
            ->assertOk()
            ->assertJsonPath('data.gagnant.eleve.id', $awa->id)
            ->assertJsonPath('data.classe_exemplaire.classe.nom', 'Halaqa B')
            ->assertJsonPath('data.classe_exemplaire.rang', 1)
            ->assertJsonPath('data.classes.0.moyenne_score', 90)
            ->assertJsonPath('data.classes.1.classe.nom', 'Halaqa A')
            ->assertJsonPath('data.classes.1.moyenne_score', 81.25)
            ->assertJsonPath('data.classes.1.classes', 2)
            ->assertJsonPath('data.classes.1.meilleur.eleve.id', $awa->id)
            ->assertJsonPath('data.classes.1.classement.1.rang_classe', 2)
            ->assertJsonPath('data.classes.1.classe.oustaz', 'Cheikh Fall');
    }

    public function test_diplomes_delivres_par_l_administration_et_consultes_par_le_tuteur(): void
    {
        [$eleve, , $tuteur] = $this->eleve('Awa');
        [$autre] = $this->eleve('Fatou');

        $this->actingAs($this->admin)->postJson("/api/v1/eleves/{$eleve->id}/diplomes", ['type' => 'hifz_complet', 'date_obtention' => '2026-10-20'])
            ->assertJsonValidationErrors('date_obtention');
        $diplome = $this->actingAs($this->admin)->postJson("/api/v1/eleves/{$eleve->id}/diplomes", ['type' => 'hifz_complet', 'mention' => 'excellent', 'date_obtention' => '2026-10-12'])
            ->assertCreated()
            ->assertJsonPath('data.intitule', 'Diplôme de mémorisation complète du Saint Coran')
            ->assertJsonPath('data.classe', 'Halaqa A')
            ->assertJsonPath('data.annee_scolaire', '2026-2027');
        $id = $diplome->json('data.id');
        $this->assertMatchesRegularExpression('/^DIP-2026-\d{6}$/', $diplome->json('data.numero'));
        $autreDiplome = $this->actingAs($this->admin)->postJson("/api/v1/eleves/{$autre->id}/diplomes", ['type' => 'tajwid', 'date_obtention' => '2026-10-01'])->json('data.id');

        $this->actingAs($this->admin)->patchJson("/api/v1/diplomes/$id", ['mention' => 'tres_bien', 'observations' => 'Lecture remarquable'])
            ->assertOk()->assertJsonPath('data.mention', 'tres_bien');
        $this->actingAs($this->admin)->getJson('/api/v1/diplomes?q=Awa')->assertJsonCount(1, 'data.items')->assertJsonPath('data.stats.delivres', 2);
        $this->actingAs($this->admin)->getJson("/api/v1/eleves/{$eleve->id}")->assertJsonPath('data.diplomes.0.id', $id);

        // Le tuteur imprime le diplôme de son enfant, pas celui d'un autre
        $parent = User::find($tuteur->user_id);
        $this->actingAs($parent)->getJson("/api/v1/diplomes/$id")->assertOk()->assertJsonPath('data.eleve.prenom', 'Awa');
        $this->actingAs($parent)->getJson("/api/v1/diplomes/$autreDiplome")->assertForbidden();
        $this->actingAs($parent)->getJson('/api/v1/tuteur/me/eleves')->assertJsonPath('data.0.diplomes.0.numero', $diplome->json('data.numero'));
        $this->actingAs($parent)->postJson("/api/v1/eleves/{$eleve->id}/diplomes", ['type' => 'autre', 'date_obtention' => '2026-10-01'])->assertForbidden();

        // Annulation motivée : plus modifiable, plus visible par le tuteur
        $this->actingAs($this->admin)->postJson("/api/v1/diplomes/$id/annuler", ['motif' => 'Erreur de nom'])->assertOk()->assertJsonPath('data.annule', true);
        $this->actingAs($this->admin)->patchJson("/api/v1/diplomes/$id", ['mention' => 'bien'])->assertJsonValidationErrors('diplome');
        $this->actingAs($parent)->getJson("/api/v1/diplomes/$id")->assertForbidden();
        $this->actingAs($this->admin)->getJson('/api/v1/diplomes?statut=annule')->assertJsonCount(1, 'data.items');
    }

    public function test_l_url_des_photos_suit_l_adresse_de_la_requete(): void
    {
        [$eleve] = $this->eleve('Awa');
        $eleve->forceFill(['photo' => 'photos/eleves/abc.jpg'])->save();

        $this->actingAs($this->admin)->getJson("http://localhost:8090/api/v1/eleves/{$eleve->id}")
            ->assertJsonPath('data.photo', 'http://localhost:8090/storage/photos/eleves/abc.jpg');
    }
}
