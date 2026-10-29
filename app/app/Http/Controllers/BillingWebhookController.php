<?php

namespace App\Http\Controllers;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Laravel\Cashier\Cashier;
use Stripe\Exception\SignatureVerificationException;
use Stripe\Webhook;
use UnexpectedValueException;

class BillingWebhookController extends Controller
{
    public function __invoke(Request $request): Response
    {
        abort_unless(config('cashier.webhook.secret'), 503);
        try {
            $event = Webhook::constructEvent($request->getContent(), $request->header('Stripe-Signature', ''), config('cashier.webhook.secret'));
        } catch (SignatureVerificationException|UnexpectedValueException) {
            abort(400);
        }
        if (! in_array($event->type, ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'], true)) {
            return response('OK');
        }
        abort_unless(is_string($event->id) && is_string($event->data->object->customer) && is_string($event->data->object->id), 400);
        if (DB::table('stripe_webhook_events')->where('id', $event->id)->exists()) {
            return response('OK');
        }
        DB::transaction(function () use ($event): void {
            $user = User::where('stripe_id', $event->data->object->customer)->lockForUpdate()->first();
            if (! $user || DB::table('stripe_webhook_events')->where('id', $event->id)->exists()) {
                return;
            }
            // Reconcile with Stripe so delayed events cannot restore an older subscription state.
            $remote = Cashier::stripe()->subscriptions->retrieve($event->data->object->id);
            abort_unless($remote->customer === $user->stripe_id, 400);
            $items = $remote->items->data;
            $endsAt = $remote->cancel_at;
            if ($remote->status === 'canceled') {
                $endsAt = $remote->ended_at ?? $remote->canceled_at ?? time();
            } elseif ($remote->cancel_at_period_end && ! $endsAt) {
                $endsAt = max(array_map(fn ($item) => $item->current_period_end, $items));
            }
            $subscription = $user->subscriptions()->updateOrCreate(['stripe_id' => $remote->id], [
                'type' => $remote->metadata->type ?? 'default',
                'stripe_status' => $remote->status,
                'stripe_price' => count($items) === 1 ? $items[0]->price->id : null,
                'quantity' => count($items) === 1 ? $items[0]->quantity : null,
                'trial_ends_at' => $remote->trial_end ? CarbonImmutable::createFromTimestamp($remote->trial_end) : null,
                'ends_at' => $endsAt ? CarbonImmutable::createFromTimestamp($endsAt) : null,
            ]);
            foreach ($items as $item) {
                $subscription->items()->updateOrCreate(['stripe_id' => $item->id], [
                    'stripe_product' => $item->price->product,
                    'stripe_price' => $item->price->id,
                    'quantity' => $item->quantity,
                ]);
            }
            $subscription->items()->whereNotIn('stripe_id', array_map(fn ($item) => $item->id, $items))->delete();
            DB::table('stripe_webhook_events')->insert(['id' => $event->id, 'type' => $event->type, 'processed_at' => now()]);
        });

        return response('OK');
    }
}
