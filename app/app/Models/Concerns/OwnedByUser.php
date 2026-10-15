<?php

namespace App\Models\Concerns;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use LogicException;

trait OwnedByUser
{
    protected static function bootOwnedByUser(): void
    {
        static::addGlobalScope('owner', function (Builder $query): void {
            $query->where($query->getModel()->qualifyColumn('user_id'), Auth::id() ?? 0);
        });
        static::creating(function (Model $model): void {
            if (Auth::id() === null) {
                throw new LogicException('Um usuário autenticado é necessário para criar dados do espaço.');
            }
            $model->user_id = Auth::id();
        });
    }
}
