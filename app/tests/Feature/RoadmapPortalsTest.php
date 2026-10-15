<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoadmapPortalsTest extends TestCase
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

    private function map(): array
    {
        $project = $this->postJson('/api/projects', ['title' => 'Projeto', 'cover' => 'desk'])->assertCreated()->json('id');
        $task = $this->postJson('/api/tasks', ['title' => 'Etapas', 'project_id' => $project])->assertCreated()->json('id');
        $activity = $this->postJson('/api/tasks/'.$task.'/activities', ['title' => 'Etapa'])->assertCreated()->json('id');
        $map = $this->postJson('/api/projects/'.$project.'/roadmaps', ['title' => 'Caminho'])->assertCreated()->json('id');
        $node = $this->postJson('/api/roadmaps/'.$map.'/nodes', ['activity_id' => $activity, 'x' => 20, 'y' => 30])->assertCreated()->json('id');

        return [$map, $node];
    }

    private function portal(int $node): array
    {
        return ['id' => 'portal-importado', 'label' => '', 'x' => 500, 'y' => 100, 'sources' => [$node]];
    }

    public function test_preserves_text_coordinates_and_connections_in_the_account_after_reloading(): void
    {
        $this->actingAs(User::factory()->create());
        [$map, $node] = $this->map();
        $portal = $this->portal($node);
        $this->putJson('/api/roadmaps/'.$map.'/portals', ['version' => 0, 'portals' => [$portal]])->assertOk()->assertJsonPath('portals.0.label', '')->assertJsonPath('portals_version', 1);
        $stored = collect($this->getJson('/api/workspace')->assertOk()->json('roadmaps'))->firstWhere('id', $map);
        $this->assertSame([$portal], $stored['portals']);

        $portal['label'] = 'Entrega';
        $portal['x'] = 700;
        $portal['sources'] = [$node, $node];
        $this->putJson('/api/roadmaps/'.$map.'/portals', ['version' => 1, 'portals' => [$portal]])->assertOk()->assertJsonPath('portals.0.sources', [$node])->assertJsonPath('portals.0.label', 'Entrega')->assertJsonPath('portals.0.x', 700);
        $this->putJson('/api/roadmaps/'.$map.'/portals', ['version' => 2, 'portals' => []])->assertOk()->assertJsonPath('portals', []);
        $this->assertDatabaseHas('roadmap_nodes', ['id' => $node]);
    }

    public function test_rejects_invalid_shapes_and_connections_to_another_map_without_partial_writes(): void
    {
        $this->actingAs(User::factory()->create());
        [$map, $node] = $this->map();
        [, $outside] = $this->map();
        $portal = $this->portal($node);
        $cases = [
            [array_replace($portal, ['x' => -1])],
            [array_replace($portal, ['label' => str_repeat('a', 161)])],
            [array_replace($portal, ['sources' => [$outside]])],
            [array_replace($portal, ['sources' => [999999]])],
            [$portal, $portal],
            [array_replace($portal, ['unexpected' => true])],
        ];
        foreach ($cases as $portals) {
            $this->putJson('/api/roadmaps/'.$map.'/portals', ['version' => 0, 'portals' => $portals])->assertUnprocessable();
        }
        $stored = collect($this->getJson('/api/workspace')->json('roadmaps'))->firstWhere('id', $map);
        $this->assertNull($stored['portals']);
        $this->assertSame(0, $stored['portals_version']);
    }

    public function test_rejects_a_stale_tab_without_overwriting_the_latest_portals(): void
    {
        $this->actingAs(User::factory()->create());
        [$map, $node] = $this->map();
        $portal = $this->portal($node);
        $this->putJson('/api/roadmaps/'.$map.'/portals', ['version' => 0, 'portals' => [$portal]])->assertOk();
        $this->putJson('/api/roadmaps/'.$map.'/portals', ['version' => 0, 'portals' => []])->assertConflict();
        $stored = collect($this->getJson('/api/workspace')->json('roadmaps'))->firstWhere('id', $map);
        $this->assertSame([$portal], $stored['portals']);
    }

    public function test_portals_are_only_visible_and_editable_by_the_roadmap_owner(): void
    {
        $this->actingAs(User::factory()->create());
        [$map, $node] = $this->map();
        $portal = $this->portal($node);
        $this->putJson('/api/roadmaps/'.$map.'/portals', ['version' => 0, 'portals' => [$portal]])->assertOk();
        $this->actingAs(User::factory()->create());
        $this->getJson('/api/workspace')->assertOk()->assertJsonPath('roadmaps', []);
        $this->putJson('/api/roadmaps/'.$map.'/portals', ['version' => 1, 'portals' => []])->assertNotFound();
        auth()->logout();
        $this->putJson('/api/roadmaps/'.$map.'/portals', ['version' => 1, 'portals' => []])->assertUnauthorized();
    }
}
