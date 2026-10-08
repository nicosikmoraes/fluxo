<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\{Schema,DB};
return new class extends Migration {
    public function up(): void {
        Schema::create('roadmaps',function(Blueprint $t) {
            $t->id(); $t->foreignId('project_id')->constrained()->cascadeOnDelete(); $t->string('title',160); $t->timestamps();
        });
        Schema::create('roadmap_nodes',function(Blueprint $t) {
            $t->id(); $t->foreignId('roadmap_id')->constrained()->cascadeOnDelete();
            $t->foreignId('activity_id')->constrained()->cascadeOnDelete();
            $t->double('x'); $t->double('y'); $t->unique(['roadmap_id','activity_id']);
        });
        Schema::create('roadmap_edges',function(Blueprint $t) {
            $t->id(); $t->foreignId('roadmap_id')->constrained()->cascadeOnDelete();
            $t->foreignId('source_node_id')->constrained('roadmap_nodes')->cascadeOnDelete();
            $t->foreignId('target_node_id')->constrained('roadmap_nodes')->cascadeOnDelete();
            $t->unique(['roadmap_id','source_node_id','target_node_id']);
        });
        // Preserve existing ordered roadmaps as connected cards in the first map.
        foreach(DB::table('projects')->get() as $project) {
            $activities=DB::table('activities')->join('tasks','tasks.id','=','activities.task_id')
                ->where('tasks.project_id',$project->id)->orderBy('activities.roadmap_position')->orderBy('activities.id')->select('activities.id')->get();
            if($activities->isEmpty()) continue;
            $map=DB::table('roadmaps')->insertGetId(['project_id'=>$project->id,'title'=>'Roadmap principal','created_at'=>now(),'updated_at'=>now()]);
            $previous=null;
            foreach($activities as $i=>$activity) {
                $node=DB::table('roadmap_nodes')->insertGetId(['roadmap_id'=>$map,'activity_id'=>$activity->id,'x'=>80+$i*360,'y'=>160]);
                if($previous) DB::table('roadmap_edges')->insert(['roadmap_id'=>$map,'source_node_id'=>$previous,'target_node_id'=>$node]);
                $previous=$node;
            }
        }
    }
    public function down(): void { Schema::dropIfExists('roadmap_edges'); Schema::dropIfExists('roadmap_nodes'); Schema::dropIfExists('roadmaps'); }
};
