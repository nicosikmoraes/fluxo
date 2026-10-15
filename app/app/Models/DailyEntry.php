<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DailyEntry extends Model
{
    use HasFactory;

    protected $fillable = ['planned_for', 'activity_id', 'project_id', 'daily_routine_id', 'title', 'priority', 'focused', 'completed_at', 'removed_at', 'moved_to'];

    protected function casts(): array
    {
        return ['planned_for' => 'date:Y-m-d', 'priority' => 'boolean', 'focused' => 'boolean', 'completed_at' => 'datetime', 'removed_at' => 'datetime', 'moved_to' => 'date:Y-m-d'];
    }

    public function activity(): BelongsTo
    {
        return $this->belongsTo(Activity::class);
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function routine(): BelongsTo
    {
        return $this->belongsTo(DailyRoutine::class, 'daily_routine_id');
    }

    public function isCompleted(): bool
    {
        return $this->activity_id ? $this->activity?->status === 'done' : $this->completed_at !== null;
    }
}
