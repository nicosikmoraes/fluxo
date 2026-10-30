<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_settings', function (Blueprint $table): void {
            $table->id();
            $table->json('values');
            $table->unsignedInteger('version')->default(0);
            $table->timestamps();
        });
        DB::table('admin_settings')->insert(['id' => 1, 'values' => json_encode(['name' => 'Fluxo', 'email' => null, 'defaultGrant' => '30', 'newAccounts' => true, 'maintenance' => false]), 'version' => 0, 'created_at' => now(), 'updated_at' => now()]);
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_settings');
    }
};
