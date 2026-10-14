<?php
namespace App\Http\Controllers;
use App\Models\{Project,Task,Activity,Roadmap,RoadmapNode,RoadmapEdge};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
class RoadmapController extends Controller {
    public function create(Request $r,Project $project) {
        $d=$r->validate(['title'=>['required','string','max:160']]);
        return response()->json(Roadmap::create($d+['project_id'=>$project->id])->load('nodes','edges'),201);
    }
    public function update(Request $r,Roadmap $roadmap) {
        $roadmap->update($r->validate(['title'=>['required','string','max:160']])); return $roadmap;
    }
    public function delete(Roadmap $roadmap) { $roadmap->delete(); return response()->noContent(); }
    private function coordinates(): array { return ['x'=>['required','numeric','min:0','max:1000000'],'y'=>['required','numeric','min:0','max:1000000']]; }
    public function addNode(Request $r,Roadmap $roadmap) {
        $taskIds=Project::findOrFail($roadmap->project_id)->tasks()->pluck('id');
        $d=$r->validate($this->coordinates()+['activity_id'=>['required','integer',Rule::exists('activities','id')->whereIn('task_id',$taskIds),Rule::unique('roadmap_nodes','activity_id')->where('roadmap_id',$roadmap->id)]]);
        return response()->json($roadmap->nodes()->create($d),201);
    }
    public function createConnectedActivity(Request $r,Roadmap $roadmap) {
        $d=$r->validate($this->coordinates()+[
            'title'=>['required','string','max:200'],
            'task_id'=>['required','integer',Rule::exists('tasks','id')->where('project_id',$roadmap->project_id)],
            'source_node_id'=>['required','integer',Rule::exists('roadmap_nodes','id')->where('roadmap_id',$roadmap->id)],
        ]);
        return DB::transaction(function() use($roadmap,$d) {
            $task=Task::where('project_id',$roadmap->project_id)->findOrFail($d['task_id']);
            $source=$roadmap->nodes()->findOrFail($d['source_node_id']);
            $activity=$task->activities()->create([
                'title'=>$d['title'],
                'position'=>($task->activities()->max('position')??-1)+1,
                'roadmap_position'=>(Activity::whereHas('task',fn($q)=>$q->where('project_id',$roadmap->project_id))->max('roadmap_position')??-1)+1,
            ]);
            $node=$roadmap->nodes()->create(['activity_id'=>$activity->id,'x'=>$d['x'],'y'=>$d['y']]);
            $edge=$roadmap->edges()->create(['source_node_id'=>$source->id,'target_node_id'=>$node->id]);
            return response()->json(['activity'=>$activity->refresh()->load('comments'),'node'=>$node,'edge'=>$edge],201);
        });
    }
    public function moveNode(Request $r,Roadmap $roadmap,RoadmapNode $node) {
        abort_unless($node->roadmap_id===$roadmap->id,404); $node->update($r->validate($this->coordinates())); return $node;
    }
    public function deleteNode(Roadmap $roadmap,RoadmapNode $node) {
        abort_unless($node->roadmap_id===$roadmap->id,404); $node->delete(); return response()->noContent();
    }
    public function addEdge(Request $r,Roadmap $roadmap) {
        $exists=Rule::exists('roadmap_nodes','id')->where('roadmap_id',$roadmap->id);
        $d=$r->validate(['source_node_id'=>['required','integer',$exists],'target_node_id'=>['required','integer','different:source_node_id',$exists]]);
        return response()->json($roadmap->edges()->firstOrCreate($d),201);
    }
    public function deleteEdge(Roadmap $roadmap,RoadmapEdge $edge) {
        abort_unless($edge->roadmap_id===$roadmap->id,404); $edge->delete(); return response()->noContent();
    }
}
