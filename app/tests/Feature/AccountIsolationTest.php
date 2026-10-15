<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AccountIsolationTest extends TestCase
{
    use RefreshDatabase;

    private function loginAs(User $user): void
    {
        $this->flushSession();
        $this->actingAs($user);
    }

    private function workspace(User $owner): array
    {
        $this->loginAs($owner);
        $project = $this->postJson('/api/projects', ['title' => 'Privado', 'cover' => 'desk'])->assertCreated()->json('id');
        $task = $this->postJson('/api/tasks', ['title' => 'Task privada', 'project_id' => $project])->assertCreated()->json('id');
        $activity = $this->postJson('/api/tasks/'.$task.'/activities', ['title' => 'Passo privado'])->assertCreated()->json('id');
        $comment = $this->postJson('/api/activities/'.$activity.'/comments', ['body' => 'Nota privada'])->assertCreated()->json('id');
        $roadmap = $this->postJson('/api/projects/'.$project.'/roadmaps', ['title' => 'Plano privado'])->assertCreated()->json('id');
        $node = $this->postJson('/api/roadmaps/'.$roadmap.'/nodes', ['activity_id' => $activity, 'x' => 10, 'y' => 10])->assertCreated()->json('id');
        $next = $this->postJson('/api/roadmaps/'.$roadmap.'/activities', ['title' => 'Outro passo', 'task_id' => $task, 'source_node_id' => $node, 'x' => 400, 'y' => 10])->assertCreated()->json();
        $edge = $next['edge']['id'];
        $entry = $this->postJson('/api/daily-list', ['date' => '2026-10-15', 'title' => 'Rotina privada', 'recurring' => true])->assertCreated()->json();

        return ['project' => $project, 'task' => $task, 'activity' => $activity, 'comment' => $comment, 'roadmap' => $roadmap, 'node' => $node, 'edge' => $edge, 'entry' => $entry['id'], 'routine' => $entry['routine_id']];
    }

    public static function protectedWrites(): array
    {
        return [
            'editar projeto' => ['PATCH', '/projects/{project}'],
            'excluir projeto' => ['DELETE', '/projects/{project}'],
            'ordenar roadmap do projeto' => ['POST', '/projects/{project}/roadmap/reorder'],
            'criar mapa' => ['POST', '/projects/{project}/roadmaps'],
            'editar task' => ['PATCH', '/tasks/{task}'],
            'agendar task' => ['PATCH', '/tasks/{task}/schedule'],
            'excluir task' => ['DELETE', '/tasks/{task}'],
            'criar atividade' => ['POST', '/tasks/{task}/activities'],
            'ordenar atividades' => ['POST', '/tasks/{task}/activities/reorder'],
            'editar atividade' => ['PATCH', '/activities/{activity}'],
            'excluir atividade' => ['DELETE', '/activities/{activity}'],
            'comentar' => ['POST', '/activities/{activity}/comments'],
            'editar comentário' => ['PATCH', '/comments/{comment}'],
            'excluir comentário' => ['DELETE', '/comments/{comment}'],
            'editar mapa' => ['PATCH', '/roadmaps/{roadmap}'],
            'excluir mapa' => ['DELETE', '/roadmaps/{roadmap}'],
            'adicionar card' => ['POST', '/roadmaps/{roadmap}/nodes'],
            'atividade conectada' => ['POST', '/roadmaps/{roadmap}/activities'],
            'mover seleção' => ['PATCH', '/roadmaps/{roadmap}/layout'],
            'mover card' => ['PATCH', '/roadmaps/{roadmap}/nodes/{node}'],
            'remover card' => ['DELETE', '/roadmaps/{roadmap}/nodes/{node}'],
            'conectar cards' => ['POST', '/roadmaps/{roadmap}/edges'],
            'excluir conexão' => ['DELETE', '/roadmaps/{roadmap}/edges/{edge}'],
            'editar lista diária' => ['PATCH', '/daily-list/{entry}'],
            'excluir lista diária' => ['DELETE', '/daily-list/{entry}'],
            'parar rotina' => ['PATCH', '/daily-routines/{routine}/stop'],
        ];
    }

    #[DataProvider('protectedWrites')]
    public function test_other_account_cannot_modify_a_record_and_receives_404(string $method, string $route): void
    {
        $owner = User::factory()->create();
        $ids = $this->workspace($owner);
        $this->loginAs(User::factory()->create());
        foreach ($ids as $name => $id) {
            $route = str_replace('{'.$name.'}', (string) $id, $route);
        }

        $this->json($method, '/api'.$route, [])->assertNotFound();
        $this->assertDatabaseHas('projects', ['id' => $ids['project'], 'user_id' => $owner->id, 'title' => 'Privado']);
        $this->assertDatabaseHas('activities', ['id' => $ids['activity'], 'status' => 'pending']);
        $this->assertDatabaseHas('daily_entries', ['id' => $ids['entry'], 'removed_at' => null]);
    }

    #[DataProvider('protectedWrites')]
    public function test_anonymous_write_returns_401(string $method, string $route): void
    {
        $route = preg_replace('/\{[^}]+\}/', '1', $route);

        $this->json($method, '/api'.$route, [])->assertUnauthorized();
        $this->assertDatabaseCount('projects', 0);
    }

    public function test_reading_and_carrying_daily_entries_only_affect_the_signed_in_account(): void
    {
        $owner = User::factory()->create();
        $ids = $this->workspace($owner);
        $this->loginAs(User::factory()->create());

        $this->getJson('/api/workspace')->assertOk()->assertJsonCount(0, 'projects')->assertJsonCount(0, 'tasks')->assertJsonCount(0, 'roadmaps');
        $this->getJson('/api/daily-list?date=2026-10-15')->assertOk()->assertJsonCount(0, 'entries');
        $this->postJson('/api/daily-list/carry', ['date' => '2026-10-15'])->assertOk();
        $this->assertDatabaseHas('daily_entries', ['id' => $ids['entry'], 'moved_to' => null, 'user_id' => $owner->id]);
        $this->assertDatabaseCount('daily_entries', 1);
    }

    public function test_foreign_ids_in_payloads_return_422_without_creating_cross_account_links(): void
    {
        $ids = $this->workspace(User::factory()->create());
        $user = User::factory()->create();
        $this->loginAs($user);
        $project = $this->postJson('/api/projects', ['title' => 'Meu projeto', 'cover' => 'mint'])->json('id');
        $roadmap = $this->postJson('/api/projects/'.$project.'/roadmaps', ['title' => 'Meu mapa'])->json('id');

        $this->postJson('/api/tasks', ['title' => 'Invasão', 'project_id' => $ids['project']])->assertUnprocessable()->assertJsonValidationErrors('project_id');
        $this->postJson('/api/tasks/reorder', ['ids' => [$ids['task']]])->assertUnprocessable();
        $this->postJson('/api/daily-list', ['date' => '2026-10-15', 'activity_id' => $ids['activity']])->assertUnprocessable();
        $this->postJson('/api/daily-list', ['date' => '2026-10-15', 'title' => 'Fora', 'project_id' => $ids['project']])->assertUnprocessable();
        $this->postJson('/api/roadmaps/'.$roadmap.'/nodes', ['activity_id' => $ids['activity'], 'x' => 0, 'y' => 0])->assertUnprocessable();
        $this->assertDatabaseMissing('tasks', ['user_id' => $user->id]);
        $this->assertDatabaseMissing('daily_entries', ['user_id' => $user->id]);
    }

    public function test_uploaded_images_are_private_and_cannot_be_attached_by_another_account(): void
    {
        Storage::fake('local');
        $owner = User::factory()->create();
        $this->loginAs($owner);
        $image = UploadedFile::fake()->createWithContent('cover.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYhQAAAAASUVORK5CYII='));
        $path = $this->postJson('/api/images', ['image' => $image])->assertCreated()->json('path');
        $this->getJson($path)->assertOk();
        Storage::disk('local')->assertExists(substr($path, 9));
        $this->loginAs(User::factory()->create());

        $this->getJson($path)->assertNotFound();
        $this->postJson('/api/tasks', ['title' => 'Outra conta', 'cover_path' => $path])->assertUnprocessable()->assertJsonValidationErrors('cover_path');
        Storage::disk('local')->assertExists(substr($path, 9));
        $this->loginAs($owner);
        $task = $this->postJson('/api/tasks', ['title' => 'Minha capa', 'cover_path' => $path])->assertCreated()->json('id');
        $this->deleteJson('/api/tasks/'.$task)->assertNoContent();
        Storage::disk('local')->assertMissing(substr($path, 9));
    }

    public function test_legacy_cover_is_only_served_to_its_imported_owner(): void
    {
        Storage::fake('public');
        $owner = User::factory()->create();
        $this->loginAs($owner);
        Storage::disk('public')->put('images/legacy.png', 'legacy image');
        $project = $this->postJson('/api/projects', ['title' => 'Antigo', 'cover' => 'desk'])->json('id');
        DB::table('projects')->where('id', $project)->update(['cover_path' => '/storage/images/legacy.png']);
        $this->getJson('/storage/images/legacy.png')->assertOk();
        $this->loginAs(User::factory()->create());

        $this->getJson('/storage/images/legacy.png')->assertNotFound();
        $this->postJson('/api/tasks', ['title' => 'Fora', 'cover_path' => '/storage/images/legacy.png'])->assertUnprocessable();
        Storage::disk('public')->assertExists('images/legacy.png');
    }
}
