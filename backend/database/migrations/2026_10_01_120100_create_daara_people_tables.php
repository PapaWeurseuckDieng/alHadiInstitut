<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tuteurs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->restrictOnDelete();
            $table->string('profession')->nullable();
            $table->timestamps();
        });

        Schema::create('oustazs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->restrictOnDelete();
            $table->string('specialite')->nullable();
            $table->timestamps();
        });

        Schema::create('eleves', function (Blueprint $table) {
            $table->id();
            $table->string('matricule', 24)->unique();
            $table->string('nom');
            $table->string('prenom');
            $table->date('date_naissance')->nullable();
            $table->string('sexe', 16)->nullable();
            $table->string('adresse')->nullable();
            $table->string('statut', 16)->default('actif');
            $table->timestamps();
        });

        Schema::create('eleve_tuteur', function (Blueprint $table) {
            $table->foreignId('eleve_id')->constrained('eleves')->restrictOnDelete();
            $table->foreignId('tuteur_id')->constrained('tuteurs')->restrictOnDelete();
            $table->string('lien_parente', 40)->nullable();
            $table->boolean('est_responsable_legal')->default(false);
            $table->boolean('est_payeur')->default(false);
            $table->timestamps();
            $table->primary(['eleve_id', 'tuteur_id']);
        });

        Schema::create('sequences_matricules', function (Blueprint $table) {
            $table->unsignedSmallInteger('annee')->primary();
            $table->unsignedBigInteger('dernier_numero')->default(0);
        });

        $legacyStudents = DB::table('users')->where('role', 'eleve')->get();
        foreach ($legacyStudents as $student) {
            DB::table('eleves')->insertOrIgnore([
                'id' => $student->id,
                'matricule' => $student->matricule,
                'nom' => $student->nom,
                'prenom' => $student->prenom,
                'date_naissance' => $student->date_naissance,
                'adresse' => $student->adresse,
                'statut' => $student->statut === 'inactif' ? 'inactif' : 'actif',
                'created_at' => $student->created_at,
                'updated_at' => $student->updated_at,
            ]);
        }

        foreach (DB::table('eleves')->get(['matricule']) as $student) {
            if (preg_match('/^ELV-(\d{4})-(\d{6,})$/', $student->matricule, $matches)) {
                $year = (int) $matches[1];
                $number = (int) $matches[2];
                $current = DB::table('sequences_matricules')->where('annee', $year)->value('dernier_numero');
                if ($current === null || $number > $current) {
                    DB::table('sequences_matricules')->updateOrInsert(
                        ['annee' => $year],
                        ['dernier_numero' => $number],
                    );
                }
            }
        }

        DB::table('users')->where('role', 'parent')->update(['role' => 'tuteur']);
        DB::table('users')->where('role', 'enseignant')->update(['role' => 'oustaz']);

        foreach (DB::table('users')->where('role', 'tuteur')->get(['id', 'created_at', 'updated_at']) as $user) {
            DB::table('tuteurs')->insertOrIgnore([
                'user_id' => $user->id,
                'created_at' => $user->created_at,
                'updated_at' => $user->updated_at,
            ]);
        }

        foreach (DB::table('users')->where('role', 'oustaz')->get(['id', 'created_at', 'updated_at']) as $user) {
            DB::table('oustazs')->insertOrIgnore([
                'user_id' => $user->id,
                'created_at' => $user->created_at,
                'updated_at' => $user->updated_at,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('users')->where('role', 'tuteur')->update(['role' => 'parent']);
        DB::table('users')->where('role', 'oustaz')->update(['role' => 'enseignant']);

        Schema::dropIfExists('sequences_matricules');
        Schema::dropIfExists('eleve_tuteur');
        Schema::dropIfExists('eleves');
        Schema::dropIfExists('oustazs');
        Schema::dropIfExists('tuteurs');
    }
};
