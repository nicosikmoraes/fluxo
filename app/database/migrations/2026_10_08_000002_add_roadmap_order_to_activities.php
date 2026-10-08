<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{DB, Schema};
return new class extends Migration {
    public function up(): void {
        Schema::table('activities', fn(Blueprint $table) => $table->unsignedInteger('roadmap_position')->nullable());
        foreach (DB::table('projects')->pluck('id') as $projectId) {
            $ids = DB::table('activities')->join('tasks', 'tasks.id', '=', 'activities.task_id')
                ->where('tasks.project_id', $projectId)->orderBy('tasks.position')->orderBy('tasks.id')
                ->orderBy('activities.position')->orderBy('activities.id')->pluck('activities.id');
            foreach ($ids as $position => $id) DB::table('activities')->where('id', $id)->update(['roadmap_position' => $position]);
        }
    }
    public function down(): void { Schema::table('activities', fn(Blueprint $table) => $table->dropColumn('roadmap_position')); }
};
