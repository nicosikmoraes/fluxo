<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\WorkDay;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class WorkHoursTest extends TestCase
{
    use RefreshDatabase;

    private function payload(array $settings = [], array $entries = []): array
    {
        return [
            'settings' => array_replace(WorkDay::defaultSettings('America/Sao_Paulo'), ['enabled' => true, 'monthlySalary' => 4400], $settings),
            'settings_version' => 0,
            'date' => '2026-10-16',
            'entry_version' => 0,
            'entries' => array_replace(array_fill_keys(array_keys(WorkDay::STEPS), null), $entries),
        ];
    }

    private function atTime(string $time = '2026-10-16 19:00:00'): void
    {
        $this->travelTo(CarbonImmutable::parse($time, 'America/Sao_Paulo'));
    }

    public function test_defaults_are_disabled_and_salary_is_not_exposed_in_the_session(): void
    {
        $this->atTime();
        $this->actingAs(User::factory()->pro()->create());

        $this->getJson('/api/profile/work-hours?timezone=America/Sao_Paulo')->assertOk()
            ->assertJsonPath('settings.enabled', false)->assertJsonPath('settings.monthlySalary', null)
            ->assertJsonPath('day.date', '2026-10-16')->assertJsonPath('settings.timezone', 'America/Sao_Paulo');
        $this->getJson('/api/auth/session')->assertOk()->assertJsonMissingPath('user.work_settings');
    }

    public function test_preferences_and_times_survive_reload_and_salary_is_encrypted_at_rest(): void
    {
        $this->atTime();
        $user = User::factory()->pro()->create();
        $this->actingAs($user);
        $payload = $this->payload([], ['startedAt' => '08:00', 'lunchOut' => '12:00', 'lunchIn' => '13:00']);

        $this->putJson('/api/profile/work-hours', $payload)->assertOk()
            ->assertJsonPath('settings_version', 1)->assertJsonPath('day.version', 1)
            ->assertJsonPath('day.entries.lunchIn', '13:00')->assertJsonPath('day.instants.startedAt', '2026-10-16T11:00:00+00:00');
        $this->getJson('/api/profile/work-hours')->assertOk()->assertJsonPath('settings.monthlySalary', 4400)
            ->assertJsonPath('active_day.entries.startedAt', '08:00');
        $this->assertDatabaseHas('work_days', ['user_id' => $user->id, 'work_date' => '2026-10-16', 'lunch_in_at' => '2026-10-16 16:00:00']);
        $rawSettings = DB::table('users')->where('id', $user->id)->value('work_settings');
        $this->assertStringNotContainsString('monthlySalary', $rawSettings);
        $this->assertStringNotContainsString('4400', $rawSettings);
        $this->assertArrayNotHasKey('work_settings', $user->fresh()->toArray());
    }

    public function test_accounts_have_separate_preferences_and_days_even_with_the_same_date(): void
    {
        $this->atTime();
        $owner = User::factory()->pro()->create();
        $other = User::factory()->pro()->create();
        $this->actingAs($owner);
        $this->putJson('/api/profile/work-hours', $this->payload([], ['startedAt' => '08:00']))->assertOk();
        $this->flushSession();
        $this->actingAs($other);

        $this->getJson('/api/profile/work-hours')->assertOk()->assertJsonPath('settings.monthlySalary', null)->assertJsonPath('day.entries.startedAt', '');
        $payload = $this->payload(['monthlySalary' => null], ['startedAt' => '09:00']);
        $payload['user_id'] = $owner->id;
        $this->putJson('/api/profile/work-hours', $payload)->assertOk();
        $this->assertDatabaseHas('work_days', ['user_id' => $owner->id, 'started_at' => '2026-10-16 11:00:00']);
        $this->assertDatabaseHas('work_days', ['user_id' => $other->id, 'started_at' => '2026-10-16 12:00:00']);
        $this->assertSame(4400, $owner->fresh()->work_settings['monthlySalary']);
        $this->assertNull($other->fresh()->work_settings['monthlySalary']);
    }

    public static function anonymousEndpoints(): array
    {
        return [['GET', '/api/profile/work-hours'], ['PUT', '/api/profile/work-hours'], ['POST', '/api/profile/work-hours/records']];
    }

    #[DataProvider('anonymousEndpoints')]
    public function test_anonymous_access_returns_401(string $method, string $url): void
    {
        $this->json($method, $url)->assertUnauthorized();
    }

    public static function invalidPayloads(): array
    {
        return [
            'zero days' => ['settings.daysPerWeek', 0],
            'daily hours above 24' => ['settings.daysPerWeek', 1],
            'negative salary' => ['settings.monthlySalary', -1],
            'zero monthly hours' => ['settings.monthlyHours', 0],
            'negative premium' => ['settings.overtimePremium', -5],
            'invalid timezone' => ['settings.timezone', 'Unknown/Timezone'],
            'extra setting key' => ['settings.user_id', 10],
            'invalid time' => ['entries.startedAt', '25:01'],
            'missing earlier step' => ['entries.lunchIn', '13:00'],
            'future time' => ['entries.startedAt', '20:00'],
        ];
    }

    #[DataProvider('invalidPayloads')]
    public function test_invalid_values_return_422_and_do_not_save_preferences_or_times(string $key, mixed $value): void
    {
        $this->atTime();
        $user = User::factory()->pro()->create();
        $this->actingAs($user);
        $payload = $this->payload();
        data_set($payload, $key, $value);

        $this->putJson('/api/profile/work-hours', $payload)->assertUnprocessable();
        $this->assertNull($user->fresh()->work_settings);
        $this->assertDatabaseCount('work_days', 0);
    }

    public function test_a_stale_tab_returns_409_and_preserves_the_existing_records(): void
    {
        $this->atTime();
        $this->actingAs(User::factory()->pro()->create());
        $payload = $this->payload([], ['startedAt' => '08:00']);
        $this->putJson('/api/profile/work-hours', $payload)->assertOk();
        $payload['settings']['monthlySalary'] = 9000;

        $this->putJson('/api/profile/work-hours', $payload)->assertConflict();
        $this->getJson('/api/profile/work-hours')->assertOk()->assertJsonPath('settings.monthlySalary', 4400)->assertJsonPath('day.entries.startedAt', '08:00');
    }

    public function test_the_widget_records_the_server_time_and_rejects_duplicate_exit(): void
    {
        $this->atTime('2026-10-16 18:30:45');
        $user = User::factory()->pro()->create();
        $this->actingAs($user);
        $this->putJson('/api/profile/work-hours', $this->payload([], ['startedAt' => '08:00', 'lunchOut' => '12:00', 'lunchIn' => '13:00']))->assertOk();

        $this->postJson('/api/profile/work-hours/records', ['date' => '2026-10-16', 'step' => 'finishedAt', 'entry_version' => 1])->assertOk()
            ->assertJsonPath('day.entries.finishedAt', '18:30')->assertJsonPath('day.version', 2);
        $this->assertDatabaseHas('work_days', ['user_id' => $user->id, 'finished_at' => '2026-10-16 21:30:45']);
        $this->postJson('/api/profile/work-hours/records', ['date' => '2026-10-16', 'step' => 'finishedAt', 'entry_version' => 2])->assertUnprocessable();
    }

    public function test_recording_is_rejected_when_tracking_is_disabled(): void
    {
        $this->atTime();
        $this->actingAs(User::factory()->pro()->create());

        $this->postJson('/api/profile/work-hours/records', ['date' => '2026-10-16', 'step' => 'startedAt', 'entry_version' => 0])->assertUnprocessable();
        $this->assertDatabaseCount('work_days', 0);
    }

    public function test_saving_preferences_preserves_the_exact_seconds_of_existing_records(): void
    {
        $this->atTime();
        $user = User::factory()->pro()->create();
        $this->actingAs($user);
        WorkDay::factory()->create([
            'work_date' => '2026-10-16', 'timezone' => 'America/Sao_Paulo',
            'started_at' => '2026-10-16 11:00:15', 'lunch_out_at' => '2026-10-16 15:00:30',
            'lunch_in_at' => '2026-10-16 16:00:45', 'finished_at' => '2026-10-16 21:30:45',
        ]);
        $payload = $this->payload([], ['startedAt' => '08:00', 'lunchOut' => '12:00', 'lunchIn' => '13:00', 'finishedAt' => '18:30']);
        $payload['entry_version'] = 1;

        $this->putJson('/api/profile/work-hours', $payload)->assertOk();
        $this->assertDatabaseHas('work_days', ['user_id' => $user->id, 'started_at' => '2026-10-16 11:00:15', 'finished_at' => '2026-10-16 21:30:45']);
    }

    public function test_server_clock_records_can_happen_in_the_same_minute(): void
    {
        $this->atTime('2026-10-16 09:00:05');
        $user = User::factory()->pro()->create();
        $this->actingAs($user);
        $this->putJson('/api/profile/work-hours', $this->payload())->assertOk();
        $this->postJson('/api/profile/work-hours/records', ['date' => '2026-10-16', 'step' => 'startedAt', 'entry_version' => 0])->assertOk();
        $this->atTime('2026-10-16 09:00:35');

        $this->postJson('/api/profile/work-hours/records', ['date' => '2026-10-16', 'step' => 'lunchOut', 'entry_version' => 1])->assertOk();
        $this->assertDatabaseHas('work_days', ['user_id' => $user->id, 'started_at' => '2026-10-16 12:00:05', 'lunch_out_at' => '2026-10-16 12:00:35']);
    }

    public function test_an_overnight_shift_remains_active_after_midnight_and_new_days_start_empty(): void
    {
        $this->atTime('2026-10-17 06:00:00');
        $this->actingAs(User::factory()->pro()->create());
        $payload = $this->payload([], ['startedAt' => '22:00', 'lunchOut' => '02:00', 'lunchIn' => '03:00']);
        $this->putJson('/api/profile/work-hours', $payload)->assertOk()->assertJsonPath('day.instants.lunchIn', '2026-10-17T06:00:00+00:00');

        $this->getJson('/api/profile/work-hours')->assertOk()->assertJsonPath('today', '2026-10-17')->assertJsonPath('active_day.date', '2026-10-16');
        $this->atTime('2026-10-17 23:00:00');
        $this->getJson('/api/profile/work-hours')->assertOk()->assertJsonPath('active_day.date', '2026-10-17')->assertJsonPath('active_day.entries.startedAt', '');
    }

    public function test_disabling_preserves_saved_records_and_salary_can_be_removed(): void
    {
        $this->atTime();
        $this->actingAs(User::factory()->pro()->create());
        $payload = $this->payload([], ['startedAt' => '08:00']);
        $this->putJson('/api/profile/work-hours', $payload)->assertOk();
        $payload['settings']['enabled'] = false;
        $payload['settings']['monthlySalary'] = null;
        $payload['settings_version'] = 1;
        $payload['entry_version'] = 1;

        $this->putJson('/api/profile/work-hours', $payload)->assertOk()->assertJsonPath('settings.enabled', false)
            ->assertJsonPath('settings.monthlySalary', null)->assertJsonPath('day.entries.startedAt', '08:00');
    }

    public function test_an_overnight_shift_finished_today_keeps_its_summary_and_original_regime(): void
    {
        $this->atTime('2026-10-17 06:00:00');
        $this->actingAs(User::factory()->pro()->create());
        $payload = $this->payload([], ['startedAt' => '22:00', 'lunchOut' => '02:00', 'lunchIn' => '03:00', 'finishedAt' => '05:00']);
        $this->putJson('/api/profile/work-hours', $payload)->assertOk();
        $payload = $this->payload(['weeklyHours' => 40, 'monthlySalary' => 6000]);
        $payload['date'] = '2026-10-17';
        $payload['settings_version'] = 1;
        $this->putJson('/api/profile/work-hours', $payload)->assertOk();

        $this->getJson('/api/profile/work-hours')->assertOk()->assertJsonPath('active_day.date', '2026-10-16')
            ->assertJsonPath('active_day.entries.finishedAt', '05:00')->assertJsonPath('active_day.regime.weeklyHours', 44)
            ->assertJsonPath('active_day.regime.monthlySalary', 4400)->assertJsonPath('settings.monthlySalary', 6000);
    }

    public function test_reordered_and_future_dates_are_rejected_without_partial_changes(): void
    {
        $this->atTime();
        $this->actingAs(User::factory()->pro()->create());
        $payload = $this->payload([], ['startedAt' => '08:00', 'lunchOut' => '12:00', 'lunchIn' => '11:00']);

        $this->putJson('/api/profile/work-hours', $payload)->assertUnprocessable()->assertJsonValidationErrors('entries.lunchIn');
        $payload = $this->payload();
        $payload['date'] = '2026-10-17';
        $this->putJson('/api/profile/work-hours', $payload)->assertUnprocessable()->assertJsonValidationErrors('date');
        $this->assertDatabaseCount('work_days', 0);
    }

    public function test_a_changed_day_version_returns_409_without_overwriting_preferences(): void
    {
        $this->atTime();
        $user = User::factory()->pro()->create();
        $this->actingAs($user);
        WorkDay::factory()->create(['work_date' => '2026-10-16', 'timezone' => 'America/Sao_Paulo', 'started_at' => '2026-10-16 11:00:00']);

        $this->putJson('/api/profile/work-hours', $this->payload())->assertConflict();
        $this->assertNull($user->fresh()->work_settings);
        $this->assertDatabaseHas('work_days', ['user_id' => $user->id, 'started_at' => '2026-10-16 11:00:00', 'version' => 1]);
    }
}
