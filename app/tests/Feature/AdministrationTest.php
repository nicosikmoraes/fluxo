<?php

namespace Tests\Feature;

use App\Models\AdminEvent;
use App\Models\AdminSetting;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Laravel\Cashier\Subscription;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Stripe\ApiRequestor;
use Stripe\HttpClient\ClientInterface;
use Stripe\HttpClient\CurlClient;
use Tests\TestCase;

class AdministrationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $client = Mockery::mock(ClientInterface::class);
        $client->shouldNotReceive('request');
        ApiRequestor::setHttpClient($client);
    }

    protected function tearDown(): void
    {
        ApiRequestor::setHttpClient(CurlClient::instance());
        parent::tearDown();
    }

    private function subscription(User $user, string $status = 'active', array $extra = []): Subscription
    {
        return $user->subscriptions()->create(array_replace(['type' => 'default', 'stripe_id' => 'sub_'.$user->id, 'stripe_status' => $status, 'stripe_price' => 'price_fluxo_test', 'quantity' => 1], $extra));
    }

    private function grantPayload(array $extra = []): array
    {
        return array_replace(['version' => 0, 'duration' => '30', 'reason' => 'Parceria da comunidade'], $extra);
    }

    public function test_admin_endpoints_return_401_without_a_session(): void
    {
        $target = User::factory()->create();
        foreach (['/api/admin/overview', '/api/admin/users', '/api/admin/users/'.$target->id, '/api/admin/settings', '/api/admin/events', '/api/admin/users/export'] as $url) {
            $this->getJson($url)->assertUnauthorized();
        }
        $this->postJson('/api/admin/users/'.$target->id.'/grant', $this->grantPayload())->assertUnauthorized();
        $this->deleteJson('/api/admin/users/'.$target->id.'/grant', ['version' => 0, 'reason' => 'Encerramento manual'])->assertUnauthorized();
        $this->patchJson('/api/admin/users/'.$target->id, ['version' => 0, 'disabled' => true, 'reason' => 'Solicitação do usuário'])->assertUnauthorized();
        $this->putJson('/api/admin/settings', [])->assertUnauthorized();
        $this->get('/admin')->assertRedirect('/');
        $this->assertDatabaseCount('admin_events', 0);
    }

    public function test_ordinary_accounts_receive_403_on_every_admin_operation(): void
    {
        $target = User::factory()->create();
        $this->actingAs(User::factory()->create());
        foreach (['/api/admin/overview', '/api/admin/users', '/api/admin/users/'.$target->id, '/api/admin/settings', '/api/admin/events', '/api/admin/users/export'] as $url) {
            $this->getJson($url)->assertForbidden();
        }
        $this->postJson('/api/admin/users/'.$target->id.'/grant', $this->grantPayload())->assertForbidden();
        $this->deleteJson('/api/admin/users/'.$target->id.'/grant', ['version' => 0, 'reason' => 'Encerramento manual'])->assertForbidden();
        $this->patchJson('/api/admin/users/'.$target->id, ['version' => 0, 'disabled' => true, 'reason' => 'Solicitação do usuário'])->assertForbidden();
        $this->putJson('/api/admin/settings', [])->assertForbidden();
        $this->get('/admin')->assertForbidden();
        $this->assertDatabaseHas('users', ['id' => $target->id, 'admin_version' => 0, 'pro_granted_at' => null, 'disabled_at' => null]);
        $this->assertDatabaseCount('admin_events', 0);
    }

    public static function roles(): array
    {
        return ['ordinary' => [false, null, false], 'administrator' => [true, null, true], 'disabled administrator' => [true, '2026-10-29 12:00:00', false]];
    }

    #[DataProvider('roles')]
    public function test_gate_enforces_admin_role_and_account_availability(bool $admin, ?string $disabled, bool $allowed): void
    {
        $user = User::factory()->make(['is_admin' => $admin, 'disabled_at' => $disabled]);
        $this->assertSame($allowed, Gate::forUser($user)->allows('access-admin'));
    }

    public function test_overview_uses_real_accounts_and_excludes_courtesies_from_estimated_revenue(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-30 12:00:00'));
        $admin = User::factory()->administrator()->create();
        User::factory()->create();
        $paid = User::factory()->create();
        $this->subscription($paid);
        User::factory()->create(['pro_granted_at' => now(), 'pro_expires_at' => now()->addDays(30)]);
        User::factory()->create(['pro_granted_at' => now()->subDays(40), 'pro_expires_at' => now()->subDay()]);
        $pending = User::factory()->create();
        $this->subscription($pending, 'past_due');
        $response = $this->actingAs($admin)->getJson('/api/admin/overview?period=week');
        $response->assertOk()->assertJsonPath('counts.total', 6)->assertJsonPath('counts.paid', 1)->assertJsonPath('counts.manual', 1)
            ->assertJsonPath('counts.active', 2)->assertJsonPath('counts.canceled', 1)->assertJsonPath('counts.pending', 1)->assertJsonPath('counts.free', 2)
            ->assertJsonPath('revenue.amount', 5)->assertJsonPath('revenue.currency', 'usd')->assertJsonPath('revenue.estimated', true)->assertJsonCount(7, 'registrations')
            ->assertJsonPath('registrations.6.value', 6);
        $this->assertDatabaseCount('subscriptions', 2);
    }

    public function test_user_directory_is_paginated_and_does_not_expose_secrets_or_workspace_content(): void
    {
        $admin = User::factory()->administrator()->create();
        $target = User::factory()->create(['email' => 'target@example.com', 'stripe_id' => 'cus_private', 'stripe_checkout_url' => 'https://checkout.private', 'work_settings' => ['monthlySalary' => 9000]]);
        User::factory()->count(12)->create();
        $this->actingAs($admin)->getJson('/api/admin/users?search=TARGET%40EXAMPLE.COM')->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.id', $target->id)
            ->assertJsonMissingPath('data.0.password')->assertJsonMissingPath('data.0.stripe_id')->assertJsonMissingPath('data.0.stripe_checkout_url')->assertJsonMissingPath('data.0.work_settings');
        $this->getJson('/api/admin/users?per_page=3&page=2')->assertOk()->assertJsonPath('total', 14)->assertJsonCount(3, 'data')->assertJsonPath('current_page', 2);
        $this->getJson('/api/admin/users?per_page=101')->assertUnprocessable()->assertJsonValidationErrors('per_page');
    }

    public static function durations(): array
    {
        return ['seven' => ['7', null, '2026-11-06 12:00:00'], 'thirty' => ['30', null, '2026-11-29 12:00:00'], 'ninety' => ['90', null, '2027-01-28 12:00:00'], 'unlimited' => ['forever', null, null], 'custom' => ['custom', '2026-11-01', '2026-11-01 23:59:59']];
    }

    #[DataProvider('durations')]
    public function test_grant_creates_real_pro_access_and_audits_actor_without_creating_stripe_records(string $duration, ?string $until, ?string $expires): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-30 12:00:00'));
        $admin = User::factory()->administrator()->create();
        $target = User::factory()->create();
        $this->actingAs($admin)->postJson('/api/admin/users/'.$target->id.'/grant', $this->grantPayload(['duration' => $duration, 'until' => $until, 'is_admin' => true]))
            ->assertCreated()->assertJsonPath('status', 'manual')->assertJsonPath('source', 'manual')->assertJsonPath('version', 1);
        $this->assertSame($expires, $target->fresh()->pro_expires_at?->format('Y-m-d H:i:s'));
        $this->assertDatabaseHas('users', ['id' => $target->id, 'is_admin' => false, 'pro_granted_by' => $admin->id, 'admin_version' => 1]);
        $this->assertDatabaseHas('admin_events', ['actor_id' => $admin->id, 'target_id' => $target->id, 'action' => 'grant.created', 'detail' => 'Parceria da comunidade']);
        $this->actingAs($target)->getJson('/api/billing')->assertOk()->assertJsonPath('plan', 'pro')->assertJsonPath('access_source', 'manual')->assertJsonPath('entitlements.work_tracking', true);
        $this->assertDatabaseCount('subscriptions', 0);
    }

    public function test_courtesy_expires_at_the_deadline_and_work_tracking_is_refused_with_403(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-30 12:00:00'));
        $user = User::factory()->create(['pro_granted_at' => now(), 'pro_expires_at' => '2026-10-30 13:00:00']);
        $this->actingAs($user)->getJson('/api/profile/work-hours')->assertOk();
        $this->travelTo(CarbonImmutable::parse('2026-10-30 13:00:00'));
        $this->getJson('/api/billing')->assertOk()->assertJsonPath('plan', 'free')->assertJsonPath('access_source', null);
        $this->getJson('/api/profile/work-hours')->assertForbidden();
    }

    public static function ongoingStatuses(): array
    {
        return array_combine(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'], array_map(fn (string $status) => [$status], ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']));
    }

    #[DataProvider('ongoingStatuses')]
    public function test_courtesy_rejects_ongoing_stripe_subscriptions_with_409(string $status): void
    {
        $admin = User::factory()->administrator()->create();
        $target = User::factory()->create();
        $this->subscription($target, $status);
        $this->actingAs($admin)->postJson('/api/admin/users/'.$target->id.'/grant', $this->grantPayload())->assertConflict()->assertJsonPath('message', 'Esta conta tem cobrança em andamento. Gerencie a assinatura Stripe antes de conceder uma cortesia.');
        $this->assertDatabaseHas('users', ['id' => $target->id, 'admin_version' => 0, 'pro_granted_at' => null]);
        $this->assertDatabaseCount('admin_events', 0);
    }

    public function test_courtesy_rejects_an_open_checkout_and_disabled_accounts_with_409(): void
    {
        $admin = User::factory()->administrator()->create();
        $target = User::factory()->create(['stripe_checkout_id' => 'cs_open', 'stripe_checkout_expires_at' => now()->addMinutes(20)]);
        $this->actingAs($admin)->postJson('/api/admin/users/'.$target->id.'/grant', $this->grantPayload())->assertConflict();
        $disabled = User::factory()->create(['disabled_at' => now()]);
        $this->postJson('/api/admin/users/'.$disabled->id.'/grant', $this->grantPayload())->assertConflict()->assertJsonPath('message', 'Reative a conta antes de conceder uma cortesia.');
        $this->assertDatabaseCount('admin_events', 0);
    }

    public function test_grant_validation_requires_a_reason_and_a_future_custom_date(): void
    {
        $admin = User::factory()->administrator()->create();
        $target = User::factory()->create();
        $this->actingAs($admin)->postJson('/api/admin/users/'.$target->id.'/grant', [])->assertUnprocessable()->assertJsonValidationErrors(['version', 'duration', 'reason']);
        $this->postJson('/api/admin/users/'.$target->id.'/grant', $this->grantPayload(['duration' => 'custom', 'until' => now()->toDateString()]))->assertUnprocessable()->assertJsonValidationErrors('until');
        $this->postJson('/api/admin/users/'.$target->id.'/grant', $this->grantPayload(['reason' => '   ']))->assertUnprocessable()->assertJsonValidationErrors('reason');
        $this->assertDatabaseCount('admin_events', 0);
    }

    public function test_stale_grant_writes_return_409_and_leave_the_original_reason_unchanged(): void
    {
        $admin = User::factory()->administrator()->create();
        $target = User::factory()->create();
        $this->actingAs($admin);
        $this->postJson('/api/admin/users/'.$target->id.'/grant', $this->grantPayload())->assertCreated();
        $this->postJson('/api/admin/users/'.$target->id.'/grant', $this->grantPayload(['reason' => 'Alteração desatualizada']))->assertConflict();
        $this->assertDatabaseHas('users', ['id' => $target->id, 'pro_reason' => 'Parceria da comunidade', 'admin_version' => 1]);
        $this->assertDatabaseCount('admin_events', 1);
    }

    public function test_revoking_a_courtesy_never_cancels_an_existing_paid_subscription(): void
    {
        $admin = User::factory()->administrator()->create();
        $target = User::factory()->create(['pro_granted_at' => now(), 'pro_expires_at' => null]);
        $subscription = $this->subscription($target);
        $this->actingAs($admin)->deleteJson('/api/admin/users/'.$target->id.'/grant', ['version' => 0, 'reason' => 'Benefício finalizado'])->assertOk()->assertJsonPath('status', 'active');
        $this->assertNotNull($target->fresh()->pro_revoked_at);
        $this->assertDatabaseHas('subscriptions', ['id' => $subscription->id, 'stripe_status' => 'active', 'ends_at' => null]);
        $this->assertDatabaseHas('admin_events', ['action' => 'grant.revoked', 'detail' => 'Benefício finalizado']);
        $this->actingAs($target)->getJson('/api/billing')->assertOk()->assertJsonPath('plan', 'pro')->assertJsonPath('access_source', 'stripe');
    }

    public function test_revocation_rejects_an_expired_grant_with_409(): void
    {
        $target = User::factory()->create(['pro_granted_at' => now()->subDays(40), 'pro_expires_at' => now()->subDay()]);
        $this->actingAs(User::factory()->administrator()->create())->deleteJson('/api/admin/users/'.$target->id.'/grant', ['version' => 0, 'reason' => 'Benefício finalizado'])->assertConflict();
        $this->assertDatabaseCount('admin_events', 0);
    }

    public function test_disabling_an_account_blocks_existing_sessions_and_password_login(): void
    {
        $admin = User::factory()->administrator()->create();
        $target = User::factory()->create();
        $this->actingAs($admin)->patchJson('/api/admin/users/'.$target->id, ['version' => 0, 'disabled' => true, 'reason' => 'Solicitação do usuário'])->assertOk()->assertJsonPath('disabled', true);
        $this->actingAs($target->fresh())->getJson('/api/workspace')->assertUnauthorized();
        $this->postJson('/api/auth/login', ['email' => $target->email, 'password' => 'password'])->assertUnprocessable();
        $this->assertDatabaseHas('admin_events', ['action' => 'account.disabled', 'detail' => 'Solicitação do usuário']);
        $this->actingAs($admin)->patchJson('/api/admin/users/'.$target->id, ['version' => 1, 'disabled' => false, 'reason' => 'Solicitação de reativação'])->assertOk()->assertJsonPath('disabled', false);
        $this->flushSession();
        $this->postJson('/api/auth/login', ['email' => $target->email, 'password' => 'password'])->assertOk();
    }

    public function test_admin_accounts_cannot_be_disabled_with_403(): void
    {
        $admin = User::factory()->administrator()->create();
        $this->actingAs($admin)->patchJson('/api/admin/users/'.$admin->id, ['version' => 0, 'disabled' => true, 'reason' => 'Tentativa de desativação'])->assertForbidden();
        $this->assertDatabaseHas('users', ['id' => $admin->id, 'disabled_at' => null]);
    }

    public function test_settings_are_persistent_and_control_registration_and_maintenance(): void
    {
        $admin = User::factory()->administrator()->create();
        $values = ['name' => 'Meu Fluxo', 'email' => 'suporte@example.com', 'defaultGrant' => '7', 'newAccounts' => false, 'maintenance' => true];
        $this->actingAs($admin)->putJson('/api/admin/settings', ['version' => 0, 'settings' => $values])->assertOk()->assertJsonPath('settings.name', 'Meu Fluxo')->assertJsonPath('version', 1);
        $this->assertSame($values, AdminSetting::preferences());
        $this->assertDatabaseHas('admin_events', ['actor_id' => $admin->id, 'action' => 'settings.updated']);
        $this->getJson('/api/admin/settings')->assertOk()->assertJsonMissingPath('billing.secret');
        $this->actingAs(User::factory()->create())->getJson('/api/workspace')->assertServiceUnavailable();
        $this->getJson('/api/billing')->assertOk();
        $this->flushSession();
        $this->postJson('/api/auth/register', [])->assertServiceUnavailable();
        AdminSetting::findOrFail(1)->update(['values' => array_replace($values, ['maintenance' => false])]);
        $this->postJson('/api/auth/register', [])->assertForbidden()->assertJsonPath('message', 'Novos cadastros estão temporariamente desativados.');
    }

    public function test_settings_reject_stale_versions_and_secret_keys(): void
    {
        $admin = User::factory()->administrator()->create();
        $values = AdminSetting::preferences();
        $this->actingAs($admin);
        $this->putJson('/api/admin/settings', ['version' => 0, 'settings' => array_replace($values, ['stripe_secret' => 'secret'])])->assertUnprocessable()->assertJsonValidationErrors('settings');
        $this->putJson('/api/admin/settings', ['version' => 99, 'settings' => $values])->assertConflict();
        $this->assertDatabaseCount('admin_events', 0);
    }

    public function test_registration_cannot_assign_administrator_or_pro_privileges(): void
    {
        $this->postJson('/api/auth/register', ['name' => 'Pessoa', 'email' => 'pessoa@example.com', 'password' => 'password', 'password_confirmation' => 'password', 'is_admin' => true, 'pro_granted_at' => now(), 'pro_expires_at' => null])
            ->assertCreated()->assertJsonPath('user.is_admin', false)->assertJsonPath('user.billing.plan', 'free');
        $this->assertDatabaseHas('users', ['email' => 'pessoa@example.com', 'is_admin' => false, 'pro_granted_at' => null]);
    }

    public function test_export_respects_filters_and_escapes_spreadsheet_formulas(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-30 12:00:00'));
        $admin = User::factory()->administrator()->create();
        $target = User::factory()->create(['name' => '=HYPERLINK("https://example.com")', 'email' => 'export@example.com']);
        $response = $this->actingAs($admin)->get('/api/admin/users/export?search=export%40example.com');
        $response->assertOk()->assertDownload('fluxo-usuarios-2026-10-30.csv');
        $lines = explode("\n", $response->streamedContent());
        $row = str_getcsv(trim($lines[1]), ';', '"', '');
        $this->assertSame("'".$target->name, $row[0]);
        $this->assertSame('export@example.com', $row[1]);
        $this->assertDatabaseHas('admin_events', ['action' => 'users.exported', 'actor_id' => $admin->id]);
    }

    public function test_events_are_paginated_and_preserve_actor_identity(): void
    {
        $admin = User::factory()->administrator()->create();
        AdminEvent::factory()->count(22)->create(['actor_id' => $admin->id, 'target_id' => null, 'actor_name' => $admin->name]);
        $this->actingAs($admin)->getJson('/api/admin/events?page=2')->assertOk()->assertJsonPath('total', 22)->assertJsonCount(2, 'data')->assertJsonPath('data.0.actor', $admin->name);
    }

    public function test_console_assigns_only_existing_accounts_and_protects_the_last_admin(): void
    {
        $user = User::factory()->create(['email' => 'owner@example.com']);
        $this->artisan('fluxo:admin', ['email' => 'missing@example.com'])->assertExitCode(1);
        $this->artisan('fluxo:admin', ['email' => 'OWNER@EXAMPLE.COM'])->assertExitCode(0);
        $this->assertDatabaseHas('users', ['id' => $user->id, 'is_admin' => true]);
        $this->assertDatabaseHas('admin_events', ['action' => 'admin.granted', 'actor_name' => 'Console', 'target_id' => $user->id]);
        $this->artisan('fluxo:admin', ['email' => $user->email, '--revoke' => true])->assertExitCode(1);
        $this->assertDatabaseHas('users', ['id' => $user->id, 'is_admin' => true]);
    }

    public function test_pending_payments_remain_visible_even_when_a_courtesy_is_active(): void
    {
        $admin = User::factory()->administrator()->create();
        $target = User::factory()->create(['pro_granted_at' => now(), 'pro_expires_at' => null]);
        $this->subscription($target, 'past_due');
        $this->actingAs($admin)->getJson('/api/admin/overview')->assertOk()->assertJsonPath('counts.manual', 1)->assertJsonPath('counts.pending', 1);
        $this->getJson('/api/admin/users?status=past_due')->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.status', 'manual')->assertJsonPath('data.0.stripe_status', 'past_due');
    }

    public function test_recipient_search_excludes_a_checkout_attempt_without_a_session_id(): void
    {
        $admin = User::factory()->administrator()->create();
        $target = User::factory()->create(['email' => 'attempt@example.com', 'stripe_checkout_payload' => ['expires_at' => now()->addMinutes(20)->timestamp]]);
        $this->actingAs($admin)->getJson('/api/admin/users?eligible=1&search=attempt%40example.com')->assertOk()->assertJsonPath('total', 0);
        $this->postJson('/api/admin/users/'.$target->id.'/grant', $this->grantPayload())->assertConflict();
        $this->assertDatabaseCount('admin_events', 0);
    }

    public function test_admin_page_serves_the_real_entry_and_no_store_cache_headers(): void
    {
        $admin = User::factory()->administrator()->create();
        $this->actingAs($admin)->get('/admin')->assertOk()->assertSee('/ui/assets/admin-', false)->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_unrecognized_stripe_prices_are_not_counted_as_pro_revenue(): void
    {
        $admin = User::factory()->administrator()->create();
        $target = User::factory()->create();
        $this->subscription($target, 'active', ['stripe_price' => 'price_other']);
        $this->actingAs($admin)->getJson('/api/admin/overview')->assertOk()->assertJsonPath('counts.paid', 0)->assertJsonPath('revenue.amount', 0);
        $this->getJson('/api/admin/users/'.$target->id)->assertOk()->assertJsonPath('status', 'other')->assertJsonPath('can_grant', false);
    }

    public function test_settings_require_a_nullable_support_email_key_and_preserve_public_preferences(): void
    {
        $admin = User::factory()->administrator()->create();
        $values = AdminSetting::preferences();
        unset($values['email']);
        $this->actingAs($admin)->putJson('/api/admin/settings', ['version' => 0, 'settings' => $values])
            ->assertUnprocessable()->assertJsonValidationErrors('settings.email');
        $this->getJson('/api/auth/session')->assertOk()->assertJsonPath('site.email', null);
        $this->assertDatabaseCount('admin_events', 0);
    }
}
