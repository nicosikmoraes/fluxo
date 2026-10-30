<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AdminEvent extends Model
{
    use HasFactory;

    protected $fillable = ['actor_id', 'target_id', 'actor_name', 'target_name', 'action', 'detail', 'metadata'];

    protected function casts(): array
    {
        return ['metadata' => 'array'];
    }

    public static function record(?User $actor, ?User $target, string $action, string $detail, array $metadata = []): self
    {
        return static::create(['actor_id' => $actor?->id, 'target_id' => $target?->id, 'actor_name' => $actor?->name ?? 'Console', 'target_name' => $target?->name, 'action' => $action, 'detail' => $detail, 'metadata' => $metadata]);
    }
}
