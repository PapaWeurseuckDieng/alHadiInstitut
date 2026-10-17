<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Dépenses de l'institut : complète la table initiale (catégorie, description, montant,
 * date, statut) avec le mode de paiement, le bénéficiaire, l'année scolaire et le suivi
 * de qui a saisi puis validé ou rejeté la dépense.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('depenses', function (Blueprint $table) {
            $table->string('mode_paiement', 20)->nullable()->after('montant');
            $table->string('beneficiaire', 120)->nullable()->after('mode_paiement');
            $table->string('annee_scolaire', 9)->nullable()->after('date_depense');
            $table->foreignId('created_by')->nullable()->after('statut')->constrained('users')->restrictOnDelete();
            $table->foreignId('traite_par')->nullable()->after('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('traite_at')->nullable()->after('traite_par');
            $table->string('motif_rejet', 255)->nullable()->after('traite_at');

            $table->index(['annee_scolaire', 'statut']);
            $table->index('date_depense');
        });
    }

    public function down(): void
    {
        Schema::table('depenses', function (Blueprint $table) {
            $table->dropIndex(['annee_scolaire', 'statut']);
            $table->dropIndex(['date_depense']);
            $table->dropForeign(['created_by']);
            $table->dropForeign(['traite_par']);
            $table->dropColumn(['mode_paiement', 'beneficiaire', 'annee_scolaire', 'created_by', 'traite_par', 'traite_at', 'motif_rejet']);
        });
    }
};
