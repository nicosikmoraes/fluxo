<?php

namespace App\Models;

use App\Models\Concerns\OwnedByUser;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Roadmap extends Model
{
    use OwnedByUser;

    protected $fillable = ['project_id', 'title', 'card_type'];

    protected function casts(): array
    {
        return ['portals' => 'array', 'portals_version' => 'integer'];
    }

    public function nodes(): HasMany
    {
        return $this->hasMany(RoadmapNode::class)->orderBy('id');
    }

    public function edges(): HasMany
    {
        return $this->hasMany(RoadmapEdge::class)->orderBy('id');
    }
}
