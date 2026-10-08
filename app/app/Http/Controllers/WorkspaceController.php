<?php
namespace App\Http\Controllers;
use App\Models\{Project,Task,Activity,Comment,Roadmap,RoadmapNode};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{DB,Storage};
use Illuminate\Validation\Rule;
class WorkspaceController extends Controller {
    public function index() { return response()->json(['projects'=>Project::orderBy('id')->get(),'tasks'=>Task::with('activities.comments')->orderBy('position')->orderBy('id')->get(),'roadmaps'=>Roadmap::with('nodes','edges')->orderBy('id')->get()]); }
    private function imageRules(): array { return ['nullable','string','regex:#^/storage/images/[a-zA-Z0-9]+\.(jpg|jpeg|png|webp|gif)$#']; }
    private function projectData(Request $r): array { return $r->validate(['title'=>['required','string','max:160'],'cover'=>['required',Rule::in(['desk','violet','mint','peach'])],'cover_path'=>$this->imageRules()]); }
    private function taskData(Request $r): array { return $r->validate(['title'=>['required','string','max:200'],'description'=>['nullable','string','max:20000'],'project_id'=>['nullable','integer','exists:projects,id'],'cover_path'=>$this->imageRules()]); }
    private function removeImage(?string $url): void { if($url && str_starts_with($url,'/storage/images/')) Storage::disk('public')->delete(substr($url,9)); }
    public function createProject(Request $r) { return response()->json(Project::create($this->projectData($r)),201); }
    public function updateProject(Request $r,Project $project) { $d=$this->projectData($r); if($project->cover_path!==($d['cover_path']??null)) $this->removeImage($project->cover_path); $project->update($d); return $project; }
    public function deleteProject(Request $r,Project $project) {
        $d=$r->validate(['delete_tasks'=>['required','boolean']]);
        DB::transaction(function() use($d,$project) { if($d['delete_tasks']) foreach($project->tasks as $task) { $this->removeImage($task->cover_path); $task->delete(); } $this->removeImage($project->cover_path); $project->delete(); });
        return response()->noContent();
    }
    public function createTask(Request $r) { $d=$this->taskData($r); $d['position']=(Task::max('position')??-1)+1; return response()->json(Task::create($d)->load('activities.comments'),201); }
    public function updateTask(Request $r,Task $task) {
        $d=$this->taskData($r);
        if($task->cover_path!==($d['cover_path']??null)) $this->removeImage($task->cover_path);
        if(array_key_exists('project_id',$d)) $d['project_id']=$d['project_id']===null ? null : (int)$d['project_id'];
        $changedProject=array_key_exists('project_id',$d) && $task->project_id!==$d['project_id'];
        DB::transaction(function() use($task,$d,$changedProject) {
            $task->update($d);
            if($changedProject) {
                RoadmapNode::whereIn('activity_id',$task->activities()->pluck('id'))->delete();
                $next=$this->nextRoadmapPosition($task->project_id,$task->id);
                foreach($task->activities()->reorder()->orderBy('roadmap_position')->orderBy('position')->orderBy('id')->get() as $activity) {
                    $activity->update(['roadmap_position'=>$task->project_id ? $next++ : null]);
                }
            }
        });
        return $task->load('activities.comments');
    }
    public function deleteTask(Task $task) { $this->removeImage($task->cover_path); $task->delete(); return response()->noContent(); }
    private function nextRoadmapPosition(?int $projectId, ?int $excludeTask=null): int {
        return (Activity::whereHas('task',function($query) use($projectId,$excludeTask) {
            $query->where('project_id',$projectId);
            if($excludeTask) $query->where('id','!=',$excludeTask);
        })->max('roadmap_position')??-1)+1;
    }
    public function createActivity(Request $r,Task $task) {
        $d=$r->validate(['title'=>['required','string','max:200']]);
        $activity=DB::transaction(function() use($task,$d) {
            $d['position']=($task->activities()->max('position')??-1)+1;
            $d['roadmap_position']=$task->project_id ? $this->nextRoadmapPosition($task->project_id) : null;
            return $task->activities()->create($d);
        });
        return response()->json($activity->refresh()->load('comments'),201);
    }
    public function reorderRoadmap(Request $r, Project $project) {
        $taskIds=$project->tasks()->pluck('id');
        $d=$r->validate(['ids'=>['required','array','min:1'],'ids.*'=>['required','integer','distinct',Rule::exists('activities','id')->whereIn('task_id',$taskIds)]]);
        return DB::transaction(function() use($d,$taskIds) {
            if(count($d['ids'])!==Activity::whereIn('task_id',$taskIds)->count()) return response()->json(['message'=>'As atividades do projeto mudaram. Atualize o roadmap.'],422);
            foreach($d['ids'] as $position=>$id) Activity::whereKey($id)->update(['roadmap_position'=>$position]);
            return response()->noContent();
        });
    }
    public function updateActivity(Request $r,Activity $activity) {
        $d=$r->validate(['title'=>['sometimes','required','string','max:200'],'status'=>['sometimes',Rule::in(['pending','doing','done'])],'blocked'=>['sometimes','boolean'],'blocking_person'=>['nullable','string','max:160'],'blocking_reason'=>['nullable','string','max:5000']]);
        $blocked=$d['blocked']??$activity->blocked; $status=$d['status']??$activity->status;
        if($blocked) {
            $r->merge(['blocking_person'=>$d['blocking_person']??$activity->blocking_person,'blocking_reason'=>$d['blocking_reason']??$activity->blocking_reason]);
            $d=array_merge($d,$r->validate(['blocking_person'=>['required','string','max:160'],'blocking_reason'=>['required','string','max:5000']]));
            if($status==='done') return response()->json(['message'=>'Desbloqueie a atividade antes de concluí-la.'],422);
            $d['blocked_at']=$activity->blocked_at??now();
        } else { $d['blocking_person']=null; $d['blocking_reason']=null; $d['blocked_at']=null; }
        $activity->update($d); return $activity->load('comments');
    }
    public function deleteActivity(Activity $activity) { $activity->delete(); return response()->noContent(); }
    public function createComment(Request $r,Activity $activity) { return response()->json($activity->comments()->create($r->validate(['body'=>['required','string','max:10000']])),201); }
    public function updateComment(Request $r,Comment $comment) { $comment->update($r->validate(['body'=>['required','string','max:10000']])); return $comment; }
    public function deleteComment(Comment $comment) { $comment->delete(); return response()->noContent(); }
    public function reorderTasks(Request $r) {
        $d=$r->validate(['ids'=>['required','array','min:1'],'ids.*'=>['required','integer','distinct','exists:tasks,id']]);
        $slots=Task::whereIn('id',$d['ids'])->orderBy('position')->orderBy('id')->pluck('position');
        DB::transaction(fn()=>collect($d['ids'])->each(fn($id,$i)=>Task::whereKey($id)->update(['position'=>$slots[$i]])));
        return response()->noContent();
    }
    public function reorderActivities(Request $r,Task $task) {
        $d=$r->validate(['ids'=>['required','array','min:1'],'ids.*'=>['required','integer','distinct',Rule::exists('activities','id')->where('task_id',$task->id)]]);
        if(count($d['ids'])!==$task->activities()->count()) return response()->json(['message'=>'A lista de atividades mudou. Atualize o quadro.'],422);
        DB::transaction(fn()=>collect($d['ids'])->each(fn($id,$i)=>Activity::whereKey($id)->update(['position'=>$i])));
        return response()->noContent();
    }
    public function uploadImage(Request $r) { $r->validate(['image'=>['required','file','mimes:jpg,jpeg,png,webp,gif','max:8192']]); $path=$r->file('image')->store('images','public'); return response()->json(['path'=>'/storage/'.$path],201); }
}
