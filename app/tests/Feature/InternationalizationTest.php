<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\WorkDay;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class InternationalizationTest extends TestCase
{
    use RefreshDatabase;

    private function hourlyPayload(?float $rate = 25): array
    {
        return [
            'settings' => ['enabled' => true, 'timezone' => 'UTC', 'hourlyRate' => $rate, 'overtimeEnabled' => true],
            'settings_version' => 0,
            'date' => '2026-10-17',
            'entry_version' => 0,
            'entries' => ['startedAt' => '08:00', 'lunchOut' => '12:00', 'lunchIn' => '13:00', 'finishedAt' => '18:00'],
        ];
    }

    public function test_anonymous_language_update_returns_401(): void
    {
        $this->putJson('/api/profile/preferences', ['locale' => 'en-US'])->assertUnauthorized();

        $this->assertDatabaseCount('users', 0);
    }

    public function test_preference_is_saved_only_for_the_authenticated_account_and_returned_in_session(): void
    {
        $owner = User::factory()->pro()->create(['locale' => 'pt-BR']);
        $other = User::factory()->pro()->create(['locale' => 'pt-BR']);
        $this->actingAs($owner);

        $this->putJson('/api/profile/preferences', ['locale' => 'en-US', 'user_id' => $other->id])
            ->assertOk()->assertJsonPath('user.id', $owner->id)->assertJsonPath('user.locale', 'en-US')
            ->assertJsonMissingPath('user.password')->assertJsonMissingPath('user.work_settings');

        $this->assertDatabaseHas('users', ['id' => $owner->id, 'locale' => 'en-US']);
        $this->assertDatabaseHas('users', ['id' => $other->id, 'locale' => 'pt-BR']);
        $this->getJson('/api/auth/session')->assertOk()->assertJsonPath('user.locale', 'en-US')
            ->assertHeader('Content-Language', 'en-US');
    }

    public static function invalidLocales(): array
    {
        return [
            'unsupported language' => [['locale' => 'fr-FR'], 'The selected language is invalid.'],
            'missing preference' => [[], 'The language field is required.'],
            'non-string preference' => [['locale' => ['en-US']], 'The language field must be a string.'],
        ];
    }

    #[DataProvider('invalidLocales')]
    public function test_invalid_locale_returns_422_without_changing_the_account(array $payload, string $message): void
    {
        $user = User::factory()->pro()->create(['locale' => 'en-US']);
        $this->actingAs($user);

        $this->putJson('/api/profile/preferences', $payload)->assertUnprocessable()
            ->assertJsonPath('errors.locale.0', $message);

        $this->assertDatabaseHas('users', ['id' => $user->id, 'locale' => 'en-US']);
    }

    public function test_english_registration_inherits_the_selected_language(): void
    {
        $this->withHeader('Accept-Language', 'en-US')->postJson('/api/auth/register', [
            'name' => 'English account', 'email' => 'english@example.com',
            'password' => 'test password 123', 'password_confirmation' => 'test password 123',
        ])->assertCreated()->assertJsonPath('user.locale', 'en-US');

        $this->assertDatabaseHas('users', ['email' => 'english@example.com', 'locale' => 'en-US']);
    }

    public function test_login_validation_uses_the_language_selected_before_sign_in(): void
    {
        $this->withHeader('Accept-Language', 'en-US')->postJson('/api/auth/login', [])
            ->assertUnprocessable()->assertJsonPath('errors.email.0', 'Enter your email.')
            ->assertJsonPath('errors.password.0', 'Enter your password.');

        $this->assertGuest();
    }

    public function test_an_account_language_takes_precedence_over_the_request_header(): void
    {
        $this->actingAs(User::factory()->pro()->create(['locale' => 'pt-BR']));

        $response = $this->withHeader('Accept-Language', 'en-US')->putJson('/api/profile/work-hours', $this->hourlyPayload());
        $response->assertUnprocessable()->assertJsonValidationErrors('settings.weeklyHours');
        $this->assertSame('O campo jornada semanal é obrigatório.', $response->json('errors')['settings.weeklyHours'][0]);

        $this->assertDatabaseCount('work_days', 0);
    }

    public function test_english_weekend_records_only_require_an_hourly_rate_and_never_create_overtime(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-17T20:00:00Z'));
        $user = User::factory()->pro()->create(['locale' => 'en-US']);
        $this->actingAs($user);

        $this->putJson('/api/profile/work-hours', $this->hourlyPayload())->assertOk()
            ->assertJsonPath('settings.hourlyRate', 25)->assertJsonPath('settings.overtimeEnabled', false)
            ->assertJsonPath('day.regime.hourlyRate', 25)->assertJsonPath('day.regime.overtimeEnabled', false)
            ->assertJsonPath('day.entries.finishedAt', '18:00');

        $this->assertSame(25, $user->fresh()->work_settings['hourlyRate']);
        $day = WorkDay::where('work_date', '2026-10-17')->firstOrFail();
        $this->assertSame(32400.0, $day->workedSeconds(CarbonImmutable::now()));
        $this->assertSame(0.0, $day->completedOvertimeSeconds());
        $this->assertStringNotContainsString('hourlyRate', DB::table('users')->where('id', $user->id)->value('work_settings'));
    }

    public function test_hidden_brazilian_settings_do_not_block_an_english_account(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-17T20:00:00Z'));
        $this->actingAs(User::factory()->pro()->create(['locale' => 'en-US']));
        $payload = $this->hourlyPayload();
        $payload['settings'] += ['weeklyHours' => 'invalid', 'daysPerWeek' => 0, 'monthlySalary' => -100, 'monthlyHours' => 0, 'overtimePremium' => -1, 'cycleClosingDay' => 100];

        $this->putJson('/api/profile/work-hours', $payload)->assertOk()
            ->assertJsonPath('settings.hourlyRate', 25)->assertJsonPath('settings.overtimeEnabled', false)
            ->assertJsonPath('settings.monthlySalary', null)->assertJsonPath('settings.weeklyHours', 44);

        $this->assertDatabaseCount('work_days', 1);
    }

    public static function invalidHourlyRates(): array
    {
        return [
            'zero' => [0, 'The hourly rate field must be at least 0.01.'],
            'negative' => [-5, 'The hourly rate field must be at least 0.01.'],
            'non-numeric' => ['invalid', 'The hourly rate field must be a number.'],
            'too many decimal places' => ['12.345', 'The hourly rate field must have 0-2 decimal places.'],
            'over maximum' => [1000000000, 'The hourly rate field must not be greater than 999999999.'],
        ];
    }

    #[DataProvider('invalidHourlyRates')]
    public function test_an_invalid_hourly_rate_returns_422_without_saving(mixed $rate, string $message): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-17T20:00:00Z'));
        $user = User::factory()->pro()->create(['locale' => 'en-US']);
        $this->actingAs($user);
        $payload = $this->hourlyPayload();
        $payload['settings']['hourlyRate'] = $rate;

        $response = $this->putJson('/api/profile/work-hours', $payload);
        $response->assertUnprocessable()->assertJsonValidationErrors('settings.hourlyRate');
        $this->assertSame($message, $response->json('errors')['settings.hourlyRate'][0]);

        $this->assertDatabaseCount('work_days', 0);
        $this->assertNull($user->fresh()->work_settings);
    }

    public function test_english_accounts_can_track_time_without_a_pay_rate(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-17T20:00:00Z'));
        $this->actingAs(User::factory()->pro()->create(['locale' => 'en-US']));

        $this->putJson('/api/profile/work-hours', $this->hourlyPayload(null))->assertOk()
            ->assertJsonPath('settings.hourlyRate', null)->assertJsonPath('day.regime.overtimeEnabled', false)
            ->assertJsonPath('day.entries.startedAt', '08:00');

        $this->assertDatabaseCount('work_days', 1);
    }

    public function test_recording_from_the_widget_uses_the_account_mode_despite_older_profile_settings(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-17T09:00:00Z'));
        $this->actingAs(User::factory()->pro()->create([
            'locale' => 'en-US',
            'work_settings' => array_replace(WorkDay::defaultSettings('UTC'), ['enabled' => true, 'hourlyRate' => 30, 'overtimeEnabled' => true]),
        ]));

        $this->postJson('/api/profile/work-hours/records', ['action' => 'start', 'date' => '2026-10-17', 'entry_version' => 0])
            ->assertOk()->assertJsonPath('day.regime.overtimeEnabled', false)->assertJsonPath('day.regime.hourlyRate', 30);

        $this->assertDatabaseCount('work_days', 1);
        $this->assertFalse(WorkDay::firstOrFail()->regime['overtimeEnabled']);
    }

    public function test_history_keeps_the_original_rate_and_regime_after_profile_and_language_changes(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-17T20:00:00Z'));
        $user = User::factory()->pro()->create(['locale' => 'en-US']);
        $this->actingAs($user);
        $this->putJson('/api/profile/work-hours', $this->hourlyPayload())->assertOk();
        $this->actingAs($user->fresh());
        $this->travelTo(CarbonImmutable::parse('2026-10-18T20:00:00Z'));
        $payload = $this->hourlyPayload(40);
        $payload['date'] = '2026-10-18';
        $payload['settings_version'] = 1;
        $payload['entries'] = array_fill_keys(array_keys(WorkDay::STEPS), null);
        $this->putJson('/api/profile/work-hours', $payload)->assertOk();
        $this->putJson('/api/profile/preferences', ['locale' => 'pt-BR'])->assertOk();
        $this->actingAs($user->fresh());

        $this->getJson('/api/profile/work-hours/history?start=2026-10-17&end=2026-10-18')->assertOk()
            ->assertJsonPath('settings.hourlyRate', 40)->assertJsonPath('settings.overtimeEnabled', true)
            ->assertJsonPath('records.0.regime.hourlyRate', 25)->assertJsonPath('records.0.regime.overtimeEnabled', false);

        $this->assertSame(0.0, WorkDay::where('work_date', '2026-10-17')->firstOrFail()->completedOvertimeSeconds());
    }

    public function test_hourly_records_cannot_receive_an_overtime_payment(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-17T20:00:00Z'));
        $this->actingAs(User::factory()->pro()->create(['locale' => 'en-US']));
        $this->putJson('/api/profile/work-hours', $this->hourlyPayload())->assertOk();

        $this->putJson('/api/profile/work-hours/receipts', [
            'date' => '2026-10-17', 'entry_version' => 1, 'receipt_version' => 0,
            'amount' => 10, 'received_on' => '2026-10-17',
        ])->assertUnprocessable()->assertJsonPath('errors.amount.0', 'Finish a workday with overtime before recording its payment.');

        $this->assertNull(WorkDay::firstOrFail()->overtime_receipt);
    }

    public static function recoveryLanguages(): array
    {
        return [
            'English account with Portuguese browser' => ['en-US', 'pt-BR', 'Reset your password'],
            'Portuguese account with English browser' => ['pt-BR', 'en-US', 'Redefina sua senha'],
        ];
    }

    #[DataProvider('recoveryLanguages')]
    public function test_password_recovery_email_uses_the_account_language_even_with_another_request_language(string $locale, string $browser, string $subject): void
    {
        $user = User::factory()->pro()->create(['locale' => $locale]);

        $this->withHeader('Accept-Language', $browser)->postJson('/api/auth/forgot-password', ['email' => $user->email])->assertOk();

        $messages = Mail::mailer('array')->getSymfonyTransport()->messages();
        $this->assertCount(1, $messages);
        $this->assertSame($subject, $messages->first()->getOriginalMessage()->getSubject());
        $this->assertSame($user->email, $messages->first()->getOriginalMessage()->getTo()[0]->getAddress());
    }
}
