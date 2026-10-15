<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

class DailyEntryFactory extends Factory
{
    public function definition(): array
    {
        return ['title' => fake()->sentence(3), 'planned_for' => '2026-10-15', 'priority' => false, 'focused' => false];
    }
}
