<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('classes_academiques', function (Blueprint $table) {
            $table->string('annee_scolaire', 9)->nullable();
            $table->foreignId('oustaz_id')->nullable()->constrained('oustazs')->restrictOnDelete();
            $table->string('statut', 16)->default('active');
            $table->unique(['nom', 'annee_scolaire']);
        });

        Schema::table('inscriptions', function (Blueprint $table) {
            $table->dropForeign(['eleve_id']);
            $table->dropForeign(['classe_academique_id']);
            $table->foreignId('eleve_id')->change();
            $table->foreignId('classe_academique_id')->nullable()->change();
            $table->decimal('montant_inscription', 12, 2)->nullable()->change();
            $table->string('mode_paiement', 20)->nullable()->change();
        });

        Schema::table('inscriptions', function (Blueprint $table) {
            $table->foreign('eleve_id')->references('id')->on('eleves')->restrictOnDelete();
            $table->foreign('classe_academique_id')->references('id')->on('classes_academiques')->restrictOnDelete();
            $table->string('annee_scolaire', 9)->nullable();
            $table->string('statut', 16)->default('active');
            $table->foreignId('created_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->unique(['eleve_id', 'annee_scolaire']);
        });

        foreach (['fiches_hebdomadaires', 'paiements'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->dropForeign(['eleve_id']);
            });
            Schema::table($tableName, function (Blueprint $table) {
                $table->foreign('eleve_id')->references('id')->on('eleves')->restrictOnDelete();
            });
        }
    }

    public function down(): void
    {
        Schema::table('inscriptions', function (Blueprint $table) {
            $table->dropUnique(['eleve_id', 'annee_scolaire']);
            $table->dropForeign(['eleve_id']);
            $table->dropForeign(['classe_academique_id']);
            $table->dropForeign(['created_by']);
            $table->dropColumn(['annee_scolaire', 'statut', 'created_by']);
        });

        Schema::table('inscriptions', function (Blueprint $table) {
            $table->foreign('eleve_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('classe_academique_id')->references('id')->on('classes_academiques')->cascadeOnDelete();
            $table->foreignId('classe_academique_id')->nullable(false)->change();
            $table->decimal('montant_inscription', 12, 2)->nullable(false)->change();
            $table->string('mode_paiement', 20)->nullable(false)->change();
        });

        foreach (['fiches_hebdomadaires', 'paiements'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->dropForeign(['eleve_id']);
            });
            Schema::table($tableName, function (Blueprint $table) {
                $table->foreign('eleve_id')->references('id')->on('users')->cascadeOnDelete();
            });
        }

        Schema::table('classes_academiques', function (Blueprint $table) {
            $table->dropUnique(['nom', 'annee_scolaire']);
            $table->dropForeign(['oustaz_id']);
            $table->dropColumn(['annee_scolaire', 'oustaz_id', 'statut']);
        });
    }
};
