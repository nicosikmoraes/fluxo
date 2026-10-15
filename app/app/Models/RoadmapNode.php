<?php

namespace App\Models;

use App\Models\Concerns\OwnedByUser;
use Illuminate\Database\Eloquent\Model;

class RoadmapNode extends Model
{
    use OwnedByUser;

    public $timestamps = false;

    protected $fillable = ['roadmap_id', 'activity_id', 'task_id', 'x', 'y'];

    protected function casts(): array
    {
        return ['x' => 'float', 'y' => 'float'];
    }
}
