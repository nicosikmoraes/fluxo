<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AdminSetting extends Model
{
    use HasFactory;

    protected $fillable = ['values', 'version'];

    protected function casts(): array
    {
        return ['values' => 'array', 'version' => 'integer'];
    }

    public static function preferences(): array
    {
        return static::findOrFail(1)->values;
    }

    public static function publicPreferences(): array
    {
        $values = static::preferences();

        return ['name' => $values['name'], 'email' => $values['email'], 'registration_enabled' => $values['newAccounts'], 'maintenance' => $values['maintenance']];
    }
}
