<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
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
    }

    public function down(): void
    {
        Schema::dropIfExists('paiements');
    }
};
