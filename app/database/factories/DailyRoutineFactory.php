<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

class DailyRoutineFactory extends Factory
{
    public function definition(): array
    {
        return ['title' => fake()->sentence(3), 'starts_on' => '2026-10-15', 'priority' => false];
    }
}
