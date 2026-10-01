<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('fiche_hebdomadaire_id')->constrained('fiches_hebdomadaires')->cascadeOnDelete();
            $table->string('jour', 10);
            $table->string('nouvelle_lecon')->nullable();
            $table->string('revision_partielle')->nullable();
            $table->string('revision_generale')->nullable();
            $table->timestamps();

            $table->unique(['fiche_hebdomadaire_id', 'jour']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notes');
    }
};
