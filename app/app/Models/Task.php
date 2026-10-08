<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
class Task extends Model {
    protected $fillable=['title','description','project_id','position','cover_path'];
    protected $appends=['status','completed_count','blocked_count','comments_count'];
    public function activities(): HasMany { return $this->hasMany(Activity::class)->orderBy('position')->orderBy('id'); }
    public function getStatusAttribute(): string {
        if($this->activities->isEmpty() || $this->activities->every(fn($a)=>$a->status==='pending')) return 'pending';
        return $this->activities->every(fn($a)=>$a->status==='done') ? 'done' : 'doing';
    }
    public function getCompletedCountAttribute(): int { return $this->activities->where('status','done')->count(); }
    public function getBlockedCountAttribute(): int { return $this->activities->where('blocked',true)->count(); }
    public function getCommentsCountAttribute(): int { return $this->activities->sum(fn($a)=>$a->comments->count()); }
}
