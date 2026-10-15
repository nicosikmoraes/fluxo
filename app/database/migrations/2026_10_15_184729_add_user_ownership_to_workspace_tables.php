<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['projects', 'tasks', 'activities', 'comments', 'roadmaps', 'roadmap_nodes', 'roadmap_edges', 'daily_routines', 'daily_entries'] as $name) {
            Schema::table($name, function (Blueprint $table): void {
                $table->foreignId('user_id')->nullable()->index()->constrained()->cascadeOnDelete();
            });
        }
    }

    public function down(): void
    {
        foreach (['daily_entries', 'daily_routines', 'roadmap_edges', 'roadmap_nodes', 'roadmaps', 'comments', 'activities', 'tasks', 'projects'] as $name) {
            Schema::table($name, function (Blueprint $table): void {
                $table->dropConstrainedForeignId('user_id');
            });
        }
    }
};
