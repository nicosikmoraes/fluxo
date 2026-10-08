<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void {
        Schema::create('projects', function (Blueprint $t) {
            $t->id(); $t->string('title',160); $t->string('cover',20)->default('desk'); $t->string('cover_path')->nullable(); $t->timestamps();
        });
        Schema::create('tasks', function (Blueprint $t) {
            $t->id(); $t->foreignId('project_id')->nullable()->constrained()->nullOnDelete(); $t->string('title',200); $t->text('description')->nullable(); $t->string('cover_path')->nullable(); $t->unsignedInteger('position')->default(0); $t->timestamps();
        });
        Schema::create('activities', function (Blueprint $t) {
            $t->id(); $t->foreignId('task_id')->constrained()->cascadeOnDelete(); $t->string('title',200); $t->string('status',20)->default('pending'); $t->boolean('blocked')->default(false); $t->string('blocking_person',160)->nullable(); $t->text('blocking_reason')->nullable(); $t->timestamp('blocked_at')->nullable(); $t->unsignedInteger('position')->default(0); $t->timestamps();
        });
        Schema::create('comments', function (Blueprint $t) {
            $t->id(); $t->foreignId('activity_id')->constrained()->cascadeOnDelete(); $t->text('body'); $t->timestamps();
        });
    }
    public function down(): void { Schema::dropIfExists('comments'); Schema::dropIfExists('activities'); Schema::dropIfExists('tasks'); Schema::dropIfExists('projects'); }
};
