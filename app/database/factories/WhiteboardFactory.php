<?php

namespace Database\Factories;

use App\Models\User;
use App\Models\Whiteboard;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Whiteboard> */
class WhiteboardFactory extends Factory
{
    protected $model = Whiteboard::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'name' => fake()->words(2, true),
            'elements' => [],
            'version' => 0,
        ];
    }
}
