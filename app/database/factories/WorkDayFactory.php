<?php

namespace Database\Factories;

use App\Models\WorkDay;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WorkDay>
 */
class WorkDayFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'work_date' => now()->toDateString(),
            'timezone' => 'UTC',
            'regime' => WorkDay::defaultSettings(),
            'version' => 1,
        ];
    }
}
