<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class RoadmapNode extends Model {
    public $timestamps=false;
    protected $fillable=['roadmap_id','activity_id','x','y'];
    protected function casts(): array { return ['x'=>'float','y'=>'float']; }
}
