<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Cashier\Subscription;
use Mockery;
use Stripe\ApiRequestor;
use Stripe\HttpClient\ClientInterface;
use Stripe\HttpClient\CurlClient;
use Tests\TestCase;

class BillingWebhookTest extends TestCase
{
    use RefreshDatabase;

    private int $stripeRequests = 0;

    protected function setUp(): void
    {
        parent::setUp();
        config(['cashier.secret' => 'sk_test_fluxo', 'cashier.webhook.secret' => 'whsec_fluxo']);
        $this->stripe(null);
    }

    protected function tearDown(): void
    {
        ApiRequestor::setHttpClient(CurlClient::instance());
        parent::tearDown();
    }

    private function stripe(?array $response, int $status = 200): void
    {
        $client = Mockery::mock(ClientInterface::class);
        $client->shouldReceive('request')->andReturnUsing(function ($method, $url) use ($response, $status): array {
            $this->stripeRequests++;
            $this->assertNotNull($response, 'Unexpected Stripe call');
            $this->assertSame('get', $method);
            $this->assertStringEndsWith('/v1/subscriptions/sub_fluxo', $url);

            return [json_encode($response), $status, []];
        });
        ApiRequestor::setHttpClient($client);
    }

    private function subscription(string $status = 'active', array $extra = []): array
    {
        return array_replace([
            'id' => 'sub_fluxo', 'object' => 'subscription', 'customer' => 'cus_owner',
            'status' => $status, 'metadata' => ['type' => 'default'], 'trial_end' => null,
            'cancel_at' => null, 'cancel_at_period_end' => false, 'canceled_at' => null, 'ended_at' => null,
            'items' => ['object' => 'list', 'data' => [[
                'id' => 'si_fluxo', 'object' => 'subscription_item', 'quantity' => 1,
                'current_period_end' => time() + 86400,
                'price' => ['id' => 'price_fluxo_test', 'object' => 'price', 'product' => 'prod_fluxo'],
            ]]],
        ], $extra);
    }

    private function sendEvent(string $id = 'evt_fluxo', string $type = 'customer.subscription.updated', array $object = []): TestResponse
    {
        $body = json_encode(['id' => $id, 'object' => 'event', 'type' => $type, 'created' => time() - 60, 'data' => ['object' => array_replace(['id' => 'sub_fluxo', 'customer' => 'cus_owner', 'status' => 'active'], $object)]]);
        $timestamp = time();
        $signature = hash_hmac('sha256', $timestamp.'.'.$body, 'whsec_fluxo');

        return $this->call('POST', '/stripe/webhook', [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json', 'HTTP_STRIPE_SIGNATURE' => 't='.$timestamp.',v1='.$signature], $body);
    }

    public function test_missing_secret_returns_503_and_invalid_signature_returns_400(): void
    {
        $owner = User::factory()->create(['stripe_id' => 'cus_owner']);
        config(['cashier.webhook.secret' => null]);
        $this->postJson('/stripe/webhook', [])->assertStatus(503);
        config(['cashier.webhook.secret' => 'whsec_fluxo']);
        $this->postJson('/stripe/webhook', ['type' => 'customer.subscription.created'])->assertStatus(400);
        $this->assertDatabaseCount('subscriptions', 0);
        $this->assertDatabaseCount('stripe_webhook_events', 0);
        $this->assertFalse($owner->hasPro());
    }

    public function test_signed_subscription_event_syncs_owner_and_duplicate_does_not_repeat_processing(): void
    {
        $owner = User::factory()->create(['stripe_id' => 'cus_owner']);
        $other = User::factory()->create(['stripe_id' => 'cus_other']);
        $this->stripe($this->subscription());
        $this->app['env'] = 'staging';

        $this->sendEvent(type: 'customer.subscription.created')->assertOk();
        $this->sendEvent(type: 'customer.subscription.created')->assertOk();
        $this->assertSame(1, $this->stripeRequests);
        $this->assertDatabaseCount('subscriptions', 1);
        $this->assertDatabaseCount('subscription_items', 1);
        $this->assertDatabaseCount('stripe_webhook_events', 1);
        $this->assertDatabaseHas('subscriptions', ['user_id' => $owner->id, 'stripe_status' => 'active', 'stripe_price' => 'price_fluxo_test']);
        $this->assertTrue($owner->fresh()->hasPro());
        $this->assertFalse($other->fresh()->hasPro());
    }

    public function test_delayed_active_event_cannot_restore_access_when_stripe_now_reports_past_due(): void
    {
        $owner = User::factory()->create(['stripe_id' => 'cus_owner']);
        $this->stripe($this->subscription('past_due'));

        $this->sendEvent(object: ['status' => 'active'])->assertOk();
        $this->assertDatabaseHas('subscriptions', ['user_id' => $owner->id, 'stripe_status' => 'past_due']);
        $this->assertFalse($owner->fresh()->hasPro());
    }

    public function test_a_confirmed_subscription_in_brl_grants_the_same_pro_features(): void
    {
        $owner = User::factory()->create(['stripe_id' => 'cus_owner', 'locale' => 'en-US']);
        $remote = $this->subscription(extra: ['currency' => 'brl']);
        $remote['items']['data'][0]['price'] += ['currency' => 'brl', 'unit_amount' => 1299];
        $this->stripe($remote);

        $this->sendEvent(type: 'customer.subscription.created')->assertOk();

        $this->actingAs($owner)->getJson('/api/billing')->assertOk()->assertJsonPath('plan', 'pro')
            ->assertJsonPath('entitlements.pay_calculation', true)->assertJsonPath('entitlements.projects', null);
        $this->assertDatabaseHas('subscriptions', ['user_id' => $owner->id, 'stripe_price' => 'price_fluxo_test', 'stripe_status' => 'active']);
    }

    public function test_delayed_deletion_event_cannot_revoke_a_subscription_that_is_active_again(): void
    {
        $owner = User::factory()->create(['stripe_id' => 'cus_owner']);
        $this->stripe($this->subscription());

        $this->sendEvent(type: 'customer.subscription.deleted', object: ['status' => 'canceled'])->assertOk();
        $this->assertTrue($owner->fresh()->hasPro());
        $this->assertDatabaseHas('subscriptions', ['stripe_id' => 'sub_fluxo', 'stripe_status' => 'active']);
    }

    public function test_period_end_cancellation_keeps_access_until_end_and_final_cancellation_revokes_it(): void
    {
        $owner = User::factory()->create(['stripe_id' => 'cus_owner']);
        $end = time() + 86400;
        $this->stripe($this->subscription(extra: ['cancel_at_period_end' => true, 'cancel_at' => $end]));
        $this->sendEvent('evt_cancel_scheduled')->assertOk();
        $this->assertTrue($owner->fresh()->hasPro());
        $this->assertSame($end, Subscription::first()->ends_at->timestamp);
        $this->stripe($this->subscription('canceled', ['ended_at' => time() - 1, 'canceled_at' => time() - 86400]));
        $this->sendEvent('evt_cancel_final', 'customer.subscription.deleted')->assertOk();
        $this->assertFalse($owner->fresh()->hasPro());
        $this->assertDatabaseCount('stripe_webhook_events', 2);
    }

    public function test_customer_mismatch_returns_400_without_cross_account_writes(): void
    {
        User::factory()->create(['stripe_id' => 'cus_owner']);
        User::factory()->create(['stripe_id' => 'cus_other']);
        $this->stripe($this->subscription(extra: ['customer' => 'cus_other']));

        $this->sendEvent()->assertStatus(400);
        $this->assertDatabaseCount('subscriptions', 0);
        $this->assertDatabaseCount('stripe_webhook_events', 0);
    }

    public function test_api_failure_returns_500_and_keeps_event_retryable(): void
    {
        User::factory()->create(['stripe_id' => 'cus_owner']);
        $this->stripe(['error' => ['type' => 'invalid_request_error', 'message' => 'Test key unavailable']], 401);

        $this->sendEvent()->assertStatus(500);
        $this->assertDatabaseCount('subscriptions', 0);
        $this->assertDatabaseCount('stripe_webhook_events', 0);
        $this->stripe($this->subscription());
        $this->sendEvent()->assertOk();
        $this->assertDatabaseCount('stripe_webhook_events', 1);
    }

    public function test_unknown_customer_and_checkout_redirect_event_do_not_grant_access(): void
    {
        $owner = User::factory()->create();

        $this->sendEvent()->assertOk();
        $this->sendEvent('evt_checkout', 'checkout.session.completed')->assertOk();
        $this->assertSame(0, $this->stripeRequests);
        $this->assertDatabaseCount('subscriptions', 0);
        $this->assertFalse($owner->fresh()->hasPro());
    }
}
