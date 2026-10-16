<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\WorkDay;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class WorkHoursController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'timezone' => ['sometimes', 'timezone'],
            'date' => ['sometimes', 'date_format:Y-m-d', 'after_or_equal:1900-01-01'],
        ]);

        return $this->responseData($request->user()->fresh(), $data['timezone'] ?? 'UTC', $data['date'] ?? null);
    }

    public function update(Request $request): JsonResponse
    {
        $rules = [
            'settings' => ['required', 'array:enabled,weeklyHours,daysPerWeek,monthlySalary,monthlyHours,overtimePremium,timezone'],
            'settings.enabled' => ['required', 'boolean'],
            'settings.weeklyHours' => ['required', 'numeric', 'min:0.01', 'max:168'],
            'settings.daysPerWeek' => ['required', 'integer', 'between:1,7'],
            'settings.monthlySalary' => ['present', 'nullable', 'numeric', 'min:0.01', 'max:999999999', 'decimal:0,2'],
            'settings.monthlyHours' => ['required', 'numeric', 'min:0.01', 'max:744'],
            'settings.overtimePremium' => ['required', 'numeric', 'between:0,1000'],
            'settings.timezone' => ['required', 'timezone'],
            'settings_version' => ['required', 'integer', 'min:0'],
            'date' => ['required', 'date_format:Y-m-d', 'after_or_equal:1900-01-01'],
            'entry_version' => ['required', 'integer', 'min:0'],
            'entries' => ['present', 'array:startedAt,lunchOut,lunchIn,finishedAt'],
        ];
        foreach (WorkDay::STEPS as $step => $column) {
            $rules['entries.'.$step] = ['present', 'nullable', 'date_format:H:i'];
        }
        $data = $request->validate($rules, [
            'settings.weeklyHours.min' => 'Informe uma jornada semanal maior que zero.',
            'settings.daysPerWeek.between' => 'Escolha de 1 a 7 dias por semana.',
            'settings.monthlySalary.min' => 'Informe um salário maior que zero ou deixe em branco.',
            'settings.monthlyHours.min' => 'Informe uma base mensal maior que zero.',
            'entries.*.date_format' => 'Confira os horários informados.',
        ]);
        if ($data['settings']['weeklyHours'] / $data['settings']['daysPerWeek'] > 24) {
            throw ValidationException::withMessages(['settings.weeklyHours' => 'A jornada diária não pode ultrapassar 24 horas.']);
        }
        $settings = $data['settings'];
        $settings['enabled'] = (bool) $settings['enabled'];
        $settings['weeklyHours'] = (float) $settings['weeklyHours'];
        $settings['daysPerWeek'] = (int) $settings['daysPerWeek'];
        $settings['monthlySalary'] = $settings['monthlySalary'] === null ? null : (float) $settings['monthlySalary'];
        $settings['monthlyHours'] = (float) $settings['monthlyHours'];
        $settings['overtimePremium'] = (float) $settings['overtimePremium'];
        $user = DB::transaction(function () use ($request, $data, $settings): User {
            $user = User::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            abort_if($user->work_settings_version !== (int) $data['settings_version'], 409, 'Suas configurações mudaram em outra aba. Atualize os dados antes de salvar.');
            $day = WorkDay::where('work_date', $data['date'])->lockForUpdate()->first();
            $this->checkVersion($day, (int) $data['entry_version']);
            $historical = $data['date'] < now($settings['timezone'])->toDateString();
            $timezone = $historical && $day ? $day->timezone : $settings['timezone'];
            $regime = $historical && $day ? $day->regime : $settings;
            $instants = $this->normalizeEntries($data['entries'], $data['date'], $timezone, $day);
            $user->forceFill(['work_settings' => $settings, 'work_settings_version' => $user->work_settings_version + 1])->save();
            if ($day || $instants['started_at'] !== null) {
                $day ??= new WorkDay(['work_date' => $data['date']]);
                $day->fill([
                    ...$instants,
                    'timezone' => $timezone,
                    'regime' => $regime,
                    'version' => ($day->version ?? 0) + 1,
                ])->save();
            }

            return $user;
        }, 5);

        return $this->responseData($user, $settings['timezone'], $data['date']);
    }

    public function record(Request $request): JsonResponse
    {
        $data = $request->validate([
            'step' => ['required', Rule::in(array_keys(WorkDay::STEPS))],
            'date' => ['required', 'date_format:Y-m-d', 'after_or_equal:1900-01-01'],
            'entry_version' => ['required', 'integer', 'min:0'],
        ]);

        $user = DB::transaction(function () use ($request, $data): User {
            $user = User::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            $settings = $user->work_settings ?? WorkDay::defaultSettings();
            if (! $settings['enabled']) {
                throw ValidationException::withMessages(['enabled' => 'Ative o acompanhamento da jornada nas configurações do perfil.']);
            }
            $day = WorkDay::where('work_date', $data['date'])->lockForUpdate()->first();
            $this->checkVersion($day, (int) $data['entry_version']);
            $timezone = $day?->timezone ?? $settings['timezone'];
            $today = now($timezone)->toDateString();
            if ($data['date'] !== $today && (! $day?->started_at || $day->finished_at || $day->started_at->lessThanOrEqualTo(now()->subDay()))) {
                throw ValidationException::withMessages(['date' => 'Escolha a jornada de hoje para registrar o horário atual.']);
            }
            $entries = $this->dayData($day, $data['date'], $settings)['entries'];
            if ($entries[$data['step']] !== '') {
                throw ValidationException::withMessages(['step' => 'Este horário já foi registrado. Edite-o nas configurações do perfil.']);
            }
            $entries[$data['step']] = now($timezone)->format('H:i');
            $instants = $this->normalizeEntries($entries, $data['date'], $timezone, $day, [WorkDay::STEPS[$data['step']] => CarbonImmutable::now()->utc()]);
            $day ??= new WorkDay(['work_date' => $data['date']]);
            $day->fill([
                ...$instants,
                'timezone' => $timezone,
                'regime' => $day->regime ?? $settings,
                'version' => ($day->version ?? 0) + 1,
            ])->save();

            return $user;
        }, 5);

        return $this->responseData($user, $user->work_settings['timezone'], $data['date']);
    }

    private function checkVersion(?WorkDay $day, int $expected): void
    {
        abort_if(($day?->version ?? 0) !== $expected, 409, 'Seus horários mudaram em outra aba. Atualize os dados antes de salvar.');
    }

    /** @return array<string, CarbonImmutable|null> */
    private function normalizeEntries(array $entries, string $date, string $timezone, ?WorkDay $day = null, array $recordedInstants = []): array
    {
        if ($date > now($timezone)->toDateString()) {
            throw ValidationException::withMessages(['date' => 'Não é possível registrar uma jornada no futuro.']);
        }
        $instants = [];
        $first = null;
        $previous = null;
        $missing = false;
        $calendarDate = $date;
        foreach (WorkDay::STEPS as $step => $column) {
            if (empty($entries[$step])) {
                $missing = true;
                $instants[$column] = null;

                continue;
            }
            if ($missing) {
                throw ValidationException::withMessages(['entries.'.$step => 'Preencha os horários na ordem, começando pela entrada.']);
            }
            $original = $day?->$column;
            $preserved = $day?->timezone === $timezone && $original?->setTimezone($timezone)->format('H:i') === $entries[$step] ? $original : null;
            $exact = $recordedInstants[$column] ?? $preserved;
            $instant = $exact?->setTimezone($timezone) ?? CarbonImmutable::createFromFormat('!Y-m-d H:i', $calendarDate.' '.$entries[$step], $timezone);
            if (! $exact && $previous && $instant->lessThan($previous)) {
                $calendarDate = $instant->addDay()->toDateString();
                $instant = CarbonImmutable::createFromFormat('!Y-m-d H:i', $calendarDate.' '.$entries[$step], $timezone);
            }
            if ($exact) {
                $calendarDate = $instant->toDateString();
            }
            if ($instant->format('Y-m-d H:i') !== $calendarDate.' '.$entries[$step]) {
                throw ValidationException::withMessages(['entries.'.$step => 'Este horário não existe no fuso da jornada.']);
            }
            if ($previous && $instant->lessThanOrEqualTo($previous)) {
                throw ValidationException::withMessages(['entries.'.$step => 'Cada registro precisa acontecer depois do anterior.']);
            }
            $first ??= $instant;
            if ($first->diffInSeconds($instant) > 86400) {
                throw ValidationException::withMessages(['entries.'.$step => 'Os registros devem caber em uma jornada de até 24 horas.']);
            }
            if ($instant->greaterThan(now())) {
                throw ValidationException::withMessages(['entries.'.$step => 'Não é possível registrar um horário no futuro.']);
            }
            $instants[$column] = $instant->utc();
            $previous = $instant;
        }

        return $instants;
    }

    private function dayData(?WorkDay $day, string $date, array $settings): array
    {
        if ($day) {
            return $day->workHoursData();
        }
        $timezone = $day?->timezone ?? $settings['timezone'];
        $entries = [];
        $instants = [];
        foreach (WorkDay::STEPS as $step => $column) {
            $instant = $day?->$column;
            $entries[$step] = $instant?->setTimezone($timezone)->format('H:i') ?? '';
            $instants[$step] = $instant?->toIso8601String();
        }

        return [
            'date' => $day?->work_date->toDateString() ?? $date,
            'timezone' => $timezone,
            'entries' => $entries,
            'instants' => $instants,
            'version' => $day?->version ?? 0,
            'regime' => $day?->regime ?? $settings,
        ];
    }

    private function responseData(User $user, string $fallbackTimezone, ?string $selectedDate = null): JsonResponse
    {
        $settings = $user->work_settings ?? WorkDay::defaultSettings($fallbackTimezone);
        $today = now($settings['timezone'])->toDateString();
        if ($selectedDate !== null && $selectedDate > $today) {
            throw ValidationException::withMessages(['date' => 'Não é possível registrar uma jornada no futuro.']);
        }
        $todayDay = WorkDay::where('work_date', $today)->first();
        $active = $todayDay?->started_at ? $todayDay : WorkDay::where('work_date', '>=', now($settings['timezone'])->subDay()->toDateString())
            ->where('work_date', '<=', $today)->where(function (Builder $query) use ($settings): void {
                $query->where(fn (Builder $pending) => $pending->whereNull('finished_at')->where('started_at', '>', now()->subDay()))
                    ->orWhere('finished_at', '>=', now($settings['timezone'])->startOfDay()->utc());
            })
            ->orderByDesc('work_date')->first() ?? $todayDay;
        $selected = $selectedDate === null ? $active : WorkDay::where('work_date', $selectedDate)->first();

        return response()->json([
            'settings' => $settings,
            'settings_version' => $user->work_settings_version,
            'today' => $today,
            'day' => $this->dayData($selected, $selectedDate ?? $today, $settings),
            'active_day' => $this->dayData($active, $today, $settings),
            'server_now' => now()->toIso8601String(),
        ])->header('Cache-Control', 'no-store, private');
    }
}
