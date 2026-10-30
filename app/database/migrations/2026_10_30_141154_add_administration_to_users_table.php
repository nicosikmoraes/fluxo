<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->boolean('is_admin')->default(false);
            $table->timestamp('disabled_at')->nullable();
            $table->timestamp('pro_granted_at')->nullable();
            $table->timestamp('pro_expires_at')->nullable();
            $table->timestamp('pro_revoked_at')->nullable();
            $table->foreignId('pro_granted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('pro_reason', 300)->nullable();
            $table->unsignedInteger('admin_version')->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('pro_granted_by');
            $table->dropColumn(['is_admin', 'disabled_at', 'pro_granted_at', 'pro_expires_at', 'pro_revoked_at', 'pro_reason', 'admin_version']);
        });
    }
};
