<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class Activity extends Model {
    protected $fillable=['title','status','blocked','blocking_person','blocking_reason','blocked_at','task_id','position','roadmap_position'];
    public function task(): BelongsTo { return $this->belongsTo(Task::class); }
    protected function casts(): array { return ['blocked'=>'boolean','blocked_at'=>'datetime']; }
    public function comments(): HasMany { return $this->hasMany(Comment::class)->orderBy('created_at')->orderBy('id'); }
}
