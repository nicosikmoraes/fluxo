<?php

namespace App\Models;

use App\Models\Concerns\OwnedByUser;
use Database\Factories\WorkDayFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkDay extends Model
{
    /** @use HasFactory<WorkDayFactory> */
    use HasFactory;

    use OwnedByUser;

    public const STEPS = [
        'startedAt' => 'started_at',
        'lunchOut' => 'lunch_out_at',
        'lunchIn' => 'lunch_in_at',
        'finishedAt' => 'finished_at',
    ];

    protected $fillable = ['work_date', 'timezone', 'started_at', 'lunch_out_at', 'lunch_in_at', 'finished_at', 'regime', 'version'];

    protected $hidden = ['regime', 'overtime_receipt'];

    protected function casts(): array
    {
        return [
            'work_date' => 'date:Y-m-d',
            'started_at' => 'immutable_datetime',
            'lunch_out_at' => 'immutable_datetime',
            'lunch_in_at' => 'immutable_datetime',
            'finished_at' => 'immutable_datetime',
            'regime' => 'encrypted:array',
            'version' => 'integer',
            'overtime_receipt' => 'encrypted:array',
            'receipt_version' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function workHoursData(): array
    {
        $entries = [];
        $instants = [];
        foreach (self::STEPS as $step => $column) {
            $instant = $this->$column;
            $entries[$step] = $instant?->setTimezone($this->timezone)->format('H:i') ?? '';
            $instants[$step] = $instant?->toIso8601String();
        }

        return [
            'date' => $this->work_date->toDateString(),
            'timezone' => $this->timezone,
            'entries' => $entries,
            'instants' => $instants,
            'version' => $this->version,
            'regime' => $this->regime ?? self::defaultSettings($this->timezone),
            'receipt' => [
                'amount' => $this->overtime_receipt === null ? null : $this->overtime_receipt['amount_cents'] / 100,
                'received_on' => $this->overtime_receipt['received_on'] ?? null,
                'version' => $this->receipt_version ?? 0,
            ],
        ];
    }

    public function completedOvertimeSeconds(): float
    {
        if (! $this->started_at || ! $this->lunch_out_at || ! $this->lunch_in_at || ! $this->finished_at) {
            return 0;
        }
        $regime = $this->regime ?? self::defaultSettings($this->timezone);
        $worked = $this->started_at->diffInSeconds($this->lunch_out_at)
            + $this->lunch_in_at->diffInSeconds($this->finished_at);

        return max(0, $worked - $regime['weeklyHours'] * 3600 / $regime['daysPerWeek']);
    }

    public static function defaultSettings(string $timezone = 'UTC'): array
    {
        return [
            'enabled' => false,
            'weeklyHours' => 44,
            'daysPerWeek' => 5,
            'monthlySalary' => null,
            'monthlyHours' => 220,
            'overtimePremium' => 50,
            'timezone' => $timezone,
        ];
    }
}
