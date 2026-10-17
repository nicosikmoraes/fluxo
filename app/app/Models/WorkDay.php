<?php

namespace App\Models;

use App\Models\Concerns\OwnedByUser;
use Carbon\CarbonImmutable;
use Database\Factories\WorkDayFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Collection;

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

    protected $fillable = ['work_date', 'timezone', 'started_at', 'lunch_out_at', 'lunch_in_at', 'finished_at', 'regime', 'version', 'additional_breaks'];

    protected $hidden = ['regime', 'overtime_receipt', 'additional_breaks'];

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
            'additional_breaks' => 'encrypted:array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function workHoursData(array $overtimeContext = []): array
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
            'breaks' => array_map(fn (array $pause): array => [
                'startedAt' => $pause['started_at']->toIso8601String(),
                'finishedAt' => $pause['finished_at']?->toIso8601String(),
                'startTime' => $pause['started_at']->setTimezone($this->timezone)->format('H:i'),
                'endTime' => $pause['finished_at']?->setTimezone($this->timezone)->format('H:i') ?? '',
            ], $this->breakIntervals()),
            'overtime_context' => $overtimeContext,
            'receipt' => [
                'amount' => $this->overtime_receipt === null ? null : $this->overtime_receipt['amount_cents'] / 100,
                'received_on' => $this->overtime_receipt['received_on'] ?? null,
                'version' => $this->receipt_version ?? 0,
            ],
        ];
    }

    public function completedOvertimeSeconds(): float
    {
        if (! $this->started_at || ! $this->finished_at) {
            return 0;
        }

        return $this->overtimeSeconds(CarbonImmutable::now());
    }

    public function breakIntervals(): array
    {
        $pauses = [];
        if ($this->lunch_out_at) {
            $pauses[] = ['started_at' => $this->lunch_out_at, 'finished_at' => $this->lunch_in_at];
        }
        foreach ($this->additional_breaks ?? [] as $pause) {
            $pauses[] = [
                'started_at' => CarbonImmutable::parse($pause['started_at']),
                'finished_at' => empty($pause['finished_at']) ? null : CarbonImmutable::parse($pause['finished_at']),
            ];
        }

        return $pauses;
    }

    public function workedSeconds(CarbonImmutable $now): float
    {
        if (! $this->started_at) {
            return 0;
        }
        $live = ! $this->finished_at && $this->started_at->greaterThan($now->subDay());
        $cursor = $this->started_at;
        $worked = 0;
        foreach ($this->breakIntervals() as $pause) {
            $worked += max(0, $cursor->diffInSeconds($pause['started_at']));
            if (! $pause['finished_at']) {
                return $worked;
            }
            $cursor = $pause['finished_at'];
        }
        $end = $this->finished_at ?? ($live ? $now : null);

        return $worked + ($end ? max(0, $cursor->diffInSeconds($end)) : 0);
    }

    public function overtimeSeconds(CarbonImmutable $now): float
    {
        $regime = $this->regime ?? self::defaultSettings($this->timezone);
        $weekend = in_array($this->work_date->dayOfWeek, [0, 6], true);
        $target = $weekend ? 0 : $regime['weeklyHours'] * 3600 / $regime['daysPerWeek'];

        return max(0, $this->workedSeconds($now) - $target);
    }

    public static function payrollCycle(string $date, int $closingDay): array
    {
        $calendar = CarbonImmutable::createFromFormat('!Y-m-d', $date, 'UTC');
        $month = $calendar->startOfMonth();
        $end = $month->day(min($closingDay, $month->daysInMonth));
        if ($calendar->greaterThan($end)) {
            $month = $month->addMonthNoOverflow();
            $end = $month->day(min($closingDay, $month->daysInMonth));
        }
        $previous = $month->subMonthNoOverflow();
        $start = $previous->day(min($closingDay, $previous->daysInMonth))->addDay();

        return ['start' => $start->toDateString(), 'end' => $end->toDateString()];
    }

    public static function withOvertimeData(Collection $days, array $settings, CarbonImmutable $now): array
    {
        if ($days->isEmpty()) {
            return [];
        }
        $closingDay = (int) ($settings['cycleClosingDay'] ?? 31);
        $cycles = $days->map(fn (self $day): array => self::payrollCycle($day->work_date->toDateString(), $closingDay))->unique('start')->values();
        $cycleDays = self::where(function (Builder $query) use ($cycles): void {
            foreach ($cycles as $cycle) {
                $query->orWhereBetween('work_date', [$cycle['start'], $cycle['end']]);
            }
        })->whereNotNull('started_at')->orderBy('work_date')->get();
        $totals = [];
        $contexts = [];
        foreach ($cycleDays as $day) {
            $date = $day->work_date->toDateString();
            $cycle = self::payrollCycle($date, $closingDay);
            $contexts[$date] = [
                ...$cycle,
                'previous_seconds' => $totals[$cycle['start']] ?? 0,
                'threshold_seconds' => 20 * 3600,
                'tier_premium' => 75,
                'sunday_premium' => 100,
            ];
            $totals[$cycle['start']] = ($totals[$cycle['start']] ?? 0) + $day->overtimeSeconds($now);
        }

        return $days->mapWithKeys(function (self $day) use ($contexts, $cycleDays, $closingDay, $now): array {
            $date = $day->work_date->toDateString();
            $cycle = self::payrollCycle($date, $closingDay);
            $context = $contexts[$date] ?? [
                ...$cycle,
                'previous_seconds' => $cycleDays->filter(fn (self $candidate): bool => $candidate->work_date->toDateString() >= $cycle['start'] && $candidate->work_date->toDateString() < $date)->sum(fn (self $candidate): float => $candidate->overtimeSeconds($now)),
                'threshold_seconds' => 20 * 3600,
                'tier_premium' => 75,
                'sunday_premium' => 100,
            ];

            return [$date => $day->workHoursData($context)];
        })->all();
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
            'cycleClosingDay' => 31,
            'timezone' => $timezone,
        ];
    }
}
