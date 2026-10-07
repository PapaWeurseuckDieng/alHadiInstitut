<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['users', 'eleves', 'classes_academiques', 'inscriptions'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->boolean('is_archived')->default(false);
                $table->timestamp('archived_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        foreach (['users', 'eleves', 'classes_academiques', 'inscriptions'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->dropColumn(['is_archived', 'archived_at']);
            });
        }
    }
};
