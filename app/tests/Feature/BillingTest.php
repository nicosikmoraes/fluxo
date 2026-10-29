<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\WorkDay;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Cashier\Subscription;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Stripe\ApiRequestor;
use Stripe\HttpClient\ClientInterface;
use Stripe\HttpClient\CurlClient;
use Tests\TestCase;

class BillingTest extends TestCase
{
    use RefreshDatabase;

    private array $stripeRequests = [];

    protected function setUp(): void
    {
        parent::setUp();
        config(['billing.enabled' => true, 'cashier.secret' => 'sk_test_fluxo', 'cashier.webhook.secret' => 'whsec_fluxo', 'app.url' => 'https://fluxo.example']);
        $this->fakeStripe([]);
    }

    protected function tearDown(): void
    {
        ApiRequestor::setHttpClient(CurlClient::instance());
        parent::tearDown();
    }

    private function fakeStripe(array $responses): void
    {
        $client = Mockery::mock(ClientInterface::class);
        $client->shouldReceive('request')->andReturnUsing(function ($method, $url, $headers, $params) use (&$responses): array {
            $this->stripeRequests[] = ['method' => $method, 'path' => parse_url($url, PHP_URL_PATH), 'params' => $params, 'headers' => $headers];
            $this->assertNotEmpty($responses, 'Unexpected Stripe request: '.$url);
            $response = array_shift($responses);

            return [json_encode($response), 200, []];
        });
        ApiRequestor::setHttpClient($client);
    }

    private function subscription(User $user, string $status = 'active', array $extra = []): Subscription
    {
        return $user->subscriptions()->create(array_replace(['type' => 'default', 'stripe_id' => 'sub_'.$user->id, 'stripe_status' => $status, 'stripe_price' => 'price_fluxo_test', 'quantity' => 1], $extra));
    }

    private function price(): array
    {
        return ['id' => 'price_fluxo_test', 'object' => 'price', 'active' => true, 'currency' => 'usd', 'unit_amount' => 500, 'recurring' => ['interval' => 'month', 'interval_count' => 1]];
    }

    private function checkoutSession(string $status = 'open'): array
    {
        return ['id' => 'cs_test_fluxo', 'object' => 'checkout.session', 'url' => 'https://checkout.stripe.com/c/pay/test_fluxo', 'status' => $status, 'expires_at' => time() + 1860];
    }

    public function test_billing_endpoints_require_authentication_with_401(): void
    {
        $this->getJson('/api/billing')->assertUnauthorized();
        $this->postJson('/api/billing/checkout')->assertUnauthorized();
        $this->postJson('/api/billing/portal')->assertUnauthorized();
        $this->assertSame([], $this->stripeRequests);
    }

    public function test_free_account_gets_limits_without_stripe_credentials_or_another_users_usage(): void
    {
        config(['billing.ads_enabled' => true]);
        $owner = User::factory()->create();
        $this->actingAs($owner)->postJson('/api/projects', ['title' => 'Outro dono', 'cover' => 'desk'])->assertCreated();
        $this->flushSession();
        $this->actingAs(User::factory()->create());

        $this->getJson('/api/billing')->assertOk()->assertJsonPath('plan', 'free')->assertJsonPath('price.amount', 500)
            ->assertJsonPath('price.currency', 'usd')->assertJsonPath('entitlements.projects', 3)
            ->assertJsonPath('entitlements.roadmaps_per_project', 1)->assertJsonPath('entitlements.pay_calculation', false)
            ->assertJsonPath('entitlements.show_ads', true)->assertJsonPath('usage.projects', 0)
            ->assertJsonMissingPath('stripe_id')->assertDontSee('sk_test_fluxo')->assertDontSee('whsec_fluxo');
        $this->getJson('/api/auth/session')->assertOk()->assertJsonPath('user.billing.plan', 'free');
    }

    public static function subscriptionStates(): array
    {
        return [
            'active' => ['active', null, 'price_fluxo_test', 'pro'],
            'cancel at period end' => ['active', '2026-11-02', 'price_fluxo_test', 'pro'],
            'period ended' => ['active', '2026-10-28', 'price_fluxo_test', 'free'],
            'past due' => ['past_due', null, 'price_fluxo_test', 'free'],
            'unpaid' => ['unpaid', null, 'price_fluxo_test', 'free'],
            'incomplete' => ['incomplete', null, 'price_fluxo_test', 'free'],
            'canceled' => ['canceled', null, 'price_fluxo_test', 'free'],
            'unrecognized price' => ['active', null, 'price_other', 'free'],
        ];
    }

    #[DataProvider('subscriptionStates')]
    public function test_access_follows_confirmed_subscription_status_and_period(string $status, ?string $end, string $price, string $plan): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-29T12:00:00Z'));
        $user = User::factory()->create();
        $this->subscription($user, $status, ['ends_at' => $end, 'stripe_price' => $price]);
        $this->actingAs($user)->getJson('/api/billing')->assertOk()->assertJsonPath('plan', $plan)
            ->assertJsonPath('entitlements.pay_calculation', $plan === 'pro')
            ->assertJsonPath('entitlements.ad_free', $plan === 'pro');
    }

    public function test_free_account_can_create_three_projects_but_fourth_returns_403(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        for ($i = 0; $i < 3; $i++) {
            $this->postJson('/api/projects', ['title' => 'Projeto '.$i, 'cover' => 'desk'])->assertCreated();
        }
        $this->postJson('/api/projects', ['title' => 'Quarto', 'cover' => 'desk', 'plan' => 'pro'])->assertForbidden()
            ->assertJsonPath('message', 'O plano gratuito permite até 3 projetos. Conheça o Fluxo Pro para criar mais.');
        $this->assertDatabaseCount('projects', 3);
        $this->assertDatabaseMissing('projects', ['title' => 'Quarto']);
    }

    public function test_each_free_project_has_one_roadmap_and_second_returns_403(): void
    {
        $this->actingAs(User::factory()->create());
        foreach (['Primeiro', 'Segundo'] as $name) {
            $id = $this->postJson('/api/projects', ['title' => $name, 'cover' => 'desk'])->assertCreated()->json('id');
            $this->postJson('/api/projects/'.$id.'/roadmaps', ['title' => 'Único'])->assertCreated();
            $this->postJson('/api/projects/'.$id.'/roadmaps', ['title' => 'Extra'])->assertForbidden();
        }
        $this->assertDatabaseCount('roadmaps', 2);
    }

    public function test_pro_removes_creation_limits_and_downgrade_preserves_existing_work(): void
    {
        $user = User::factory()->create();
        $subscription = $this->subscription($user);
        $this->actingAs($user);
        for ($i = 0; $i < 4; $i++) {
            $id = $this->postJson('/api/projects', ['title' => 'Projeto '.$i, 'cover' => 'desk'])->assertCreated()->json('id');
        }
        for ($i = 0; $i < 3; $i++) {
            $this->postJson('/api/projects/'.$id.'/roadmaps', ['title' => 'Mapa '.$i])->assertCreated();
        }
        $subscription->update(['stripe_status' => 'canceled']);

        $this->getJson('/api/workspace')->assertOk()->assertJsonCount(4, 'projects')->assertJsonCount(3, 'roadmaps');
        $this->patchJson('/api/projects/'.$id, ['title' => 'Preservado', 'cover' => 'mint'])->assertOk();
        $this->postJson('/api/projects', ['title' => 'Novo', 'cover' => 'desk'])->assertForbidden();
        $this->postJson('/api/projects/'.$id.'/roadmaps', ['title' => 'Novo'])->assertForbidden();
        $this->assertDatabaseCount('projects', 4);
        $this->assertDatabaseCount('roadmaps', 3);
    }

    public function test_free_time_tracking_remains_available_and_pay_inputs_return_403(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-10-29T20:00:00Z'));
        $this->actingAs(User::factory()->create(['locale' => 'en-US']));
        $payload = ['settings' => [...WorkDay::defaultSettings('UTC'), 'enabled' => true], 'settings_version' => 0, 'entry_version' => 0, 'date' => '2026-10-29', 'entries' => ['startedAt' => '09:00', 'lunchOut' => '', 'lunchIn' => '', 'finishedAt' => '17:00']];
        $this->putJson('/api/profile/work-hours', $payload)->assertOk()->assertJsonPath('day.entries.finishedAt', '17:00')->assertJsonPath('settings.hourlyRate', null);
        $this->putJson('/api/profile/work-hours', ['settings' => ['hourlyRate' => 25]])->assertForbidden()->assertJsonPath('message', 'Pay calculation is available with Fluxo Pro.');
        $this->putJson('/api/profile/work-hours/receipts', [])->assertForbidden();
        $this->assertDatabaseCount('work_days', 1);
    }

    public function test_downgrade_redacts_current_and_historical_pay_without_erasing_stored_values(): void
    {
        $settings = [...WorkDay::defaultSettings('UTC'), 'monthlySalary' => 4400, 'hourlyRate' => 25];
        $user = User::factory()->create(['work_settings' => $settings]);
        $this->actingAs($user);
        $day = WorkDay::create(['work_date' => '2026-10-28', 'timezone' => 'UTC', 'started_at' => '2026-10-28 09:00:00', 'finished_at' => '2026-10-28 18:00:00', 'regime' => $settings]);
        $day->forceFill(['overtime_receipt' => ['amount_cents' => 3000, 'received_on' => '2026-10-29']])->save();

        $this->getJson('/api/profile/work-hours?date=2026-10-28')->assertOk()->assertJsonPath('settings.monthlySalary', null)->assertJsonPath('day.regime.hourlyRate', null)->assertJsonPath('day.receipt.amount', null)->assertJsonPath('day.receipt.received_on', null);
        $this->getJson('/api/profile/work-hours/history?start=2026-10-28&end=2026-10-29')->assertOk()->assertJsonPath('records.0.regime.monthlySalary', null)->assertJsonPath('records.0.receipt.amount', null);
        $this->assertSame(4400, $user->fresh()->work_settings['monthlySalary']);
        $this->assertSame(3000, $day->fresh()->overtime_receipt['amount_cents']);
    }

    public function test_unconfigured_checkout_returns_503_without_contacting_stripe(): void
    {
        config(['billing.enabled' => false]);
        $this->actingAs(User::factory()->create())->postJson('/api/billing/checkout')->assertStatus(503);
        $this->assertSame([], $this->stripeRequests);
    }

    public function test_checkout_uses_only_server_price_customer_and_safe_return_urls(): void
    {
        $this->fakeStripe([$this->price(), ['id' => 'cus_owner', 'object' => 'customer'], $this->checkoutSession(), $this->checkoutSession()]);
        $user = User::factory()->create(['locale' => 'pt-BR']);
        $other = User::factory()->create();
        $this->actingAs($user);
        $this->postJson('/api/billing/checkout', ['price' => 'price_cheaper', 'amount' => 1, 'user_id' => $other->id, 'success_url' => 'https://evil.example'])->assertOk()->assertJsonPath('url', 'https://checkout.stripe.com/c/pay/test_fluxo');
        $payload = $this->stripeRequests[2]['params'];
        $this->assertSame('cus_owner', $payload['customer']);
        $this->assertSame('price_fluxo_test', $payload['line_items'][0]['price']);
        $this->assertSame('subscription', $payload['mode']);
        $this->assertSame('true', $payload['adaptive_pricing']['enabled']);
        $this->assertSame('https://fluxo.example/?view=billing&checkout=success', $payload['success_url']);
        $this->assertSame('pt-BR', $payload['locale']);
        $this->assertSame('default', $payload['subscription_data']['metadata']['type']);
        $this->assertDatabaseHas('users', ['id' => $user->id, 'stripe_id' => 'cus_owner', 'stripe_checkout_id' => 'cs_test_fluxo']);
        $this->assertDatabaseHas('users', ['id' => $other->id, 'stripe_id' => null]);
        $this->postJson('/api/billing/checkout')->assertOk();
        $this->assertSame(['get', 'post', 'post', 'get'], array_column($this->stripeRequests, 'method'));
        $this->assertDatabaseCount('subscriptions', 0);
        $this->getJson('/api/billing?checkout=success')->assertOk()->assertJsonPath('plan', 'free');
    }

    public function test_english_checkout_stays_in_dollars_without_adaptive_pricing(): void
    {
        $this->fakeStripe([$this->price(), ['id' => 'cus_en', 'object' => 'customer'], $this->checkoutSession()]);
        $this->actingAs(User::factory()->create(['locale' => 'en-US']))->postJson('/api/billing/checkout')->assertOk();
        $this->assertSame('false', $this->stripeRequests[2]['params']['adaptive_pricing']['enabled']);
        $this->assertSame('en', $this->stripeRequests[2]['params']['locale']);
    }

    public function test_wrong_price_amount_returns_503_before_creating_a_customer(): void
    {
        $this->fakeStripe([[...$this->price(), 'unit_amount' => 1500]]);
        $user = User::factory()->create();
        $this->actingAs($user)->postJson('/api/billing/checkout')->assertStatus(503);
        $this->assertCount(1, $this->stripeRequests);
        $this->assertDatabaseHas('users', ['id' => $user->id, 'stripe_id' => null]);
    }

    public function test_existing_subscription_cannot_start_another_checkout_with_409(): void
    {
        $user = User::factory()->create();
        $this->subscription($user, 'past_due');
        $this->actingAs($user)->postJson('/api/billing/checkout')->assertStatus(409);
        $this->assertSame([], $this->stripeRequests);
        $this->assertDatabaseCount('subscriptions', 1);
    }

    public function test_completed_checkout_waits_for_webhook_instead_of_creating_another_charge(): void
    {
        $this->fakeStripe([$this->checkoutSession('complete')]);
        $user = User::factory()->create(['stripe_id' => 'cus_owner', 'stripe_checkout_id' => 'cs_test_fluxo']);
        $this->actingAs($user)->postJson('/api/billing/checkout')->assertStatus(409);
        $this->assertCount(1, $this->stripeRequests);
        $this->getJson('/api/billing')->assertOk()->assertJsonPath('plan', 'free');
    }

    public function test_portal_uses_authenticated_customer_and_cannot_be_redirected_by_payload(): void
    {
        $this->fakeStripe([['id' => 'bps_test', 'object' => 'billing_portal.session', 'url' => 'https://billing.stripe.com/p/session/test']]);
        $user = User::factory()->create(['stripe_id' => 'cus_owner']);
        $this->actingAs($user)->postJson('/api/billing/portal', ['customer' => 'cus_other', 'return_url' => 'https://evil.example'])->assertOk();
        $this->assertSame('cus_owner', $this->stripeRequests[0]['params']['customer']);
        $this->assertSame('https://fluxo.example/?view=billing', $this->stripeRequests[0]['params']['return_url']);
    }
}
