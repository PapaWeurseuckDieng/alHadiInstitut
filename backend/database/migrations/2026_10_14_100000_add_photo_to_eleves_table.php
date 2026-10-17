<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Photo de l'élève (chemin relatif sur le disque « public »), prise lors de l'inscription
 * ou ajoutée plus tard. Les comptes (users) ont déjà une colonne photo.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('eleves', function (Blueprint $table) {
            $table->string('photo')->nullable()->after('adresse');
        });
    }

    public function down(): void
    {
        Schema::table('eleves', function (Blueprint $table) {
            $table->dropColumn('photo');
        });
    }
};
