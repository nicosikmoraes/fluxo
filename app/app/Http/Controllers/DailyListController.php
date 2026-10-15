<?php

namespace App\Http\Controllers;

use App\Models\Activity;
use App\Models\DailyEntry;
use App\Models\DailyRoutine;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class DailyListController extends Controller
{
    private function dateRules(): array
    {
        return ['required', 'date_format:Y-m-d', 'after_or_equal:1900-01-01', 'before_or_equal:2100-12-31'];
    }

    private function entries(string $date): Builder
    {
        return DailyEntry::with('activity.task.project', 'project', 'routine')
            ->where('planned_for', $date)->whereNull('removed_at')->whereNull('moved_to');
    }

    private function prepareRoutines(string $date): void
    {
        $routines = DailyRoutine::where('starts_on', '<=', $date)
            ->where(fn (Builder $query) => $query->whereNull('ends_on')->orWhere('ends_on', '>=', $date))->get();
        foreach ($routines as $routine) {
            DailyEntry::firstOrCreate(['daily_routine_id' => $routine->id, 'planned_for' => $date], [
                'title' => $routine->title, 'project_id' => $routine->project_id, 'priority' => $routine->priority,
            ]);
        }
    }

    private function entryData(DailyEntry $entry): array
    {
        $entry->loadMissing('activity.task.project', 'project', 'routine');
        $activity = $entry->activity;
        $task = $activity?->task;
        $project = $activity ? $task?->project : $entry->project;

        return [
            'id' => $entry->id,
            'planned_for' => $entry->planned_for->toDateString(),
            'title' => $activity?->title ?? $entry->title,
            'priority' => $entry->priority,
            'focused' => $entry->focused && ! $entry->isCompleted(),
            'completed' => $entry->isCompleted(),
            'activity_id' => $entry->activity_id,
            'task_id' => $task?->id,
            'task_title' => $task?->title,
            'project' => $project ? ['id' => $project->id, 'title' => $project->title, 'cover' => $project->cover] : null,
            'blocked' => $activity?->blocked ?? false,
            'blocking_person' => $activity?->blocking_person,
            'routine_id' => $entry->daily_routine_id,
            'recurring' => $entry->routine && ($entry->routine->ends_on === null || $entry->routine->ends_on->greaterThan($entry->planned_for)),
        ];
    }

    public function index(Request $request): JsonResponse
    {
        $date = $request->validate(['date' => $this->dateRules()])['date'];
        $this->prepareRoutines($date);

        return response()->json(['date' => $date, 'entries' => $this->entries($date)->orderByDesc('priority')->orderBy('id')->get()->map(fn (DailyEntry $entry) => $this->entryData($entry))]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'date' => $this->dateRules(),
            'activity_id' => ['nullable', 'integer', Rule::exists('activities', 'id')->where('user_id', $request->user()->id)],
            'title' => ['required_without:activity_id', 'nullable', 'string', 'max:200'],
            'project_id' => ['nullable', 'integer', Rule::exists('projects', 'id')->where('user_id', $request->user()->id)],
            'priority' => ['sometimes', 'boolean'],
            'recurring' => ['sometimes', 'boolean'],
        ]);
        if (! empty($data['activity_id']) && ! empty($data['recurring'])) {
            throw ValidationException::withMessages(['recurring' => 'A repetição diária está disponível para atividades avulsas.']);
        }
        $entry = DB::transaction(function () use ($data): DailyEntry {
            if (! empty($data['activity_id'])) {
                $entry = DailyEntry::firstOrCreate(['planned_for' => $data['date'], 'activity_id' => $data['activity_id']], ['priority' => $data['priority'] ?? false]);
                $entry->update(['removed_at' => null, 'moved_to' => null]);

                return $entry;
            }
            $attributes = ['planned_for' => $data['date'], 'title' => $data['title'], 'project_id' => $data['project_id'] ?? null, 'priority' => $data['priority'] ?? false];
            if ($data['recurring'] ?? false) {
                $routine = DailyRoutine::create(['title' => $attributes['title'], 'project_id' => $attributes['project_id'], 'priority' => $attributes['priority'], 'starts_on' => $data['date']]);
                $attributes['daily_routine_id'] = $routine->id;
            }

            return DailyEntry::create($attributes);
        });

        return response()->json($this->entryData($entry->refresh()), 201);
    }

    public function update(Request $request, DailyEntry $dailyEntry): JsonResponse
    {
        abort_if($dailyEntry->removed_at || $dailyEntry->moved_to, 404);
        $data = $request->validate(['completed' => ['sometimes', 'boolean'], 'priority' => ['sometimes', 'boolean'], 'focused' => ['sometimes', 'boolean']]);
        DB::transaction(function () use ($dailyEntry, $data): void {
            if (array_key_exists('completed', $data)) {
                if ($dailyEntry->activity_id) {
                    $activity = Activity::lockForUpdate()->findOrFail($dailyEntry->activity_id);
                    if ($data['completed'] && $activity->blocked) {
                        throw ValidationException::withMessages(['completed' => 'Desbloqueie a atividade no projeto antes de concluí-la.']);
                    }
                    $activity->update(['status' => $data['completed'] ? 'done' : 'pending']);
                } else {
                    $dailyEntry->completed_at = $data['completed'] ? now() : null;
                }
                if ($data['completed']) {
                    $dailyEntry->focused = false;
                }
            }
            if (array_key_exists('priority', $data)) {
                $dailyEntry->priority = $data['priority'];
            }
            if (array_key_exists('focused', $data)) {
                $dailyEntry->unsetRelation('activity');
                if ($data['focused'] && $dailyEntry->isCompleted()) {
                    throw ValidationException::withMessages(['focused' => 'Escolha uma atividade pendente para focar.']);
                }
                if ($data['focused']) {
                    DailyEntry::where('planned_for', $dailyEntry->planned_for->toDateString())->where('id', '!=', $dailyEntry->id)->update(['focused' => false]);
                }
                $dailyEntry->focused = $data['focused'];
            }
            $dailyEntry->save();
        });

        return response()->json($this->entryData($dailyEntry->refresh()));
    }

    public function destroy(DailyEntry $dailyEntry): Response
    {
        $dailyEntry->update(['removed_at' => now(), 'focused' => false]);

        return response()->noContent();
    }

    public function carry(Request $request): JsonResponse
    {
        $date = $request->validate(['date' => $this->dateRules()])['date'];
        $nextDate = Carbon::createFromFormat('!Y-m-d', $date)->addDay()->toDateString();
        if ($nextDate > '2100-12-31') {
            throw ValidationException::withMessages(['date' => 'Escolha um dia anterior a 31 de dezembro de 2100.']);
        }
        $count = DB::transaction(function () use ($date, $nextDate): int {
            $this->prepareRoutines($date);
            $entries = $this->entries($date)->lockForUpdate()->orderBy('id')->get();
            $count = 0;
            foreach ($entries as $entry) {
                if ($entry->isCompleted()) {
                    continue;
                }
                $attributes = ['planned_for' => $nextDate, 'title' => $entry->title, 'project_id' => $entry->project_id, 'priority' => $entry->priority];
                if ($entry->activity_id) {
                    $next = DailyEntry::firstOrCreate(['planned_for' => $nextDate, 'activity_id' => $entry->activity_id], $attributes);
                } elseif ($entry->daily_routine_id) {
                    $next = DailyEntry::firstOrCreate(['planned_for' => $nextDate, 'daily_routine_id' => $entry->daily_routine_id], $attributes);
                } else {
                    $next = DailyEntry::create($attributes);
                }
                $next->update(['removed_at' => null, 'moved_to' => null]);
                $entry->update(['moved_to' => $nextDate, 'focused' => false]);
                $count++;
            }

            return $count;
        });

        return response()->json(['date' => $nextDate, 'moved' => $count]);
    }

    public function stopRoutine(Request $request, DailyRoutine $dailyRoutine): Response
    {
        $date = $request->validate(['date' => $this->dateRules()])['date'];
        DB::transaction(function () use ($dailyRoutine, $date): void {
            $end = min($dailyRoutine->ends_on?->toDateString() ?? $date, $date);
            $dailyRoutine->update(['ends_on' => $end]);
            DailyEntry::where('daily_routine_id', $dailyRoutine->id)->where('planned_for', '>', $end)->whereNull('completed_at')->update(['removed_at' => now(), 'focused' => false]);
        });

        return response()->noContent();
    }
}
