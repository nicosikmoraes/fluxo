<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\WorkDay;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Auth;
use LogicException;

class WorkDaySeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        if (! app()->environment('testing')) {
            throw new LogicException('Os dados de demonstração da jornada só podem ser criados no ambiente de testes.');
        }
        $settings = array_replace(WorkDay::defaultSettings('America/Sao_Paulo'), ['enabled' => true, 'monthlySalary' => 4400]);
        $user = User::factory()->create([
            'name' => 'Revisão da jornada',
            'email' => 'jornada-preview@example.test',
            'password' => 'FluxoPreview-2026-local',
        ]);
        $user->forceFill(['work_settings' => $settings, 'work_settings_version' => 1])->save();
        Auth::setUser($user);
        try {
            $startedAt = now()->subHours(10)->startOfMinute();
            WorkDay::factory()->for($user)->create([
                'work_date' => $startedAt->copy()->setTimezone($settings['timezone'])->toDateString(),
                'timezone' => $settings['timezone'],
                'started_at' => $startedAt,
                'lunch_out_at' => now()->subHours(6)->startOfMinute(),
                'lunch_in_at' => now()->subHours(5)->startOfMinute(),
                'regime' => $settings,
            ]);
        } finally {
            Auth::forgetUser();
        }
    }
}
