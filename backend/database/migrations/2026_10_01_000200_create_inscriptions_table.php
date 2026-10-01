<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('eleve_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('classe_academique_id')->constrained('classes_academiques')->cascadeOnDelete();
            $table->date('date_inscription');
            $table->decimal('montant_inscription', 12, 2);
            $table->string('mode_paiement', 20);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inscriptions');
    }
};
