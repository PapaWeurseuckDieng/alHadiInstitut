<?php

namespace Tests\Feature\Paiements;

use App\Enums\Role;
use App\Models\ClasseAcademique;
use App\Models\Eleve;
use App\Models\Inscription;
use App\Models\Paiement;
use App\Models\RappelPaiement;
use App\Models\Tuteur;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Mensualités : encaissement au secrétariat, statuts, reçus, tarifs et rappels WhatsApp.
 */
class PaiementTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private ClasseAcademique $classe;

    /** Compteur pour des matricules et téléphones uniques dans chaque test. */
    private int $numero = 0;

    protected function setUp(): void
    {
        parent::setUp();
        // Mi-novembre 2026 : année scolaire 2026-2027, mois facturés d'octobre 2026 à juillet 2027
        Carbon::setTestNow('2026-11-15 10:00:00');
        config(['paiements.mensualite_par_defaut' => 10000, 'services.whatsapp.driver' => 'log']);

        $this->admin = User::factory()->role(Role::Admin)->create();
        $this->classe = ClasseAcademique::create(['nom' => 'Halaqa Al-Falah', 'niveau' => 'Intermédiaire', 'annee_scolaire' => '2026-2027', 'statut' => 'active']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** Crée un élève inscrit (avec un tuteur payeur) et renvoie [élève, tuteur]. */
    private function eleveInscrit(string $prenom = 'Awa', string $dateInscription = '2026-10-01', ?Tuteur $tuteur = null, ?ClasseAcademique $classe = null): array
    {
        $numero = ++$this->numero;
        $eleve = Eleve::create(['matricule' => 'ELV-2026-'.str_pad((string) $numero, 4, '0', STR_PAD_LEFT), 'nom' => 'Sarr', 'prenom' => $prenom, 'statut' => 'actif']);
        Inscription::create([
            'eleve_id' => $eleve->id,
            'classe_academique_id' => ($classe ?? $this->classe)->id,
            'annee_scolaire' => '2026-2027',
            'date_inscription' => $dateInscription,
            'statut' => 'active',
        ]);
        $tuteur ??= Tuteur::create(['user_id' => User::factory()->role(Role::Tuteur)->create(['prenom' => 'Aminata', 'nom' => 'Fall', 'telephone' => '77 123 45 6'.$numero])->id]);
        $eleve->tuteurs()->attach($tuteur->id, ['est_payeur' => true, 'est_responsable_legal' => true]);

        return [$eleve, $tuteur];
    }

    private function encaisser(Eleve $eleve, float $montant, string $mois = '2026-11')
    {
        return $this->actingAs($this->admin)->postJson('/api/v1/paiements', [
            'eleve_id' => $eleve->id,
            'mois' => $mois,
            'montant' => $montant,
            'mode_paiement' => 'especes',
        ]);
    }

    public function test_le_statut_passe_de_impaye_a_partiel_puis_paye_avec_un_recu_par_paiement(): void
    {
        [$eleve] = $this->eleveInscrit();

        $this->actingAs($this->admin)->getJson('/api/v1/paiements?mois=2026-11')
            ->assertOk()
            ->assertJsonPath('data.items.0.statut', 'impaye')
            ->assertJsonPath('data.items.0.montant_du', 10000)
            ->assertJsonPath('data.stats.impayes', 1)
            ->assertJsonCount(10, 'data.mois_disponibles')
            ->assertJsonPath('data.mois_disponibles.0.value', '2026-10');

        $premier = $this->encaisser($eleve, 4000)->assertCreated()
            ->assertJsonPath('message', 'Paiement enregistré.')
            ->assertJsonPath('data.reste', 6000)
            ->assertJsonPath('data.mode_paiement', 'especes');
        $this->assertMatchesRegularExpression('/^REC-2026-\d{6}$/', $premier->json('data.numero_recu'));

        $this->actingAs($this->admin)->getJson('/api/v1/paiements?mois=2026-11')->assertJsonPath('data.items.0.statut', 'partiel');

        $this->encaisser($eleve, 6000)->assertCreated()->assertJsonPath('data.reste', 0);
        $this->actingAs($this->admin)->getJson('/api/v1/paiements?mois=2026-11')
            ->assertJsonPath('data.items.0.statut', 'paye')
            ->assertJsonPath('data.items.0.whatsapp', null)
            ->assertJsonPath('data.stats.encaisse', 10000)
            ->assertJsonCount(2, 'data.items.0.paiements');
    }

    public function test_on_ne_peut_pas_payer_plus_que_le_reste_ni_un_mois_deja_regle(): void
    {
        [$eleve] = $this->eleveInscrit();

        $this->encaisser($eleve, 12000)->assertUnprocessable()->assertJsonValidationErrors('montant');
        $this->encaisser($eleve, 10000)->assertCreated();
        $this->encaisser($eleve, 1000)->assertUnprocessable()->assertJsonValidationErrors('mois');
        // Août ne fait pas partie des mois facturés (octobre à juillet)
        $this->encaisser($eleve, 1000, '2027-08')->assertUnprocessable()->assertJsonValidationErrors('mois');
        $this->assertSame(1, Paiement::count());
    }

    public function test_le_tarif_de_la_classe_remplace_le_tarif_par_defaut(): void
    {
        [$eleve] = $this->eleveInscrit();

        $this->actingAs($this->admin)->putJson('/api/v1/paiements/tarifs', [
            'tarifs' => [['classe_id' => $this->classe->id, 'mensualite' => 15000]],
        ])->assertOk();

        $this->actingAs($this->admin)->getJson('/api/v1/paiements/tarifs')
            ->assertJsonPath('data.classes.0.mensualite', 15000)
            ->assertJsonPath('data.defaut', 10000);
        $this->actingAs($this->admin)->getJson('/api/v1/paiements?mois=2026-11')->assertJsonPath('data.items.0.montant_du', 15000);
        $this->encaisser($eleve, 15000)->assertCreated()->assertJsonPath('data.montant_du', 15000);
    }

    public function test_un_recu_annule_reste_en_base_mais_ne_compte_plus(): void
    {
        [$eleve] = $this->eleveInscrit();
        $id = $this->encaisser($eleve, 10000)->json('data.id');

        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$id}/annuler", [])->assertUnprocessable()->assertJsonValidationErrors('motif');
        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$id}/annuler", ['motif' => 'Erreur de saisie'])
            ->assertOk()->assertJsonPath('data.annule', true);
        $this->actingAs($this->admin)->postJson("/api/v1/paiements/{$id}/annuler", ['motif' => 'Encore'])->assertUnprocessable();

        $this->assertDatabaseHas('paiements', ['id' => $id, 'motif_annulation' => 'Erreur de saisie']);
        $this->actingAs($this->admin)->getJson('/api/v1/paiements?mois=2026-11')->assertJsonPath('data.items.0.statut', 'impaye');
        $this->actingAs($this->admin)->getJson("/api/v1/paiements/{$id}/recu")->assertOk()->assertJsonPath('data.annule', true);
    }

    public function test_un_eleve_inscrit_en_novembre_ne_doit_pas_octobre(): void
    {
        $this->eleveInscrit('Moussa', '2026-11-05');

        $this->actingAs($this->admin)->getJson('/api/v1/paiements?mois=2026-10')->assertJsonPath('data.stats.eleves', 0);
        $this->actingAs($this->admin)->getJson('/api/v1/paiements?mois=2026-11')->assertJsonPath('data.stats.eleves', 1);
    }

    public function test_filtres_statut_et_recherche(): void
    {
        [$awa] = $this->eleveInscrit('Awa');
        $this->eleveInscrit('Moussa');
        $this->encaisser($awa, 10000);

        $this->actingAs($this->admin)->getJson('/api/v1/paiements?mois=2026-11&statut=impaye')
            ->assertJsonCount(1, 'data.items')->assertJsonPath('data.items.0.eleve.prenom', 'Moussa');
        $this->actingAs($this->admin)->getJson('/api/v1/paiements?mois=2026-11&q=awa')
            ->assertJsonCount(1, 'data.items')->assertJsonPath('data.items.0.statut', 'paye');
        $this->actingAs($this->admin)->getJson('/api/v1/paiements?statut=inconnu')->assertUnprocessable();
    }

    public function test_seul_l_administrateur_gere_les_paiements(): void
    {
        [$eleve, $tuteur] = $this->eleveInscrit();

        $this->actingAs($tuteur->user)->getJson('/api/v1/paiements')->assertForbidden();
        $this->actingAs($tuteur->user)->postJson('/api/v1/paiements', ['eleve_id' => $eleve->id, 'mois' => '2026-11', 'montant' => 10000, 'mode_paiement' => 'especes'])->assertForbidden();
        $this->assertSame(0, Paiement::count());
    }

    public function test_le_tuteur_voit_les_mensualites_de_ses_enfants(): void
    {
        [$eleve, $tuteur] = $this->eleveInscrit();
        $this->encaisser($eleve, 10000, '2026-10');

        $this->actingAs($tuteur->user)->getJson('/api/v1/tuteur/me/paiements')
            ->assertOk()
            ->assertJsonPath('data.0.eleve.prenom', 'Awa')
            ->assertJsonCount(10, 'data.0.mois')
            ->assertJsonPath('data.0.mois.0.statut', 'paye')
            ->assertJsonPath('data.0.mois.1.statut', 'impaye')
            ->assertJsonPath('data.0.mois.1.a_venir', false)
            ->assertJsonPath('data.0.mois.2.a_venir', true);
    }

    public function test_pas_de_rappel_automatique_avant_le_10(): void
    {
        Carbon::setTestNow('2026-11-09 09:00:00');
        $this->eleveInscrit();

        $this->artisan('paiements:rappels')->assertSuccessful();
        $this->assertSame(0, RappelPaiement::count());
    }

    public function test_rappel_automatique_un_seul_message_par_parent_et_par_mois(): void
    {
        // Un parent avec deux enfants non à jour, un autre élève à jour
        [, $tuteur] = $this->eleveInscrit('Awa');
        $this->eleveInscrit('Moussa', '2026-10-01', $tuteur);
        [$aJour] = $this->eleveInscrit('Khady');
        $this->encaisser($aJour, 10000);

        $this->artisan('paiements:rappels')->assertSuccessful();

        $this->assertSame(1, RappelPaiement::count());
        $rappel = RappelPaiement::firstOrFail();
        $this->assertSame($tuteur->id, $rappel->tuteur_id);
        $this->assertSame('simule', $rappel->statut);
        $this->assertSame('221771234561', $rappel->telephone);
        $this->assertStringContainsString('Awa Sarr et Moussa Sarr', $rappel->message);
        $this->assertStringContainsString('novembre 2026', $rappel->message);
        $this->assertStringContainsString('20 000 FCFA', $rappel->message);

        // Le lendemain : déjà prévenu, pas de second message automatique
        Carbon::setTestNow('2026-11-16 09:00:00');
        $this->artisan('paiements:rappels')->assertSuccessful();
        $this->assertSame(1, RappelPaiement::count());
    }

    public function test_relance_manuelle_par_l_administration(): void
    {
        $this->eleveInscrit();

        $this->actingAs($this->admin)->postJson('/api/v1/paiements/rappels', ['mois' => '2026-11'])
            ->assertOk()
            ->assertJsonPath('data.simules', 1)
            ->assertJsonPath('data.pilote', 'log');
        $this->actingAs($this->admin)->getJson('/api/v1/paiements/rappels?mois=2026-11')
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.automatique', false);
        $this->actingAs($this->admin)->getJson('/api/v1/paiements?mois=2026-11')
            ->assertJsonPath('data.items.0.dernier_rappel.statut', 'simule')
            ->assertJsonPath('data.items.0.whatsapp.numero', '221771234561');
    }

    public function test_envoi_reel_par_whatsapp_business_et_journal_des_echecs(): void
    {
        config(['services.whatsapp' => array_merge(config('services.whatsapp'), [
            'driver' => 'meta', 'token' => 'jeton-test', 'phone_number_id' => '123456',
        ])]);
        [, $tuteurOk] = $this->eleveInscrit('Awa');
        $this->eleveInscrit('Moussa');

        Http::fake([
            'graph.facebook.com/*' => Http::sequence()
                ->push(['messages' => [['id' => 'wamid.1']]], 200)
                ->push(['error' => ['message' => 'Numéro invalide']], 400),
        ]);

        $this->artisan('paiements:rappels')->assertFailed();

        Http::assertSent(fn ($request) => $request->hasHeader('Authorization', 'Bearer jeton-test')
            && $request['type'] === 'template'
            && $request['template']['name'] === 'rappel_mensualite'
            && count($request['template']['components'][0]['parameters']) === 4);
        $this->assertSame('envoye', RappelPaiement::where('tuteur_id', $tuteurOk->id)->value('statut'));
        $this->assertSame('Numéro invalide', RappelPaiement::where('statut', 'echec')->value('erreur'));
    }
}
