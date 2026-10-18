<?php

namespace Tests\Feature\Daara;

use App\Enums\Role;
use App\Models\ClasseAcademique;
use App\Models\Eleve;
use App\Models\Inscription;
use App\Models\Tuteur;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Tuteurs d'un élève existant (rattacher, modifier, retirer), changement de classe
 * en cours d'année et journal détaillé des rappels de paiement.
 */
class TuteursEtTransfertTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Eleve $eleve;

    private Tuteur $mere;

    private ClasseAcademique $classeA;

    private Inscription $inscription;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-15 10:00:00');
        config(['paiements.mensualite_par_defaut' => 10000, 'services.whatsapp.driver' => 'log']);
        $this->admin = User::factory()->role(Role::Admin)->create();
        $this->classeA = ClasseAcademique::create(['nom' => 'Halaqa A', 'niveau' => 'Débutant', 'annee_scolaire' => '2026-2027', 'statut' => 'active']);
        $this->eleve = Eleve::create(['matricule' => 'ELV-2026-000001', 'nom' => 'Diop', 'prenom' => 'Moussa', 'statut' => 'actif']);
        $this->inscription = Inscription::create(['eleve_id' => $this->eleve->id, 'classe_academique_id' => $this->classeA->id, 'annee_scolaire' => '2026-2027', 'date_inscription' => '2026-10-01', 'statut' => 'active']);
        $this->mere = Tuteur::create(['user_id' => User::factory()->role(Role::Tuteur)->create(['prenom' => 'Fatou', 'nom' => 'Diop'])->id]);
        $this->eleve->tuteurs()->attach($this->mere->id, ['est_payeur' => true, 'est_responsable_legal' => true, 'lien_parente' => 'Mère']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_rattacher_un_tuteur_existant_puis_un_nouveau_compte(): void
    {
        $pere = Tuteur::create(['user_id' => User::factory()->role(Role::Tuteur)->create(['prenom' => 'Ousmane', 'nom' => 'Diop'])->id]);

        $this->actingAs($this->admin)->postJson("/api/v1/eleves/{$this->eleve->id}/tuteurs", [
            'mode' => 'existant', 'tuteur_id' => $pere->id, 'lien_parente' => 'Père', 'est_responsable_legal' => true,
        ])->assertCreated()
            ->assertJsonPath('message', 'Tuteur rattaché.')
            ->assertJsonCount(2, 'data.tuteurs')
            ->assertJsonPath('data.tuteurs.1.lien_parente', 'Père')
            ->assertJsonPath('data.tuteurs.1.est_responsable_legal', true)
            ->assertJsonPath('data.tuteurs.1.est_payeur', false);

        // Déjà rattaché : refusé
        $this->actingAs($this->admin)->postJson("/api/v1/eleves/{$this->eleve->id}/tuteurs", ['mode' => 'existant', 'tuteur_id' => $pere->id])
            ->assertJsonValidationErrors('tuteur_id');

        // Nouveau compte : mot de passe temporaire « passer »
        $this->actingAs($this->admin)->postJson("/api/v1/eleves/{$this->eleve->id}/tuteurs", [
            'mode' => 'creer',
            'compte' => ['nom' => 'Ndiaye', 'prenom' => 'Awa', 'sexe' => 'F', 'telephone' => '77 222 33 44'],
            'lien_parente' => 'Tante',
        ])->assertCreated()->assertJsonCount(3, 'data.tuteurs');
        $tante = User::where('telephone', '+221772223344')->firstOrFail();
        $this->assertTrue($tante->must_change_password);
        $this->assertDatabaseHas('audit_events', ['action' => 'eleve.tuteur_rattache', 'entity_id' => $this->eleve->id]);

        // Téléphone déjà utilisé : il faut choisir le compte existant
        $this->actingAs($this->admin)->postJson("/api/v1/eleves/{$this->eleve->id}/tuteurs", [
            'mode' => 'creer', 'compte' => ['nom' => 'X', 'prenom' => 'Y', 'sexe' => 'M', 'telephone' => '772223344'],
        ])->assertJsonValidationErrors('compte.telephone');
    }

    public function test_modifier_puis_retirer_un_rattachement_en_gardant_au_moins_un_tuteur(): void
    {
        $pere = Tuteur::create(['user_id' => User::factory()->role(Role::Tuteur)->create()->id]);
        $this->eleve->tuteurs()->attach($pere->id, ['est_payeur' => false]);

        // Le père devient payeur
        $this->actingAs($this->admin)->patchJson("/api/v1/eleves/{$this->eleve->id}/tuteurs/{$pere->id}", ['est_payeur' => true, 'lien_parente' => 'Père'])
            ->assertOk()
            ->assertJsonPath('message', 'Rattachement modifié.');
        $this->assertTrue((bool) $this->eleve->tuteurs()->whereKey($pere->id)->first()->pivot->est_payeur);

        // Retrait de la mère : possible (il reste le père)
        $this->actingAs($this->admin)->postJson("/api/v1/eleves/{$this->eleve->id}/tuteurs/{$this->mere->id}/retirer")
            ->assertOk()
            ->assertJsonCount(1, 'data.tuteurs');
        // Le compte de la mère existe toujours
        $this->assertDatabaseHas('tuteurs', ['id' => $this->mere->id]);

        // Dernier tuteur : refusé
        $this->actingAs($this->admin)->postJson("/api/v1/eleves/{$this->eleve->id}/tuteurs/{$pere->id}/retirer")
            ->assertJsonValidationErrors('tuteur_id');
        // Tuteur non rattaché : introuvable
        $this->actingAs($this->admin)->postJson("/api/v1/eleves/{$this->eleve->id}/tuteurs/{$this->mere->id}/retirer")
            ->assertNotFound();
    }

    public function test_changer_un_eleve_de_classe_dans_la_meme_annee(): void
    {
        $classeB = ClasseAcademique::create(['nom' => 'Halaqa B', 'niveau' => 'Intermédiaire', 'annee_scolaire' => '2026-2027', 'statut' => 'active']);

        $this->actingAs($this->admin)->postJson("/api/v1/inscriptions-annuelles/{$this->inscription->id}/changer-classe", [
            'classe_id' => $classeB->id, 'motif' => 'Niveau supérieur atteint',
        ])->assertOk()
            ->assertJsonPath('message', 'Élève transféré dans la classe Halaqa B.')
            ->assertJsonPath('data.classe', 'Halaqa B');

        $this->assertSame($classeB->id, $this->inscription->fresh()->classe_academique_id);
        $this->assertDatabaseHas('audit_events', ['action' => 'inscription.classe_changee', 'entity_id' => $this->inscription->id]);

        // La liste de la nouvelle classe le contient, l'ancienne non
        $this->actingAs($this->admin)->getJson("/api/v1/classes/{$classeB->id}/eleves")->assertJsonCount(1, 'data');
        $this->actingAs($this->admin)->getJson("/api/v1/classes/{$this->classeA->id}/eleves")->assertJsonCount(0, 'data');
    }

    public function test_changement_de_classe_refuse_meme_classe_autre_annee_ou_eleve_archive(): void
    {
        $ancienne = ClasseAcademique::create(['nom' => 'Halaqa 2025', 'niveau' => 'Débutant', 'annee_scolaire' => '2025-2026', 'statut' => 'active']);
        $url = "/api/v1/inscriptions-annuelles/{$this->inscription->id}/changer-classe";

        $this->actingAs($this->admin)->postJson($url, ['classe_id' => $this->classeA->id])->assertJsonValidationErrors('classe_id');
        $this->actingAs($this->admin)->postJson($url, ['classe_id' => $ancienne->id])->assertJsonValidationErrors('classe_id');

        $this->eleve->forceFill(['is_archived' => true])->save();
        $classeB = ClasseAcademique::create(['nom' => 'Halaqa B', 'niveau' => 'X', 'annee_scolaire' => '2026-2027', 'statut' => 'active']);
        $this->actingAs($this->admin)->postJson($url, ['classe_id' => $classeB->id])->assertJsonValidationErrors('inscription');

        $this->actingAs(User::factory()->role(Role::Oustaz)->create())->postJson($url, ['classe_id' => $classeB->id])->assertForbidden();
    }

    public function test_une_inscription_sans_classe_peut_etre_affectee(): void
    {
        $this->inscription->update(['classe_academique_id' => null]);

        $this->actingAs($this->admin)->postJson("/api/v1/inscriptions-annuelles/{$this->inscription->id}/changer-classe", ['classe_id' => $this->classeA->id])
            ->assertOk();
        $this->assertSame($this->classeA->id, $this->inscription->fresh()->classe_academique_id);
    }

    public function test_journal_detaille_des_rappels(): void
    {
        $this->actingAs($this->admin)->postJson('/api/v1/paiements/rappels', ['mois' => '2026-11'])->assertOk();

        $this->actingAs($this->admin)->getJson('/api/v1/paiements/rappels?mois=2026-11')
            ->assertOk()
            ->assertJsonPath('data.0.statut', 'simule')
            ->assertJsonPath('data.0.automatique', false)
            ->assertJsonPath('data.0.envoye_par', $this->admin->prenom.' '.$this->admin->nom)
            ->assertJsonPath('data.0.tuteur', 'Fatou Diop')
            ->assertJsonPath('totaux', ['envoye' => 0, 'simule' => 1, 'echec' => 0])
            ->assertJsonPath('data.0.message', fn ($message) => str_contains($message, 'Moussa'));

        $this->actingAs($this->admin)->getJson('/api/v1/paiements/rappels?mois=2026-11&statut=echec')
            ->assertJsonCount(0, 'data');
    }
}
