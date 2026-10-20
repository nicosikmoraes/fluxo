<?php

namespace App\Models;

use Database\Factories\WhiteboardFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['name', 'elements', 'version'])]
class Whiteboard extends Model
{
    /** @use HasFactory<WhiteboardFactory> */
    use HasFactory;

    protected function casts(): array
    {
        return [
            'elements' => 'array',
            'version' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
