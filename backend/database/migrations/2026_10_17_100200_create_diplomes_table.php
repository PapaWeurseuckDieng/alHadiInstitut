<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Diplômes délivrés aux élèves par l'administration (numéro DIP-AAAA-NNNNNN).
 * Un diplôme erroné est annulé avec un motif, jamais supprimé.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('diplomes', function (Blueprint $table) {
            $table->id();
            $table->string('numero', 30)->nullable()->unique();
            $table->foreignId('eleve_id')->constrained('eleves')->cascadeOnDelete();
            $table->string('type', 30);
            $table->string('intitule', 160);
            $table->string('mention', 20)->nullable();
            $table->date('date_obtention');
            $table->string('annee_scolaire', 9);
            // Classe de l'élève au moment de la délivrance (conservée pour l'impression)
            $table->string('classe', 120)->nullable();
            $table->text('observations')->nullable();
            $table->foreignId('delivre_par')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('annule_at')->nullable();
            $table->foreignId('annule_par')->nullable()->constrained('users')->nullOnDelete();
            $table->string('motif_annulation', 255)->nullable();
            $table->timestamps();

            $table->index(['eleve_id', 'annule_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('diplomes');
    }
};
