<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('work_days', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->date('work_date');
            $table->string('timezone', 100);
            $table->dateTime('started_at')->nullable();
            $table->dateTime('lunch_out_at')->nullable();
            $table->dateTime('lunch_in_at')->nullable();
            $table->dateTime('finished_at')->nullable();
            $table->text('regime');
            $table->unsignedInteger('version')->default(0);
            $table->timestamps();
            $table->unique(['user_id', 'work_date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('work_days');
    }
};
