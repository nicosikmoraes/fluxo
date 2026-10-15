<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoadmapCardTypesTest extends TestCase
{
    use RefreshDatabase;

    public function createApplication(): Application
    {
        $app = parent::createApplication();
        if ($app['config']->get('database.default') !== 'sqlite' || $app['config']->get('database.connections.sqlite.database') !== ':memory:') {
            throw new \RuntimeException('Estes testes só podem usar SQLite em memória.');
        }

        return $app;
    }

    public function test_new_roadmaps_choose_a_card_type_and_existing_behavior_defaults_to_activities(): void
    {
        $this->actingAs(User::factory()->create());
        $project = $this->postJson('/api/projects', ['title' => 'Projeto', 'cover' => 'desk'])->assertCreated()->json('id');

        $this->postJson('/api/projects/'.$project.'/roadmaps', ['title' => 'Etapas'])->assertCreated()->assertJsonPath('card_type', 'activity');
        $this->postJson('/api/projects/'.$project.'/roadmaps', ['title' => 'Entregas', 'card_type' => 'task'])->assertCreated()->assertJsonPath('card_type', 'task');
        $this->postJson('/api/projects/'.$project.'/roadmaps', ['title' => 'Inválido', 'card_type' => 'project'])->assertUnprocessable();
    }

    public function test_task_map_cards_only_reference_tasks_and_do_not_change_their_activities(): void
    {
        $this->actingAs(User::factory()->create());
        $project = $this->postJson('/api/projects', ['title' => 'Projeto', 'cover' => 'desk'])->assertCreated()->json('id');
        $task = $this->postJson('/api/tasks', ['title' => 'Entrega', 'project_id' => $project])->assertCreated()->json('id');
        $activity = $this->postJson('/api/tasks/'.$task.'/activities', ['title' => 'Preparar entrega'])->assertCreated()->json('id');
        $map = $this->postJson('/api/projects/'.$project.'/roadmaps', ['title' => 'Visão geral', 'card_type' => 'task'])->assertCreated()->json('id');

        $node = $this->postJson('/api/roadmaps/'.$map.'/nodes', ['task_id' => $task, 'x' => 100, 'y' => 120])->assertCreated()->assertJsonPath('task_id', $task)->assertJsonPath('activity_id', null)->json();
        $this->postJson('/api/roadmaps/'.$map.'/nodes', ['activity_id' => $activity, 'x' => 400, 'y' => 120])->assertUnprocessable();
        $this->assertDatabaseHas('activities', ['id' => $activity, 'title' => 'Preparar entrega', 'status' => 'pending']);
        $this->assertDatabaseHas('tasks', ['id' => $task, 'title' => 'Entrega']);
        $this->assertDatabaseHas('roadmap_nodes', ['id' => $node['id'], 'task_id' => $task, 'activity_id' => null]);
    }

    public function test_task_map_can_create_a_new_connected_task_without_rewriting_the_source_task(): void
    {
        $this->actingAs(User::factory()->create());
        $project = $this->postJson('/api/projects', ['title' => 'Projeto', 'cover' => 'desk'])->assertCreated()->json('id');
        $sourceTask = $this->postJson('/api/tasks', ['title' => 'Pesquisa', 'project_id' => $project])->assertCreated()->json('id');
        $map = $this->postJson('/api/projects/'.$project.'/roadmaps', ['title' => 'Fluxo', 'card_type' => 'task'])->assertCreated()->json('id');
        $source = $this->postJson('/api/roadmaps/'.$map.'/nodes', ['task_id' => $sourceTask, 'x' => 100, 'y' => 100])->assertCreated()->json('id');

        $result = $this->postJson('/api/roadmaps/'.$map.'/tasks', ['title' => 'Implementação', 'source_node_id' => $source, 'x' => 440, 'y' => 100])->assertCreated();
        $target = $result->json('node.id');
        $newTask = $result->json('task.id');
        $result->assertJsonPath('node.task_id', $newTask)->assertJsonPath('node.activity_id', null);
        $this->assertDatabaseHas('roadmap_edges', ['roadmap_id' => $map, 'source_node_id' => $source, 'target_node_id' => $target]);
        $this->assertDatabaseHas('tasks', ['id' => $sourceTask, 'title' => 'Pesquisa']);
        $this->assertDatabaseHas('tasks', ['id' => $newTask, 'title' => 'Implementação', 'project_id' => $project]);
        $this->assertDatabaseCount('activities', 0);
    }
}
