<?php

namespace App\Models;

use App\Models\Concerns\OwnedByUser;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DailyRoutine extends Model
{
    use HasFactory;
    use OwnedByUser;

    protected $fillable = ['title', 'project_id', 'priority', 'starts_on', 'ends_on'];

    protected function casts(): array
    {
        return ['priority' => 'boolean', 'starts_on' => 'date:Y-m-d', 'ends_on' => 'date:Y-m-d'];
    }
}
