<?php

namespace App\Http\Controllers;

use App\Models\Activity;
use App\Models\Project;
use App\Models\Roadmap;
use App\Models\RoadmapEdge;
use App\Models\RoadmapNode;
use App\Models\Task;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class RoadmapController extends Controller
{
    public function create(Request $r, Project $project)
    {
        $d = $r->validate(['title' => ['required', 'string', 'max:160'], 'card_type' => ['sometimes', 'required', Rule::in(['task', 'activity'])]]);
        $d['card_type'] ??= 'activity';

        $roadmap = DB::transaction(function () use ($r, $project, $d): Roadmap {
            $user = User::whereKey($r->user()->id)->lockForUpdate()->firstOrFail();
            abort_if(! $user->hasPro() && Roadmap::where('project_id', $project->id)->count() >= config('billing.free_roadmaps_per_project'), 403, __('O plano gratuito permite um roadmap por projeto. Conheça o Tempozi Pro para criar mais.'));

            return Roadmap::create($d + ['project_id' => $project->id])->load('nodes', 'edges');
        });

        return response()->json($roadmap, 201);
    }

    public function update(Request $r, Roadmap $roadmap)
    {
        $roadmap->update($r->validate(['title' => ['required', 'string', 'max:160']]));

        return $roadmap;
    }

    public function delete(Roadmap $roadmap)
    {
        $roadmap->delete();

        return response()->noContent();
    }

    public function savePortals(Request $request, Roadmap $roadmap): JsonResponse
    {
        $data = $request->validate([
            'version' => ['required', 'integer', 'min:0'],
            'portals' => ['present', 'array', 'max:2000', 'list'],
            'portals.*' => ['required', 'array:id,label,x,y,sources'],
            'portals.*.id' => ['required', 'string', 'max:100', 'distinct:strict'],
            'portals.*.label' => ['present', 'nullable', 'string', 'max:160'],
            'portals.*.x' => ['required', 'integer', 'min:0', 'max:1000000'],
            'portals.*.y' => ['required', 'integer', 'min:0', 'max:1000000'],
            'portals.*.sources' => ['present', 'array', 'max:2000', 'list'],
            'portals.*.sources.*' => ['required', 'integer', 'min:1', Rule::exists('roadmap_nodes', 'id')->where('roadmap_id', $roadmap->id)->where('user_id', $request->user()->id)],
        ]);

        return DB::transaction(function () use ($roadmap, $data): JsonResponse {
            $current = Roadmap::whereKey($roadmap->id)->lockForUpdate()->firstOrFail();
            abort_unless($current->portals_version === (int) $data['version'], 409, __('Os portais mudaram em outra aba. Atualize a página antes de salvar.'));
            $portals = array_map(fn (array $portal): array => [
                'id' => $portal['id'],
                'label' => $portal['label'] ?? '',
                'x' => $portal['x'],
                'y' => $portal['y'],
                'sources' => array_values(array_unique($portal['sources'])),
            ], $data['portals']);
            $current->forceFill(['portals' => $portals, 'portals_version' => $current->portals_version + 1])->save();

            return response()->json($current->only('portals', 'portals_version'));
        });
    }

    private function coordinates(): array
    {
        return ['x' => ['required', 'numeric', 'min:0', 'max:1000000'], 'y' => ['required', 'numeric', 'min:0', 'max:1000000']];
    }

    public function addNode(Request $r, Roadmap $roadmap)
    {
        if ($roadmap->card_type === 'task') {
            $d = $r->validate($this->coordinates() + ['task_id' => ['required', 'integer', Rule::exists('tasks', 'id')->where('project_id', $roadmap->project_id), Rule::unique('roadmap_nodes', 'task_id')->where('roadmap_id', $roadmap->id)]]);
        } else {
            $taskIds = Project::findOrFail($roadmap->project_id)->tasks()->pluck('id');
            $d = $r->validate($this->coordinates() + ['activity_id' => ['required', 'integer', Rule::exists('activities', 'id')->whereIn('task_id', $taskIds), Rule::unique('roadmap_nodes', 'activity_id')->where('roadmap_id', $roadmap->id)]]);
        }

        return response()->json($roadmap->nodes()->create($d), 201);
    }

    public function createConnectedActivity(Request $r, Roadmap $roadmap)
    {
        $d = $r->validate($this->coordinates() + [
            'title' => ['required', 'string', 'max:200'],
            'task_id' => ['required', 'integer', Rule::exists('tasks', 'id')->where('project_id', $roadmap->project_id)],
            'source_node_id' => ['required', 'integer', Rule::exists('roadmap_nodes', 'id')->where('roadmap_id', $roadmap->id)],
        ]);

        return DB::transaction(function () use ($roadmap, $d) {
            $task = Task::where('project_id', $roadmap->project_id)->findOrFail($d['task_id']);
            $source = $roadmap->nodes()->findOrFail($d['source_node_id']);
            $activity = $task->activities()->create([
                'title' => $d['title'],
                'position' => ($task->activities()->max('position') ?? -1) + 1,
                'roadmap_position' => (Activity::whereHas('task', fn ($q) => $q->where('project_id', $roadmap->project_id))->max('roadmap_position') ?? -1) + 1,
            ]);
            $node = $roadmap->nodes()->create(['activity_id' => $activity->id, 'x' => $d['x'], 'y' => $d['y']]);
            $edge = $roadmap->edges()->create(['source_node_id' => $source->id, 'target_node_id' => $node->id]);

            return response()->json(['activity' => $activity->refresh()->load('comments'), 'node' => $node, 'edge' => $edge], 201);
        });
    }

    public function createConnectedTask(Request $r, Roadmap $roadmap)
    {
        abort_unless($roadmap->card_type === 'task', 422, __('Este roadmap organiza atividades.'));
        $d = $r->validate($this->coordinates() + [
            'title' => ['required', 'string', 'max:200'],
            'source_node_id' => ['required', 'integer', Rule::exists('roadmap_nodes', 'id')->where('roadmap_id', $roadmap->id)],
        ]);

        return DB::transaction(function () use ($roadmap, $d) {
            $project = Project::findOrFail($roadmap->project_id);
            $task = $project->tasks()->create([
                'title' => $d['title'],
                'position' => (Task::max('position') ?? -1) + 1,
            ]);
            $source = $roadmap->nodes()->findOrFail($d['source_node_id']);
            $node = $roadmap->nodes()->create(['task_id' => $task->id, 'x' => $d['x'], 'y' => $d['y']]);
            $edge = $roadmap->edges()->create(['source_node_id' => $source->id, 'target_node_id' => $node->id]);

            return response()->json(['task' => $task->refresh()->load('activities.comments'), 'node' => $node, 'edge' => $edge], 201);
        });
    }

    public function moveLayout(Request $request, Roadmap $roadmap): JsonResponse
    {
        $data = $request->validate([
            'nodes' => ['required', 'array', 'min:1', 'max:2000'],
            'nodes.*' => ['required', 'array:id,x,y,previous_x,previous_y'],
            'nodes.*.id' => ['required', 'integer', 'min:1', 'distinct'],
            'nodes.*.x' => ['required', 'integer', 'min:0', 'max:1000000'],
            'nodes.*.y' => ['required', 'integer', 'min:0', 'max:1000000'],
            'nodes.*.previous_x' => ['required', 'numeric', 'min:0', 'max:1000000'],
            'nodes.*.previous_y' => ['required', 'numeric', 'min:0', 'max:1000000'],
        ]);

        return DB::transaction(function () use ($roadmap, $data): JsonResponse {
            $nodes = $roadmap->nodes()->lockForUpdate()->get()->keyBy('id');
            foreach ($data['nodes'] as $position) {
                abort_unless($nodes->has($position['id']), 422, __('Um dos cards não pertence a este roadmap.'));
            }
            abort_unless($nodes->count() === count($data['nodes']), 409, __('O mapa mudou. Atualize a página e gere outra prévia.'));
            foreach ($data['nodes'] as $position) {
                $node = $nodes->get($position['id']);
                abort_unless((float) $node->x === (float) $position['previous_x'] && (float) $node->y === (float) $position['previous_y'], 409, __('O mapa mudou. Atualize a página e gere outra prévia.'));
            }
            foreach ($data['nodes'] as $position) {
                $nodes->get($position['id'])->update(['x' => $position['x'], 'y' => $position['y']]);
            }

            return response()->json(['nodes' => $nodes->values()->map(fn ($node) => ['id' => $node->id, 'x' => $node->x, 'y' => $node->y])]);
        });
    }

    public function moveNode(Request $r, Roadmap $roadmap, RoadmapNode $node)
    {
        abort_unless($node->roadmap_id === $roadmap->id, 404);
        $node->update($r->validate($this->coordinates()));

        return $node;
    }

    public function deleteNode(Roadmap $roadmap, RoadmapNode $node)
    {
        abort_unless($node->roadmap_id === $roadmap->id, 404);
        $node->delete();

        return response()->noContent();
    }

    public function addEdge(Request $r, Roadmap $roadmap)
    {
        $exists = Rule::exists('roadmap_nodes', 'id')->where('roadmap_id', $roadmap->id);
        $d = $r->validate(['source_node_id' => ['required', 'integer', $exists], 'target_node_id' => ['required', 'integer', 'different:source_node_id', $exists]]);

        return response()->json($roadmap->edges()->firstOrCreate($d), 201);
    }

    public function deleteEdge(Roadmap $roadmap, RoadmapEdge $edge)
    {
        abort_unless($edge->roadmap_id === $roadmap->id, 404);
        $edge->delete();

        return response()->noContent();
    }
}
