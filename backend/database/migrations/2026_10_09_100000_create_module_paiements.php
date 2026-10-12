<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Module « mensualités » :
 *  - tarif mensuel par classe (classes_academiques.mensualite) ;
 *  - paiements reçus au secrétariat, un reçu par paiement (table paiements) ;
 *  - journal des rappels WhatsApp envoyés aux parents (table rappels_paiement).
 *
 * L'ancienne table « paiements » (ébauche jamais utilisée, liée à users) est remplacée.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('classes_academiques', function (Blueprint $table) {
            // Mensualité de la classe ; vide = tarif par défaut (config/paiements.php)
            $table->decimal('mensualite', 12, 2)->nullable();
        });

        Schema::dropIfExists('paiements');

        Schema::create('paiements', function (Blueprint $table) {
            $table->id();
            $table->string('numero_recu', 30)->nullable()->unique();
            $table->foreignId('eleve_id')->constrained('eleves')->cascadeOnDelete();
            $table->foreignId('inscription_id')->nullable()->constrained('inscriptions')->nullOnDelete();
            $table->string('annee_scolaire', 9);
            // Mois payé, au format AAAA-MM (ex. 2026-10)
            $table->string('mois', 7);
            // Mensualité due au moment du paiement (conservée pour le reçu)
            $table->decimal('montant_du', 12, 2);
            $table->decimal('montant', 12, 2);
            $table->string('mode_paiement', 20)->default('especes');
            $table->date('date_paiement');
            $table->string('note', 255)->nullable();
            $table->foreignId('encaisse_par')->nullable()->constrained('users')->nullOnDelete();
            // Un reçu erroné est annulé, jamais supprimé (traçabilité de la caisse)
            $table->timestamp('annule_at')->nullable();
            $table->foreignId('annule_par')->nullable()->constrained('users')->nullOnDelete();
            $table->string('motif_annulation', 255)->nullable();
            $table->timestamps();

            $table->index(['mois', 'eleve_id']);
        });

        Schema::create('rappels_paiement', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tuteur_id')->constrained('tuteurs')->cascadeOnDelete();
            $table->string('mois', 7);
            $table->string('canal', 20)->default('whatsapp');
            $table->string('telephone', 30);
            // envoye | simule (pilote log) | echec
            $table->string('statut', 20);
            $table->boolean('automatique')->default(true);
            $table->text('message');
            $table->text('erreur')->nullable();
            $table->foreignId('envoye_par')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['mois', 'tuteur_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rappels_paiement');
        Schema::dropIfExists('paiements');

        // Restaure l'ébauche d'origine
        Schema::create('paiements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('eleve_id')->constrained('users')->cascadeOnDelete();
            $table->date('date_paiement');
            $table->decimal('montant_fixe', 12, 2);
            $table->decimal('remise', 12, 2)->default(0);
            $table->decimal('montant_paye', 12, 2)->default(0);
            $table->string('mode_paiement', 20);
            $table->string('statut', 20)->default('impaye');
            $table->timestamps();
        });

        Schema::table('classes_academiques', function (Blueprint $table) {
            $table->dropColumn('mensualite');
        });
    }
};
