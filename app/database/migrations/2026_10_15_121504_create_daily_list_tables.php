<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('daily_routines', function (Blueprint $table) {
            $table->id();
            $table->string('title', 200);
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->boolean('priority')->default(false);
            $table->date('starts_on');
            $table->date('ends_on')->nullable();
            $table->timestamps();
        });

        Schema::create('daily_entries', function (Blueprint $table) {
            $table->id();
            $table->date('planned_for')->index();
            $table->foreignId('activity_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('daily_routine_id')->nullable()->constrained()->nullOnDelete();
            $table->string('title', 200)->nullable();
            $table->boolean('priority')->default(false);
            $table->boolean('focused')->default(false);
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('removed_at')->nullable();
            $table->date('moved_to')->nullable();
            $table->timestamps();
            $table->unique(['planned_for', 'activity_id']);
            $table->unique(['planned_for', 'daily_routine_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_entries');
        Schema::dropIfExists('daily_routines');
    }
};
