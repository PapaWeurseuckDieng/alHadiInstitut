<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Frais d'inscription :
 *  - montant fixé par l'administration pour chaque classe (vide = montant par défaut, config/paiements.php) ;
 *  - reçu numéroté (INS-AAAA-NNNNNN) émis à l'encaissement, consultable par le tuteur.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('classes_academiques', function (Blueprint $table) {
            $table->decimal('frais_inscription', 12, 2)->nullable()->after('mensualite');
        });

        Schema::table('inscriptions', function (Blueprint $table) {
            $table->string('numero_recu_inscription', 30)->nullable()->unique();
            $table->date('date_paiement_inscription')->nullable();
            $table->foreignId('frais_encaisse_par')->nullable()->constrained('users')->nullOnDelete();
        });

        // Frais déjà encaissés avant cette évolution : on leur attribue un reçu
        DB::table('inscriptions')->whereNotNull('montant_inscription')->orderBy('id')->get()
            ->each(fn ($inscription) => DB::table('inscriptions')->where('id', $inscription->id)->update([
                'numero_recu_inscription' => sprintf('INS-%s-%06d', substr((string) ($inscription->created_at ?? now()), 0, 4), $inscription->id),
                'date_paiement_inscription' => $inscription->date_inscription,
                'frais_encaisse_par' => $inscription->created_by,
            ]));
    }

    public function down(): void
    {
        Schema::table('inscriptions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('frais_encaisse_par');
            $table->dropUnique(['numero_recu_inscription']);
            $table->dropColumn(['numero_recu_inscription', 'date_paiement_inscription']);
        });
        Schema::table('classes_academiques', function (Blueprint $table) {
            $table->dropColumn('frais_inscription');
        });
    }
};
