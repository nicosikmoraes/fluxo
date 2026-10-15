<?php

namespace Tests\Feature;

use App\Models\DailyEntry;
use App\Models\DailyRoutine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DailyListTest extends TestCase
{
    use RefreshDatabase;

    private function activity(string $title = 'Criar interface'): int
    {
        $project = $this->postJson('/api/projects', ['title' => 'Produto', 'cover' => 'desk'])->assertCreated()->json('id');
        $task = $this->postJson('/api/tasks', ['title' => 'Entrega', 'project_id' => $project])->assertCreated()->json('id');

        return $this->postJson('/api/tasks/'.$task.'/activities', ['title' => $title])->assertCreated()->json('id');
    }

    public function test_saves_a_standalone_item_only_on_its_selected_day(): void
    {
        $id = $this->postJson('/api/daily-list', ['date' => '2026-10-15', 'title' => 'Ler', 'priority' => true])->assertCreated()->assertJsonPath('priority', true)->json('id');

        $this->getJson('/api/daily-list?date=2026-10-15')->assertOk()->assertJsonPath('entries.0.title', 'Ler')->assertJsonPath('entries.0.completed', false);
        $this->getJson('/api/daily-list?date=2026-10-16')->assertOk()->assertJsonCount(0, 'entries');
        $this->assertDatabaseHas('daily_entries', ['id' => $id, 'planned_for' => '2026-10-15', 'title' => 'Ler']);
        $this->assertDatabaseCount('tasks', 0);
    }

    public function test_completion_and_reopening_are_persisted(): void
    {
        $entry = DailyEntry::factory()->create();

        $this->patchJson('/api/daily-list/'.$entry->id, ['completed' => true])->assertOk()->assertJsonPath('completed', true);
        $this->assertNotNull($entry->fresh()->completed_at);
        $this->patchJson('/api/daily-list/'.$entry->id, ['completed' => false])->assertOk()->assertJsonPath('completed', false);
        $this->assertDatabaseHas('daily_entries', ['id' => $entry->id, 'completed_at' => null]);
    }

    public function test_linked_items_are_unique_and_share_completion_with_the_project(): void
    {
        $activity = $this->activity();
        $entry = $this->postJson('/api/daily-list', ['date' => '2026-10-15', 'activity_id' => $activity])->assertCreated()->assertJsonPath('project.title', 'Produto')->json('id');

        $this->postJson('/api/daily-list', ['date' => '2026-10-15', 'activity_id' => $activity])->assertCreated()->assertJsonPath('id', $entry);
        $this->assertDatabaseCount('daily_entries', 1);
        $this->patchJson('/api/daily-list/'.$entry, ['completed' => true])->assertOk()->assertJsonPath('completed', true);
        $this->assertDatabaseHas('activities', ['id' => $activity, 'status' => 'done']);
        $this->patchJson('/api/activities/'.$activity, ['status' => 'pending'])->assertOk();
        $this->getJson('/api/daily-list?date=2026-10-15')->assertJsonPath('entries.0.completed', false);
    }

    public function test_returns_422_without_completing_a_blocked_project_activity(): void
    {
        $activity = $this->activity();
        $this->patchJson('/api/activities/'.$activity, ['blocked' => true, 'blocking_person' => 'Mariana', 'blocking_reason' => 'Validar API'])->assertOk();
        $entry = $this->postJson('/api/daily-list', ['date' => '2026-10-15', 'activity_id' => $activity])->assertCreated()->json('id');

        $this->patchJson('/api/daily-list/'.$entry, ['completed' => true])->assertUnprocessable()->assertJsonValidationErrors('completed')->assertJsonPath('errors.completed.0', 'Desbloqueie a atividade no projeto antes de concluí-la.');
        $this->assertDatabaseHas('activities', ['id' => $activity, 'status' => 'pending', 'blocked' => true]);
    }

    public function test_focus_is_exclusive_per_day_and_completion_clears_it(): void
    {
        $first = DailyEntry::factory()->create(['focused' => true]);
        $second = DailyEntry::factory()->create();
        $otherDay = DailyEntry::factory()->create(['planned_for' => '2026-10-16', 'focused' => true]);

        $this->patchJson('/api/daily-list/'.$second->id, ['focused' => true, 'priority' => true])->assertOk()->assertJsonPath('focused', true)->assertJsonPath('priority', true);
        $this->assertDatabaseHas('daily_entries', ['id' => $first->id, 'focused' => false]);
        $this->assertDatabaseHas('daily_entries', ['id' => $otherDay->id, 'focused' => true]);
        $this->patchJson('/api/daily-list/'.$second->id, ['completed' => true])->assertOk()->assertJsonPath('focused', false);
        $this->patchJson('/api/daily-list/'.$second->id, ['focused' => true])->assertUnprocessable()->assertJsonValidationErrors('focused');
        $this->assertDatabaseHas('daily_entries', ['id' => $second->id, 'focused' => false]);
    }

    public function test_repetition_is_unique_per_date_and_each_day_has_its_own_completion(): void
    {
        $entry = $this->postJson('/api/daily-list', ['date' => '2026-10-15', 'title' => 'Ler', 'recurring' => true])->assertCreated()->json('id');
        $this->patchJson('/api/daily-list/'.$entry, ['completed' => true])->assertOk();

        $this->getJson('/api/daily-list?date=2026-10-14')->assertJsonCount(0, 'entries');
        $next = $this->getJson('/api/daily-list?date=2026-10-16')->assertOk()->assertJsonPath('entries.0.completed', false)->assertJsonPath('entries.0.recurring', true)->json('entries.0.id');
        $this->getJson('/api/daily-list?date=2026-10-16')->assertJsonCount(1, 'entries');
        $this->assertDatabaseCount('daily_entries', 2);
        $this->deleteJson('/api/daily-list/'.$next)->assertNoContent();
        $this->getJson('/api/daily-list?date=2026-10-16')->assertJsonCount(0, 'entries');
        $this->getJson('/api/daily-list?date=2026-10-17')->assertJsonCount(1, 'entries');
        $this->getJson('/api/daily-list?date=2026-10-15')->assertJsonPath('entries.0.completed', true);
    }

    public function test_stopping_repetition_removes_future_pending_occurrences_and_keeps_completed_history(): void
    {
        $routine = DailyRoutine::factory()->create();
        DailyEntry::factory()->create(['daily_routine_id' => $routine->id, 'planned_for' => '2026-10-16']);
        $completed = DailyEntry::factory()->create(['daily_routine_id' => $routine->id, 'planned_for' => '2026-10-17', 'completed_at' => now()]);

        $this->patchJson('/api/daily-routines/'.$routine->id.'/stop', ['date' => '2026-10-15'])->assertNoContent();

        $this->getJson('/api/daily-list?date=2026-10-16')->assertJsonCount(0, 'entries');
        $this->getJson('/api/daily-list?date=2026-10-17')->assertJsonPath('entries.0.id', $completed->id)->assertJsonPath('entries.0.completed', true);
        $this->getJson('/api/daily-list?date=2026-10-18')->assertJsonCount(0, 'entries');
        $this->assertDatabaseHas('daily_routines', ['id' => $routine->id, 'ends_on' => '2026-10-15']);
    }

    public function test_carry_moves_only_pending_items_across_months_without_duplicate_linked_or_recurring_items(): void
    {
        $activity = $this->activity();
        $this->postJson('/api/daily-list', ['date' => '2026-10-31', 'activity_id' => $activity])->assertCreated();
        $this->postJson('/api/daily-list', ['date' => '2026-11-01', 'activity_id' => $activity])->assertCreated();
        $this->postJson('/api/daily-list', ['date' => '2026-10-31', 'title' => 'Rotina', 'recurring' => true])->assertCreated();
        $this->getJson('/api/daily-list?date=2026-11-01')->assertJsonCount(2, 'entries');
        DailyEntry::factory()->create(['planned_for' => '2026-10-31', 'title' => 'Feita', 'completed_at' => now()]);
        DailyEntry::factory()->create(['planned_for' => '2026-10-31', 'title' => 'Avulsa']);

        $this->postJson('/api/daily-list/carry', ['date' => '2026-10-31'])->assertOk()->assertJsonPath('date', '2026-11-01')->assertJsonPath('moved', 3);

        $this->getJson('/api/daily-list?date=2026-10-31')->assertJsonCount(1, 'entries')->assertJsonPath('entries.0.title', 'Feita');
        $this->getJson('/api/daily-list?date=2026-11-01')->assertJsonCount(3, 'entries');
        $this->postJson('/api/daily-list/carry', ['date' => '2026-10-31'])->assertJsonPath('moved', 0);
        $this->assertDatabaseHas('activities', ['id' => $activity, 'status' => 'pending']);
    }

    public function test_removing_from_a_day_preserves_the_project_and_can_be_added_back(): void
    {
        $activity = $this->activity();
        $entry = $this->postJson('/api/daily-list', ['date' => '2026-10-15', 'activity_id' => $activity])->assertCreated()->json('id');

        $this->deleteJson('/api/daily-list/'.$entry)->assertNoContent();

        $this->getJson('/api/daily-list?date=2026-10-15')->assertJsonCount(0, 'entries');
        $this->assertDatabaseHas('activities', ['id' => $activity, 'status' => 'pending']);
        $this->patchJson('/api/daily-list/'.$entry, ['priority' => true])->assertNotFound();
        $this->postJson('/api/daily-list', ['date' => '2026-10-15', 'activity_id' => $activity])->assertCreated()->assertJsonPath('id', $entry);
    }

    public function test_deleted_source_activities_disappear_from_the_daily_list(): void
    {
        $activity = $this->activity();
        $this->postJson('/api/daily-list', ['date' => '2026-10-15', 'activity_id' => $activity])->assertCreated();

        $this->deleteJson('/api/activities/'.$activity)->assertNoContent();

        $this->getJson('/api/daily-list?date=2026-10-15')->assertJsonCount(0, 'entries');
    }

    public function test_invalid_dates_titles_references_and_flags_return_422_without_writes(): void
    {
        $this->postJson('/api/daily-list', [])->assertUnprocessable()->assertJsonValidationErrors(['date', 'title']);
        $this->postJson('/api/daily-list', ['date' => '2026-02-30', 'title' => 'Inválida'])->assertUnprocessable()->assertJsonValidationErrors('date');
        $this->postJson('/api/daily-list', ['date' => '2026-10-15', 'title' => str_repeat('a', 201)])->assertUnprocessable()->assertJsonValidationErrors('title');
        $this->postJson('/api/daily-list', ['date' => '2026-10-15', 'activity_id' => 99999])->assertUnprocessable()->assertJsonValidationErrors('activity_id');
        $this->postJson('/api/daily-list', ['date' => '2026-10-15', 'title' => 'Teste', 'project_id' => 99999, 'priority' => 'sim'])->assertUnprocessable()->assertJsonValidationErrors(['project_id', 'priority']);
        $this->getJson('/api/daily-list?date=1899-12-31')->assertUnprocessable()->assertJsonValidationErrors('date');
        $this->postJson('/api/daily-list/carry', ['date' => '2100-12-31'])->assertUnprocessable();
        $this->assertDatabaseCount('daily_entries', 0);
        $this->assertDatabaseCount('daily_routines', 0);
    }

    public function test_returns_422_for_recurring_linked_activities_and_403_for_external_origins(): void
    {
        $activity = $this->activity();

        $this->postJson('/api/daily-list', ['date' => '2026-10-15', 'activity_id' => $activity, 'recurring' => true])->assertUnprocessable()->assertJsonValidationErrors('recurring');
        $this->withHeader('Origin', 'https://example.com')->postJson('/api/daily-list', ['date' => '2026-10-15', 'title' => 'Externa'])->assertForbidden();
        $this->assertDatabaseCount('daily_entries', 0);
        $this->assertDatabaseCount('daily_routines', 0);
    }
}
