<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $this->renameDefaultProductName('Fluxo', 'Tempozi');
    }

    public function down(): void
    {
        $this->renameDefaultProductName('Tempozi', 'Fluxo');
    }

    private function renameDefaultProductName(string $from, string $to): void
    {
        $setting = DB::table('admin_settings')->where('id', 1)->first(['values']);

        if ($setting === null) {
            return;
        }

        $values = json_decode($setting->values, true);

        if (! is_array($values) || ($values['name'] ?? null) !== $from) {
            return;
        }

        $values['name'] = $to;

        DB::table('admin_settings')
            ->where('id', 1)
            ->update(['values' => json_encode($values, JSON_THROW_ON_ERROR), 'updated_at' => now()]);
    }
};
