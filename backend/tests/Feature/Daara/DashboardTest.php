<?php

namespace Tests\Feature\Daara;

use App\Enums\Role;
use App\Models\ClasseAcademique;
use App\Models\Eleve;
use App\Models\Inscription;
use App\Models\Oustaz;
use App\Models\Tuteur;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_dashboard_requires_an_admin_with_a_changed_password(): void
    {
        $this->getJson('/api/v1/admin/dashboard')->assertUnauthorized();
        $this->actingAs(User::factory()->role(Role::Tuteur)->create())
            ->getJson('/api/v1/admin/dashboard')->assertForbidden();
        $this->actingAs(User::factory()->role(Role::Oustaz)->create())
            ->getJson('/api/v1/admin/dashboard')->assertForbidden();
        $this->actingAs(User::factory()->create(['must_change_password' => true]))
            ->getJson('/api/v1/admin/dashboard')->assertForbidden();
    }

    public function test_dashboard_counts_real_records_filters_year_and_omits_passwords(): void
    {
        $admin = User::factory()->create();
        $active = User::factory()->role(Role::Tuteur)->create();
        $inactive = User::factory()->role(Role::Tuteur)->inactif()->create();
        $tuteur = Tuteur::create(['user_id' => $active->id]);
        Tuteur::create(['user_id' => $inactive->id]);
        $oustaz = Oustaz::create(['user_id' => User::factory()->role(Role::Oustaz)->create()->id]);
        $classe = ClasseAcademique::create(['nom' => 'Classe A', 'niveau' => 'R2', 'annee_scolaire' => '2026-2027', 'oustaz_id' => $oustaz->id, 'statut' => 'active']);
        foreach (['2026-2027', '2025-2026'] as $index => $year) {
            $eleve = Eleve::create(['nom' => 'Diop', 'prenom' => 'Élève '.$index, 'matricule' => 'ELV-'.$index, 'statut' => 'actif']);
            $eleve->tuteurs()->attach($tuteur);
            Inscription::create(['eleve_id' => $eleve->id, 'annee_scolaire' => $year, 'date_inscription' => '2026-01-01', 'statut' => 'active']);
        }
        $this->actingAs($admin)->getJson('/api/v1/admin/dashboard?annee=2026-2027')
            ->assertOk()->assertJsonPath('data.stats.eleves', 1)
            ->assertJsonPath('data.stats.classes', 1)
            ->assertJsonPath('data.stats.a_affecter', 1)
            ->assertJsonCount(1, 'data.items')->assertJsonCount(1, 'data.options.tuteurs')
            ->assertJsonPath('data.options.tuteurs.0.id', $tuteur->id);
        $this->getJson('/api/v1/admin/dashboard?section=users')
            ->assertOk()->assertJsonMissingPath('data.items.0.password')
            ->assertJsonMissingPath('data.items.0.remember_token');
        $this->getJson('/api/v1/admin/dashboard?section=classes')
            ->assertJsonPath('data.items.0.id', $classe->id)->assertJsonPath('data.items.0.effectif', 0);
    }

    public function test_search_pagination_and_invalid_filters(): void
    {
        $this->actingAs(User::factory()->create());
        for ($index = 0; $index < 12; $index++) {
            Eleve::create(['nom' => $index === 0 ? 'Unique' : 'Diop', 'prenom' => 'Awa', 'matricule' => 'ELV-'.$index]);
        }
        $this->getJson('/api/v1/admin/dashboard')->assertJsonCount(10, 'data.items')->assertJsonPath('data.pagination.total', 12);
        $this->getJson('/api/v1/admin/dashboard?page=2')->assertJsonCount(2, 'data.items');
        $this->getJson('/api/v1/admin/dashboard?q=Unique')->assertJsonCount(1, 'data.items');
        $this->getJson('/api/v1/admin/dashboard?q=%25')->assertJsonCount(0, 'data.items');
        $this->getJson('/api/v1/admin/dashboard?section=finances')->assertUnprocessable();
        $this->getJson('/api/v1/admin/dashboard?annee=2026')->assertUnprocessable();
        $this->getJson('/api/v1/admin/dashboard?page=0')->assertUnprocessable();
    }
}
