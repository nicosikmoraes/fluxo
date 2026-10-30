<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('stripe_checkout_id')->nullable();
            $table->text('stripe_checkout_url')->nullable();
            $table->timestamp('stripe_checkout_expires_at')->nullable();
            $table->uuid('stripe_checkout_attempt')->nullable();
            $table->json('stripe_checkout_payload')->nullable();
        });
        Schema::create('stripe_webhook_events', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('type');
            $table->timestamp('processed_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('stripe_webhook_events');
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn(['stripe_checkout_id', 'stripe_checkout_url', 'stripe_checkout_expires_at', 'stripe_checkout_attempt', 'stripe_checkout_payload']));
    }
};
