<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fiches_hebdomadaires', function (Blueprint $table) {
            $table->id();
            $table->foreignId('eleve_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('enseignant_id')->nullable()->constrained('users')->nullOnDelete();
            $table->date('date_debut');
            $table->date('date_fin');
            $table->string('sourate_debut');
            $table->unsignedSmallInteger('verset_debut');
            $table->string('sourate_fin');
            $table->unsignedSmallInteger('verset_fin');
            $table->string('debut_revision')->nullable();
            $table->string('fin_revision')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fiches_hebdomadaires');
    }
};
