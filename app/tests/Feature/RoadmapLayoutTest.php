<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoadmapLayoutTest extends TestCase
{
    use RefreshDatabase;

    private function roadmap(): array
    {
        $project = $this->postJson('/api/projects', ['title' => 'Mapa de teste', 'cover' => 'desk'])->assertCreated()->json('id');
        $task = $this->postJson('/api/tasks', ['title' => 'Etapas', 'project_id' => $project])->assertCreated()->json('id');
        $map = $this->postJson('/api/projects/'.$project.'/roadmaps', ['title' => 'Planejamento'])->assertCreated()->json('id');
        $nodes = [];
        foreach ([[10, 10], [355, 20]] as [$x, $y]) {
            $activity = $this->postJson('/api/tasks/'.$task.'/activities', ['title' => 'Etapa'])->assertCreated()->json('id');
            $nodes[] = $this->postJson('/api/roadmaps/'.$map.'/nodes', ['activity_id' => $activity, 'x' => $x, 'y' => $y])->assertCreated()->json();
        }

        return [$map, $nodes];
    }

    private function positions(array $nodes): array
    {
        return array_map(fn ($node) => ['id' => $node['id'], 'x' => $node['x'] + 30, 'y' => 15, 'previous_x' => $node['x'], 'previous_y' => $node['y']], $nodes);
    }

    public function test_saves_and_restores_positions_without_changing_activities_or_connections(): void
    {
        $this->actingAs(User::factory()->pro()->create());
        [$map, $nodes] = $this->roadmap();
        $edge = $this->postJson('/api/roadmaps/'.$map.'/edges', ['source_node_id' => $nodes[0]['id'], 'target_node_id' => $nodes[1]['id']])->assertCreated()->json('id');
        $positions = $this->positions($nodes);
        $this->patchJson('/api/roadmaps/'.$map.'/layout', ['nodes' => $positions])->assertOk()->assertJsonPath('nodes.1.x', 385);
        $this->assertDatabaseHas('roadmap_nodes', ['id' => $nodes[0]['id'], 'x' => 40, 'y' => 15]);
        $this->assertDatabaseHas('roadmap_edges', ['id' => $edge]);
        $this->assertDatabaseHas('activities', ['id' => $nodes[0]['activity_id'], 'status' => 'pending']);
        $restore = array_map(fn ($position) => ['id' => $position['id'], 'x' => $position['previous_x'], 'y' => $position['previous_y'], 'previous_x' => $position['x'], 'previous_y' => $position['y']], $positions);
        $this->patchJson('/api/roadmaps/'.$map.'/layout', ['nodes' => $restore])->assertOk();
        $this->assertDatabaseHas('roadmap_nodes', ['id' => $nodes[1]['id'], 'x' => 355, 'y' => 20]);
    }

    public function test_rejects_outside_nodes_duplicate_ids_and_invalid_coordinates_without_partial_changes(): void
    {
        $this->actingAs(User::factory()->pro()->create());
        [$map, $nodes] = $this->roadmap();
        [, $outside] = $this->roadmap();
        $positions = $this->positions($nodes);
        $bad = $positions;
        $bad[1]['id'] = $outside[0]['id'];
        $this->patchJson('/api/roadmaps/'.$map.'/layout', ['nodes' => $bad])->assertUnprocessable();
        $this->patchJson('/api/roadmaps/'.$map.'/layout', ['nodes' => [$positions[0], $positions[0]]])->assertUnprocessable();
        $bad = $positions;
        $bad[1]['x'] = -1;
        $this->patchJson('/api/roadmaps/'.$map.'/layout', ['nodes' => $bad])->assertUnprocessable();
        $this->assertDatabaseHas('roadmap_nodes', ['id' => $nodes[0]['id'], 'x' => 10, 'y' => 10]);
        $this->assertDatabaseHas('roadmap_nodes', ['id' => $outside[0]['id'], 'x' => 10, 'y' => 10]);
    }

    public function test_refuses_a_stale_snapshot_or_incomplete_map_without_moving_any_node(): void
    {
        $this->actingAs(User::factory()->pro()->create());
        [$map, $nodes] = $this->roadmap();
        $positions = $this->positions($nodes);
        $positions[1]['previous_x'] = 333;
        $this->patchJson('/api/roadmaps/'.$map.'/layout', ['nodes' => $positions])->assertConflict()->assertJsonPath('message', 'O mapa mudou. Atualize a página e gere outra prévia.');
        $this->patchJson('/api/roadmaps/'.$map.'/layout', ['nodes' => [$this->positions($nodes)[0]]])->assertConflict();
        $this->assertDatabaseHas('roadmap_nodes', ['id' => $nodes[0]['id'], 'x' => 10, 'y' => 10]);
        $this->assertDatabaseHas('roadmap_nodes', ['id' => $nodes[1]['id'], 'x' => 355, 'y' => 20]);
    }
}
