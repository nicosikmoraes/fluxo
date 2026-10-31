<?php

namespace Database\Factories;

use App\Models\AdminSetting;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<AdminSetting> */
class AdminSettingFactory extends Factory
{
    public function definition(): array
    {
        return ['values' => ['name' => 'Tempozi', 'email' => null, 'defaultGrant' => '30', 'newAccounts' => true, 'maintenance' => false], 'version' => 0];
    }
}
