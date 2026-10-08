<?php
namespace App\Http\Controllers;
use App\Models\{Project,Roadmap,RoadmapNode,RoadmapEdge};
use Illuminate\Http\Request;
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
