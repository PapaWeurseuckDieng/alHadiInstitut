<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Le jeu de démonstration (DemoSeeder) remplit toutes les fonctionnalités
 * et reste cohérent avec les règles de l'API.
 */
class DemoSeederTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_le_jeu_de_demonstration_alimente_tous_les_ecrans(): void
    {
        // Mi-novembre : deux mois de mensualités, d'appels et d'exemplarité
        Carbon::setTestNow('2026-11-19 10:00:00');
        $this->seed(DemoSeeder::class);

        $this->assertSame(1, User::where('role', 'admin')->where('telephone', '+221781000001')->count());
        $this->assertSame(4, User::where('role', 'oustaz')->count());
        $this->assertGreaterThanOrEqual(30, User::where('role', 'tuteur')->count());
        $this->assertGreaterThanOrEqual(30, DB::table('eleves')->count());
        foreach (['classes_academiques', 'inscriptions', 'paiements', 'depenses', 'plannings', 'presences', 'fiches_hebdomadaires', 'notes', 'evaluations_exemplarite', 'rappels_paiement', 'diplomes'] as $table) {
            $this->assertGreaterThan(0, DB::table($table)->count(), "Table vide : $table");
        }

        // Les écrans principaux répondent avec ces données
        $admin = User::where('telephone', '+221781000001')->firstOrFail();
        $this->actingAs($admin)->getJson('/api/v1/admin/dashboard?section=eleves')->assertOk()->assertJsonPath('data.stats.classes', 6);
        $paiements = $this->actingAs($admin)->getJson('/api/v1/paiements?mois=2026-11')->assertOk();
        $this->assertGreaterThan(0, $paiements->json('data.stats.payes'));
        $this->assertGreaterThan(0, $paiements->json('data.stats.impayes') + $paiements->json('data.stats.partiels'));
        $this->actingAs($admin)->getJson('/api/v1/depenses?annee_scolaire=2026-2027')->assertOk()
            ->assertJsonPath('data.stats.nombre_en_attente', 3);
        $this->assertNotEmpty($this->actingAs($admin)->getJson('/api/v1/admin/eleve-du-mois?mois=2026-10')->json('data.classement'));
        $this->actingAs($admin)->getJson('/api/v1/paiements/rappels?mois=2026-11')->assertOk()->assertJsonPath('totaux.echec', 1);
        // Frais d'inscription avec reçus, fiche à rouvrir, diplômes, homonymes et classe exemplaire
        $this->assertGreaterThan(0, DB::table('inscriptions')->whereNotNull('numero_recu_inscription')->count());
        $this->actingAs($admin)->getJson('/api/v1/fiches-hebdomadaires?demande_modification=1')->assertOk()->assertJsonCount(1, 'data');
        $this->actingAs($admin)->getJson('/api/v1/diplomes')->assertOk()->assertJsonPath('data.stats.annules', 1);
        $homonymes = $this->actingAs($admin)->getJson('/api/v1/admin/tuteurs?q=Mamadou Diop')->json('data');
        $this->assertGreaterThanOrEqual(2, count($homonymes));
        $this->assertSame([true], array_values(array_unique(array_column($homonymes, 'homonyme'))));
        $this->assertNotNull($this->actingAs($admin)->getJson('/api/v1/admin/eleve-du-mois?mois=2026-10')->json('data.classe_exemplaire'));

        // Un oustaz et un tuteur de démonstration se connectent directement (demo1234)
        $this->postJson('/api/v1/auth/login', ['telephone' => '781000011', 'password' => 'demo1234'])
            ->assertOk()->assertJsonMissingPath('must_change_password');
        $this->postJson('/api/v1/auth/login', ['telephone' => '782000001', 'password' => 'demo1234'])->assertOk();

        // Une seconde exécution ne crée rien
        $avant = DB::table('eleves')->count();
        $this->seed(DemoSeeder::class);
        $this->assertSame($avant, DB::table('eleves')->count());
    }
}
