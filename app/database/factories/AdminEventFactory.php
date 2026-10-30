<?php

namespace Database\Factories;

use App\Models\AdminEvent;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<AdminEvent> */
class AdminEventFactory extends Factory
{
    public function definition(): array
    {
        return ['actor_id' => User::factory(), 'target_id' => User::factory(), 'actor_name' => 'Administrador', 'target_name' => 'Usuário', 'action' => 'grant.created', 'detail' => 'Cortesia concedida para teste.', 'metadata' => []];
    }
}
