<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ImportLegacyWorkspaceTest extends TestCase
{
    use RefreshDatabase;

    public function test_legacy_data_is_only_assigned_after_explicit_confirmation(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $legacy = DB::table('projects')->insertGetId(['title' => 'Legado', 'cover' => 'desk']);
        DB::table('projects')->insert(['title' => 'Outra conta', 'cover' => 'mint', 'user_id' => $other->id]);

        $this->artisan('workspace:import-legacy', ['email' => $owner->email, '--dry-run' => true])->assertSuccessful();
        $this->assertDatabaseHas('projects', ['id' => $legacy, 'user_id' => null]);
        $this->artisan('workspace:import-legacy', ['email' => $owner->email])->assertFailed();
        $this->assertDatabaseHas('projects', ['id' => $legacy, 'user_id' => null]);
        $this->artisan('workspace:import-legacy', ['email' => $owner->email, '--confirm' => true])->assertSuccessful();
        $this->assertDatabaseHas('projects', ['id' => $legacy, 'user_id' => $owner->id]);
        $this->assertDatabaseHas('projects', ['title' => 'Outra conta', 'user_id' => $other->id]);
        $this->actingAs($owner)->getJson('/api/workspace')->assertOk()->assertJsonCount(1, 'projects')->assertJsonPath('projects.0.id', $legacy);
    }

    public function test_signup_does_not_claim_legacy_records(): void
    {
        DB::table('projects')->insert(['title' => 'Dados anteriores', 'cover' => 'desk']);

        $this->postJson('/api/auth/register', ['name' => 'Conta', 'email' => 'conta@example.com', 'password' => 'uma senha longa 123', 'password_confirmation' => 'uma senha longa 123'])->assertCreated();
        $this->getJson('/api/workspace')->assertOk()->assertJsonCount(0, 'projects');
        $this->assertDatabaseHas('projects', ['title' => 'Dados anteriores', 'user_id' => null]);
    }

    public function test_import_requires_an_existing_account_and_local_environment(): void
    {
        $this->artisan('workspace:import-legacy', ['email' => 'ausente@example.com', '--confirm' => true])->assertFailed();
        $owner = User::factory()->create();
        DB::table('projects')->insert(['title' => 'Sem dono', 'cover' => 'desk']);
        $this->app['env'] = 'production';

        $this->artisan('workspace:import-legacy', ['email' => $owner->email, '--confirm' => true])->assertFailed();
        $this->assertDatabaseHas('projects', ['title' => 'Sem dono', 'user_id' => null]);
    }

    public function test_import_preserves_the_entire_legacy_project_graph(): void
    {
        $user = User::factory()->create();
        $project = DB::table('projects')->insertGetId(['title' => 'Projeto antigo', 'cover' => 'desk']);
        $task = DB::table('tasks')->insertGetId(['title' => 'Task antiga', 'project_id' => $project]);
        $activity = DB::table('activities')->insertGetId(['title' => 'Atividade antiga', 'task_id' => $task]);
        DB::table('comments')->insert(['activity_id' => $activity, 'body' => 'Comentário antigo']);
        $roadmap = DB::table('roadmaps')->insertGetId(['title' => 'Mapa antigo', 'project_id' => $project]);
        $node = DB::table('roadmap_nodes')->insertGetId(['roadmap_id' => $roadmap, 'activity_id' => $activity, 'x' => 30, 'y' => 20]);
        $nextActivity = DB::table('activities')->insertGetId(['title' => 'Próximo passo', 'task_id' => $task]);
        $nextNode = DB::table('roadmap_nodes')->insertGetId(['roadmap_id' => $roadmap, 'activity_id' => $nextActivity, 'x' => 400, 'y' => 20]);
        DB::table('roadmap_edges')->insert(['roadmap_id' => $roadmap, 'source_node_id' => $node, 'target_node_id' => $nextNode]);
        $routine = DB::table('daily_routines')->insertGetId(['title' => 'Rotina antiga', 'starts_on' => '2026-10-15']);
        DB::table('daily_entries')->insert(['planned_for' => '2026-10-15', 'title' => 'Rotina antiga', 'daily_routine_id' => $routine]);

        $this->artisan('workspace:import-legacy', ['email' => $user->email, '--confirm' => true])->assertSuccessful();
        $this->actingAs($user)->getJson('/api/workspace')->assertOk()->assertJsonCount(1, 'projects')->assertJsonCount(2, 'tasks.0.activities')->assertJsonPath('tasks.0.activities.0.comments.0.body', 'Comentário antigo')->assertJsonCount(2, 'roadmaps.0.nodes')->assertJsonCount(1, 'roadmaps.0.edges');
        $this->getJson('/api/daily-list?date=2026-10-15')->assertOk()->assertJsonCount(1, 'entries')->assertJsonPath('entries.0.title', 'Rotina antiga');
    }
}
