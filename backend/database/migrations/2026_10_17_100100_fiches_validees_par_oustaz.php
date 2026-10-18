<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Fiches hebdomadaires : l'oustaz crée, remplit et valide la fiche (brouillon → validée).
 * Une fiche validée ne se modifie plus, sauf si l'administration rouvre la fiche
 * (éventuellement à la demande de l'oustaz). L'étape « soumise » disparaît.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fiches_hebdomadaires', function (Blueprint $table) {
            $table->foreignId('valide_par')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('valide_at')->nullable();
            $table->timestamp('modification_demandee_at')->nullable();
            $table->string('motif_demande_modification', 255)->nullable();
            $table->foreignId('modification_autorisee_par')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('modification_autorisee_at')->nullable();
        });

        // Les fiches « soumises » avaient été terminées par l'oustaz : elles deviennent validées
        DB::table('fiches_hebdomadaires')->where('statut', 'soumise')->update([
            'statut' => 'validee',
            'valide_par' => DB::raw('enseignant_id'),
            'valide_at' => DB::raw('updated_at'),
        ]);
    }

    public function down(): void
    {
        Schema::table('fiches_hebdomadaires', function (Blueprint $table) {
            $table->dropConstrainedForeignId('valide_par');
            $table->dropConstrainedForeignId('modification_autorisee_par');
            $table->dropColumn(['valide_at', 'modification_demandee_at', 'motif_demande_modification', 'modification_autorisee_at']);
        });
    }
};
