<?php

use App\Models\ClasseAcademique;
use App\Models\Eleve;
use App\Models\Inscription;
use App\Models\Oustaz;
use App\Models\Tuteur;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

// Browser fixtures are permitted only in the disposable SQLite test database.
require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (app()->environment() !== 'testing' || config('database.default') !== 'sqlite'
    || config('database.connections.sqlite.database') !== '/tmp/alhadi-dashboard-browser.sqlite') {
    throw new RuntimeException('Browser fixtures require the isolated test container and database.');
}
touch('/tmp/alhadi-dashboard-browser.sqlite');
Artisan::call('migrate', ['--force' => true]);

$accounts = [
    ['nom' => 'Ndiaye', 'prenom' => 'Mamadou', 'telephone' => '770990001', 'role' => 'admin'],
    ['nom' => 'Diop', 'prenom' => 'Ibrahima', 'telephone' => '770990002', 'role' => 'oustaz'],
    ['nom' => 'Fall', 'prenom' => 'Aminata', 'telephone' => '770990003', 'role' => 'tuteur'],
    ['nom' => 'Sarr', 'prenom' => 'Fatou', 'telephone' => '770990004', 'role' => 'tuteur', 'must_change_password' => true],
];
foreach ($accounts as $index => $account) {
    $users[] = User::create(['matricule' => 'TEST-'.($index + 1), 'password' => $index === 3 ? 'passer' : 'Browser!Secure2026', 'statut' => 'actif', 'must_change_password' => false, ...$account]);
}
$teacher = Oustaz::create(['user_id' => $users[1]->id]);
$guardian = Tuteur::create(['user_id' => $users[2]->id]);
Tuteur::create(['user_id' => $users[3]->id]);
foreach (['Halaqa Al-Falah', 'Halaqa Al-Furqan', 'Halaqa Al-Baqarah'] as $index => $name) {
    $classes[] = ClasseAcademique::create(['nom' => $name, 'niveau' => ['Intermédiaire', 'Débutant', 'Avancé'][$index], 'oustaz_id' => $teacher->id, 'annee_scolaire' => '2026-2027', 'statut' => 'active']);
}
$names = [['Awa', 'Sarr'], ['Moussa', 'Fall'], ['Aliou', 'Ba'], ['Mariama', 'Diop'], ['Ibrahima', 'Ndiaye'], ['Fatou', 'Sow'], ['Omar', 'Gueye'], ['Khadija', 'Diallo'], ['Abdou', 'Seck'], ['Aïssatou', 'Sy'], ['Cheikh', 'Mbaye'], ['Binta', 'Kane']];
foreach ($names as $index => [$first, $last]) {
    $eleve = Eleve::create(['matricule' => sprintf('ELV-2026-%06d', $index + 1), 'prenom' => $first, 'nom' => $last, 'statut' => 'actif']);
    $eleve->tuteurs()->attach($guardian->id, ['est_responsable_legal' => true, 'est_payeur' => true]);
    Inscription::create(['eleve_id' => $eleve->id, 'annee_scolaire' => '2026-2027', 'date_inscription' => '2026-10-01', 'statut' => 'active', 'classe_academique_id' => $index < 8 ? $classes[$index % 3]->id : null]);
}
DB::table('sequences_matricules')->insert(['annee' => 2026, 'dernier_numero' => count($names)]);
echo "Isolated browser fixtures ready.\n";
