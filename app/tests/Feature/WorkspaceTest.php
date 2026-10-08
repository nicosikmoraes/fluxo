<?php
namespace Tests\Feature;
use App\Models\{Task,Activity,Comment,Project};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;
class WorkspaceTest extends TestCase {
    use RefreshDatabase;
    private function task(array $data=[]): int { return $this->postJson('/api/tasks',array_merge(['title'=>'Minha task','project_id'=>null,'description'=>null,'cover_path'=>null],$data))->assertCreated()->json('id'); }
    private function activity(int $task,string $title='Meu passo'): int { return $this->postJson('/api/tasks/'.$task.'/activities',['title'=>$title])->assertCreated()->json('id'); }
    private function status(): string { return $this->getJson('/api/workspace')->assertOk()->json('tasks.0.status'); }
    public function test_status_is_derived_from_activities_and_empty_tasks_start_pending(): void {
        $t=$this->task(); $this->assertSame('pending',$this->status());
        $a=$this->activity($t); $b=$this->activity($t);
        $this->patchJson('/api/activities/'.$a,['status'=>'doing'])->assertOk(); $this->assertSame('doing',$this->status());
        $this->patchJson('/api/activities/'.$a,['status'=>'done'])->assertOk(); $this->assertSame('doing',$this->status());
        $this->patchJson('/api/activities/'.$b,['status'=>'done'])->assertOk(); $this->assertSame('done',$this->status());
        $this->patchJson('/api/activities/'.$b,['status'=>'pending'])->assertOk(); $this->assertSame('doing',$this->status());
        $this->deleteJson('/api/activities/'.$a)->assertNoContent(); $this->assertSame('pending',$this->status());
    }
    public function test_blocks_require_person_and_reason_and_must_be_removed_before_completion(): void {
        $a=$this->activity($this->task());
        $this->patchJson('/api/activities/'.$a,['blocked'=>true])->assertUnprocessable()->assertJsonValidationErrors(['blocking_person','blocking_reason']);
        $this->patchJson('/api/activities/'.$a,['blocked'=>true,'blocking_person'=>'Mariana','blocking_reason'=>'Liberar API'])->assertOk()->assertJsonPath('blocked',true);
        $this->getJson('/api/workspace')->assertJsonPath('tasks.0.blocked_count',1)->assertJsonPath('tasks.0.status','pending');
        $this->patchJson('/api/activities/'.$a,['status'=>'done'])->assertUnprocessable();
        $this->patchJson('/api/activities/'.$a,['blocked'=>false])->assertOk()->assertJsonPath('blocking_person',null)->assertJsonPath('blocked_at',null);
        $this->patchJson('/api/activities/'.$a,['status'=>'done'])->assertOk();
    }
    public function test_multiple_comments_can_be_edited_deleted_and_cascade_with_activity(): void {
        $a=$this->activity($this->task());
        $c=$this->postJson('/api/activities/'.$a.'/comments',['body'=>'Primeira decisão'])->assertCreated()->json('id');
        $this->postJson('/api/activities/'.$a.'/comments',['body'=>'Outra ideia'])->assertCreated();
        $this->patchJson('/api/comments/'.$c,['body'=>'Decisão revisada'])->assertOk()->assertJsonPath('body','Decisão revisada');
        $this->getJson('/api/workspace')->assertJsonPath('tasks.0.comments_count',2);
        $this->deleteJson('/api/comments/'.$c)->assertNoContent();
        $this->deleteJson('/api/activities/'.$a)->assertNoContent();$this->assertDatabaseCount('comments',0);
    }
    public function test_project_deletion_can_keep_or_permanently_delete_tasks(): void {
        $p=$this->postJson('/api/projects',['title'=>'Projeto','cover'=>'desk'])->assertCreated()->json('id');
        $t=$this->task(['project_id'=>$p]); $this->deleteJson('/api/projects/'.$p,['delete_tasks'=>false])->assertNoContent();
        $this->assertDatabaseHas('tasks',['id'=>$t,'project_id'=>null]);
        $p=$this->postJson('/api/projects',['title'=>'Outro','cover'=>'mint'])->json('id');
        $t=$this->task(['project_id'=>$p]);$a=$this->activity($t);
        $this->postJson('/api/activities/'.$a.'/comments',['body'=>'Comentário'])->assertCreated();
        $this->deleteJson('/api/projects/'.$p,['delete_tasks'=>true])->assertNoContent();
        $this->assertDatabaseMissing('tasks',['id'=>$t]);$this->assertDatabaseCount('activities',0);$this->assertDatabaseCount('comments',0);
    }
    public function test_reordering_persists_and_rejects_activities_from_other_tasks(): void {
        $t=$this->task();$other=$this->task(['title'=>'Outra']);$a=$this->activity($t,'Primeiro');$b=$this->activity($t,'Segundo');$outside=$this->activity($other);
        $this->postJson('/api/tasks/'.$t.'/activities/reorder',['ids'=>[$b,$a]])->assertNoContent();
        $this->getJson('/api/workspace')->assertJsonPath('tasks.0.activities.0.id',$b);
        $this->postJson('/api/tasks/'.$t.'/activities/reorder',['ids'=>[$outside,$a]])->assertUnprocessable();
        $this->postJson('/api/tasks/'.$t.'/activities/reorder',['ids'=>[$a,$a]])->assertUnprocessable();
        $this->postJson('/api/tasks/reorder',['ids'=>[$other,$t]])->assertNoContent();
        $this->getJson('/api/workspace')->assertJsonPath('tasks.0.id',$other);
    }
    public function test_invalid_input_and_external_browser_origins_are_rejected(): void {
        $this->postJson('/api/tasks',['title'=>''])->assertUnprocessable();
        $this->postJson('/api/tasks',['title'=>'Task','project_id'=>999])->assertUnprocessable();
        $this->withHeader('Origin','https://example.com')->postJson('/api/tasks',['title'=>'Cross site'])->assertForbidden();
    }
    public function test_task_deletion_removes_all_children(): void {
        $t=$this->task();$a=$this->activity($t);$this->postJson('/api/activities/'.$a.'/comments',['body'=>'Nota'])->assertCreated();
        $this->deleteJson('/api/tasks/'.$t)->assertNoContent();$this->assertDatabaseCount('tasks',0);$this->assertDatabaseCount('activities',0);$this->assertDatabaseCount('comments',0);
    }
}
