<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\User;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Laravel\Cashier\Cashier;
use Stripe\Exception\ApiErrorException;
use Stripe\Price;

class BillingController extends Controller
{
    private function ready(): bool
    {
        return (bool) (config('billing.enabled') && config('billing.pro_price_id') && config('cashier.secret') && config('cashier.webhook.secret'));
    }

    private function matchesConfiguredPrice(Price $price): bool
    {
        $currency = config('billing.currency');
        $amounts = config('billing.amounts');
        $options = $price->currency_options;
        $options = is_array($options) ? $options : ($options?->toArray() ?? []);

        if (! $price->active || $price->currency !== $currency || $price->unit_amount !== $amounts[$currency]
            || $price->recurring?->interval !== config('billing.interval') || $price->recurring?->interval_count !== 1
            || count($options) !== count($amounts)) {
            return false;
        }

        foreach ($amounts as $currency => $amount) {
            if (($options[$currency]['unit_amount'] ?? null) !== $amount) {
                return false;
            }
        }

        return true;
    }

    private function matchesCheckoutPricing(?array $payload): bool
    {
        return ($payload['line_items'][0]['price'] ?? null) === config('billing.pro_price_id')
            && ($payload['adaptive_pricing']['enabled'] ?? null) === false
            && ! array_key_exists('currency', $payload ?? []);
    }

    private function clearCheckout(User $user): void
    {
        $user->forceFill([
            'stripe_checkout_id' => null,
            'stripe_checkout_url' => null,
            'stripe_checkout_expires_at' => null,
            'stripe_checkout_attempt' => null,
            'stripe_checkout_payload' => null,
        ])->save();
    }

    public function index(Request $request): JsonResponse
    {
        $user = $request->user()->fresh();
        $subscription = $user->subscriptions()->where('type', 'default')->latest('id')->first();

        return response()->json([
            ...$user->billingAccess(),
            'checkout_available' => $this->ready(),
            'portal_available' => (bool) (config('billing.enabled') && config('cashier.secret') && $user->stripe_id),
            'price' => [
                'amount' => config('billing.amounts.'.config('billing.currency')),
                'currency' => config('billing.currency'),
                'interval' => config('billing.interval'),
                'amounts' => config('billing.amounts'),
            ],
            'usage' => ['projects' => Project::count()],
            'subscription' => $subscription ? ['status' => $subscription->stripe_status, 'ends_at' => $subscription->ends_at?->toIso8601String()] : null,
        ]);
    }

    public function checkout(Request $request): JsonResponse
    {
        abort_unless($this->ready(), 503, __('As assinaturas ainda não estão disponíveis. Tente novamente em breve.'));
        try {
            return Cache::lock('billing:checkout:'.$request->user()->id, 300)->block(3, function () use ($request): JsonResponse {
                $user = $request->user()->fresh();
                abort_if($user->hasPro(), 409, __('Você já tem uma assinatura. Use o portal para gerenciar seu plano.'));
                abort_if($user->subscriptions()->where('type', 'default')->whereIn('stripe_status', ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'])->exists(), 409, __('Use o portal de cobrança para atualizar sua assinatura existente.'));
                if ($user->stripe_checkout_id) {
                    $session = Cashier::stripe()->checkout->sessions->retrieve($user->stripe_checkout_id);
                    $ended = $user->subscriptions()->where('type', 'default')->whereIn('stripe_status', ['canceled', 'incomplete_expired'])->exists();
                    abort_if($session->status === 'complete' && ! $ended, 409, __('Seu pagamento está sendo confirmado. Atualize o plano em instantes.'));
                    if ($session->status === 'open' && $session->expires_at > time()) {
                        if ($this->matchesCheckoutPricing($user->stripe_checkout_payload)) {
                            return response()->json(['url' => $session->url]);
                        }
                        Cashier::stripe()->checkout->sessions->expire($session->id);
                    }
                    $this->clearCheckout($user);
                } elseif ($user->stripe_checkout_payload && ! $this->matchesCheckoutPricing($user->stripe_checkout_payload)) {
                    $this->clearCheckout($user);
                }
                $price = Cashier::stripe()->prices->retrieve(config('billing.pro_price_id'), ['expand' => ['currency_options']]);
                abort_unless($this->matchesConfiguredPrice($price), 503, __('O preço da assinatura precisa ser configurado. Tente novamente em breve.'));
                if (! $user->stripe_checkout_attempt) {
                    $user->forceFill(['stripe_checkout_attempt' => (string) Str::uuid()])->save();
                }
                $customer = $user->createOrGetStripeCustomer([], ['idempotency_key' => 'fluxo-customer-'.$user->id.'-'.hash('sha256', $user->created_at->toIso8601String())]);
                $home = rtrim(config('app.url'), '/').'/?view=billing';
                $payload = $user->stripe_checkout_payload ?? [
                    'mode' => 'subscription',
                    'customer' => $customer->id,
                    'line_items' => [['price' => $price->id, 'quantity' => 1]],
                    'subscription_data' => ['metadata' => ['type' => 'default']],
                    'client_reference_id' => (string) $user->id,
                    'locale' => $user->locale === 'en-US' ? 'en' : 'pt-BR',
                    'adaptive_pricing' => ['enabled' => false],
                    'success_url' => $home.'&checkout=success',
                    'cancel_url' => $home.'&checkout=cancelled',
                    'expires_at' => now()->addMinutes(31)->timestamp,
                ];
                $user->forceFill(['stripe_checkout_payload' => $payload])->save();
                $session = Cashier::stripe()->checkout->sessions->create($payload, ['idempotency_key' => 'fluxo-checkout-'.$user->stripe_checkout_attempt]);
                $user->forceFill([
                    'stripe_checkout_id' => $session->id,
                    'stripe_checkout_url' => $session->url,
                    'stripe_checkout_expires_at' => $session->expires_at,
                ])->save();

                return response()->json(['url' => $session->url]);
            });
        } catch (LockTimeoutException) {
            abort(409, __('Já existe uma solicitação de assinatura em andamento. Aguarde um instante.'));
        } catch (ApiErrorException $exception) {
            report($exception);
            abort(503, __('Não foi possível abrir a cobrança. Tente novamente.'));
        }
    }

    public function portal(Request $request): JsonResponse
    {
        abort_unless(config('billing.enabled') && config('cashier.secret'), 503, __('As assinaturas ainda não estão disponíveis. Tente novamente em breve.'));
        abort_unless($request->user()->stripe_id, 409, __('Você ainda não tem uma conta de cobrança. Conheça o Fluxo Pro.'));
        try {
            return response()->json(['url' => $request->user()->billingPortalUrl(rtrim(config('app.url'), '/').'/?view=billing')]);
        } catch (ApiErrorException $exception) {
            report($exception);
            abort(503, __('Não foi possível abrir a cobrança. Tente novamente.'));
        }
    }
}
