<?php

namespace App\Models;

use App\Models\Concerns\OwnedByUser;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Project extends Model
{
    use OwnedByUser;

    protected $fillable = ['title', 'cover', 'cover_path'];

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }
}
