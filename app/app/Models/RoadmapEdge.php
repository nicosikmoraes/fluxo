<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class RoadmapEdge extends Model {
    public $timestamps=false;
    protected $fillable=['roadmap_id','source_node_id','target_node_id'];
}
