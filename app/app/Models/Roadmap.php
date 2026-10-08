<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
class Roadmap extends Model {
    protected $fillable=['project_id','title'];
    public function nodes(): HasMany { return $this->hasMany(RoadmapNode::class)->orderBy('id'); }
    public function edges(): HasMany { return $this->hasMany(RoadmapEdge::class)->orderBy('id'); }
}
