<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Auth\MustVerifyEmail as MustVerifyEmailTrait;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Contracts\Translation\HasLocalePreference;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Cashier\Billable;
use Laravel\Cashier\Subscription;

#[Fillable(['name', 'email', 'password', 'locale'])]
#[Hidden(['password', 'remember_token', 'work_settings', 'work_settings_version', 'whiteboard', 'whiteboard_version', 'stripe_id', 'pm_type', 'pm_last_four', 'trial_ends_at', 'stripe_checkout_id', 'stripe_checkout_url', 'stripe_checkout_expires_at', 'stripe_checkout_attempt', 'stripe_checkout_payload', 'is_admin', 'disabled_at', 'pro_granted_at', 'pro_expires_at', 'pro_revoked_at', 'pro_granted_by', 'pro_reason', 'admin_version'])]
class User extends Authenticatable implements HasLocalePreference, MustVerifyEmail
{
    /** @use HasFactory<UserFactory> */
    use Billable, HasFactory, MustVerifyEmailTrait, Notifiable;

    protected $attributes = ['is_admin' => false, 'admin_version' => 0];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_admin' => 'boolean', 'disabled_at' => 'datetime', 'pro_granted_at' => 'datetime', 'pro_expires_at' => 'datetime', 'pro_revoked_at' => 'datetime', 'admin_version' => 'integer',
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'work_settings' => 'encrypted:array',
            'work_settings_version' => 'integer',
            'whiteboard' => 'array',
            'whiteboard_version' => 'integer',
            'trial_ends_at' => 'datetime',
            'stripe_checkout_expires_at' => 'datetime',
            'stripe_checkout_payload' => 'array',
        ];
    }

    public function preferredLocale(): string
    {
        return $this->locale === 'en-US' ? 'en' : 'pt_BR';
    }

    public function paidSubscriptions(): HasMany
    {
        return $this->subscriptions()->where('type', 'default')
            ->where('stripe_price', config('billing.pro_price_id') ?: '__unconfigured__')
            ->where('stripe_status', 'active')
            ->where(fn (Builder $query) => $query->whereNull('ends_at')->orWhere('ends_at', '>', now()));
    }

    public function ongoingSubscriptions(): HasMany
    {
        return $this->subscriptions()->where('type', 'default')
            ->whereIn('stripe_status', ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']);
    }

    public function adminSubscription(): HasOne
    {
        return $this->hasOne(Subscription::class)->ofMany(['id' => 'max'], fn (Builder $query) => $query->where('type', 'default'));
    }

    #[Scope]
    protected function manualPro(Builder $query): void
    {
        $query->whereNotNull('pro_granted_at')->whereNull('pro_revoked_at')
            ->where(fn (Builder $query) => $query->whereNull('pro_expires_at')->orWhere('pro_expires_at', '>', now()));
    }

    public function hasPaidPro(): bool
    {
        return array_key_exists('paid_pro', $this->getAttributes()) ? (bool) $this->paid_pro : $this->paidSubscriptions()->exists();
    }

    public function hasManualPro(): bool
    {
        return $this->pro_granted_at !== null && $this->pro_revoked_at === null
            && ($this->pro_expires_at === null || $this->pro_expires_at->isFuture());
    }

    public function hasPro(): bool
    {
        return $this->disabled_at === null && ($this->hasManualPro() || $this->hasPaidPro());
    }

    public function hasOngoingBilling(): bool
    {
        $ongoing = array_key_exists('ongoing_billing', $this->getAttributes()) ? (bool) $this->ongoing_billing : $this->ongoingSubscriptions()->exists();
        $checkout = $this->stripe_checkout_id && (! $this->stripe_checkout_expires_at || $this->stripe_checkout_expires_at->isFuture());
        $attempt = $this->stripe_checkout_payload && ($this->stripe_checkout_payload['expires_at'] ?? 0) > now()->timestamp;

        return $ongoing || $checkout || $attempt;
    }

    public function adminStatus(): string
    {
        if ($this->hasPaidPro()) {
            return 'active';
        }
        if ($this->hasManualPro()) {
            return 'manual';
        }
        $subscription = $this->adminSubscription;
        if ($subscription) {
            if ($subscription->ends_at && $subscription->ends_at->isPast()) {
                return 'canceled';
            }

            return $subscription->stripe_status === 'active' ? 'other' : $subscription->stripe_status;
        }
        if ($this->pro_granted_at) {
            return $this->pro_revoked_at ? 'canceled' : 'expired';
        }

        return 'free';
    }

    public function administrationData(): array
    {
        $status = $this->adminStatus();
        $subscription = $this->adminSubscription;

        return [
            'id' => $this->id, 'name' => $this->name, 'email' => $this->email,
            'status' => $status, 'joined' => $this->created_at?->toIso8601String(),
            'expires' => ($status === 'manual' || ! $subscription) ? $this->pro_expires_at?->toIso8601String() : $subscription?->ends_at?->toIso8601String(),
            'disabled' => $this->disabled_at !== null, 'is_admin' => $this->is_admin,
            'version' => $this->admin_version, 'reason' => $this->pro_reason,
            'source' => $status === 'manual' ? 'manual' : ($subscription ? 'stripe' : ($this->pro_granted_at ? 'manual' : null)),
            'can_grant' => ! $this->disabled_at && ! $this->hasOngoingBilling(),
            'courtesy_active' => $this->hasManualPro(), 'courtesy_expires' => $this->pro_expires_at?->toIso8601String(),
            'stripe_status' => $subscription?->stripe_status,
            'subscription_id' => $subscription?->stripe_id,
        ];
    }

    public function billingAccess(): array
    {
        $paid = $this->hasPaidPro();
        $pro = ! $this->disabled_at && ($paid || $this->hasManualPro());

        return [
            'plan' => $pro ? 'pro' : 'free',
            'access_source' => $pro ? ($paid ? 'stripe' : 'manual') : null,
            'courtesy_expires_at' => $pro && ! $paid ? $this->pro_expires_at?->toIso8601String() : null,
            'entitlements' => [
                'projects' => $pro ? null : config('billing.free_projects'),
                'roadmaps_per_project' => $pro ? null : config('billing.free_roadmaps_per_project'),
                'work_tracking' => $pro,
                'pay_calculation' => $pro,
                'ad_free' => $pro,
                'show_ads' => ! $pro && config('billing.ads_enabled'),
            ],
        ];
    }

    public function visibleWorkSettings(array $settings): array
    {
        return $this->hasPro() ? $settings : array_replace($settings, ['monthlySalary' => null, 'hourlyRate' => null]);
    }

    public function workDays(): HasMany
    {
        return $this->hasMany(WorkDay::class);
    }

    public function whiteboards(): HasMany
    {
        return $this->hasMany(Whiteboard::class);
    }
}
