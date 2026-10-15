<?php

namespace App\Models;

use App\Models\Concerns\OwnedByUser;
use Illuminate\Database\Eloquent\Model;

class Comment extends Model
{
    use OwnedByUser;

    protected $fillable = ['activity_id', 'body'];
}
