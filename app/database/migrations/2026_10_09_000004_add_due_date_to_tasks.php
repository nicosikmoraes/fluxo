<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void { Schema::table('tasks',fn(Blueprint $t)=>$t->date('due_date')->nullable()->index()); }
    public function down(): void { Schema::table('tasks',fn(Blueprint $t)=>$t->dropColumn('due_date')); }
};
