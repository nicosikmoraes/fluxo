<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('roadmaps', function (Blueprint $table) {
            $table->string('card_type', 16)->default('activity');
        });

        Schema::table('roadmap_nodes', function (Blueprint $table) {
            $table->foreignId('task_id')->nullable()->after('activity_id')->constrained()->cascadeOnDelete();
            $table->foreignId('activity_id')->nullable()->change();
            $table->unique(['roadmap_id', 'task_id']);
        });
    }

    public function down(): void
    {
        Schema::table('roadmap_nodes', function (Blueprint $table) {
            $table->dropUnique(['roadmap_id', 'task_id']);
            $table->dropConstrainedForeignId('task_id');
            $table->foreignId('activity_id')->nullable(false)->change();
        });

        Schema::table('roadmaps', function (Blueprint $table) {
            $table->dropColumn('card_type');
        });
    }
};
