<?php

namespace App\Models;

use App\Models\Concerns\OwnedByUser;
use Illuminate\Database\Eloquent\Model;

class RoadmapEdge extends Model
{
    use OwnedByUser;

    public $timestamps = false;

    protected $fillable = ['roadmap_id', 'source_node_id', 'target_node_id'];
}
