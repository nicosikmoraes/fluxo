<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Contracts\Translation\HasLocalePreference;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Cashier\Billable;

#[Fillable(['name', 'email', 'password', 'locale'])]
#[Hidden(['password', 'remember_token', 'work_settings', 'work_settings_version', 'whiteboard', 'whiteboard_version', 'stripe_id', 'pm_type', 'pm_last_four', 'trial_ends_at', 'stripe_checkout_id', 'stripe_checkout_url', 'stripe_checkout_expires_at', 'stripe_checkout_attempt', 'stripe_checkout_payload'])]
class User extends Authenticatable implements HasLocalePreference
{
    /** @use HasFactory<UserFactory> */
    use Billable, HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
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

    public function hasPro(): bool
    {
        $price = config('billing.pro_price_id');

        return is_string($price) && $price !== '' && $this->subscriptions()
            ->where('type', 'default')->where('stripe_price', $price)->where('stripe_status', 'active')
            ->where(fn ($query) => $query->whereNull('ends_at')->orWhere('ends_at', '>', now()))->exists();
    }

    public function billingAccess(): array
    {
        $pro = $this->hasPro();

        return [
            'plan' => $pro ? 'pro' : 'free',
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
