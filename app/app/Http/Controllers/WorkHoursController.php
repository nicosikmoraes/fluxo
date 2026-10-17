<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\WorkDay;
use Carbon\CarbonImmutable;
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
            'settings' => ['required', 'array:enabled,weeklyHours,daysPerWeek,monthlySalary,monthlyHours,overtimePremium,timezone,cycleClosingDay'],
            'settings.enabled' => ['required', 'boolean'],
            'settings.weeklyHours' => ['required', 'numeric', 'min:0.01', 'max:168'],
            'settings.daysPerWeek' => ['required', 'integer', 'between:1,7'],
            'settings.monthlySalary' => ['present', 'nullable', 'numeric', 'min:0.01', 'max:999999999', 'decimal:0,2'],
            'settings.monthlyHours' => ['required', 'numeric', 'min:0.01', 'max:744'],
            'settings.overtimePremium' => ['required', 'numeric', 'between:0,1000'],
            'settings.timezone' => ['required', 'timezone'],
            'settings.cycleClosingDay' => ['sometimes', 'integer', 'between:1,31'],
            'settings_version' => ['required', 'integer', 'min:0'],
            'date' => ['required', 'date_format:Y-m-d', 'after_or_equal:1900-01-01'],
            'entry_version' => ['required', 'integer', 'min:0'],
            'entries' => ['present', 'array:startedAt,lunchOut,lunchIn,finishedAt'],
            'additional_breaks' => ['sometimes', 'array', 'max:30'],
            'additional_breaks.*' => ['array:startedAt,finishedAt'],
            'additional_breaks.*.startedAt' => ['required', 'date_format:H:i'],
            'additional_breaks.*.finishedAt' => ['present', 'nullable', 'date_format:H:i'],
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
        $settings = array_replace(WorkDay::defaultSettings($data['settings']['timezone']), $request->user()->work_settings ?? [], $data['settings']);
        $settings['enabled'] = (bool) $settings['enabled'];
        $settings['weeklyHours'] = (float) $settings['weeklyHours'];
        $settings['daysPerWeek'] = (int) $settings['daysPerWeek'];
        $settings['monthlySalary'] = $settings['monthlySalary'] === null ? null : (float) $settings['monthlySalary'];
        $settings['monthlyHours'] = (float) $settings['monthlyHours'];
        $settings['overtimePremium'] = (float) $settings['overtimePremium'];
        $settings['cycleClosingDay'] = (int) $settings['cycleClosingDay'];
        $user = DB::transaction(function () use ($request, $data, $settings): User {
            $user = User::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            abort_if($user->work_settings_version !== (int) $data['settings_version'], 409, 'Suas configurações mudaram em outra aba. Atualize os dados antes de salvar.');
            $day = WorkDay::where('work_date', $data['date'])->lockForUpdate()->first();
            $this->checkVersion($day, (int) $data['entry_version']);
            $historical = $data['date'] < now($settings['timezone'])->toDateString();
            $timezone = $historical && $day ? $day->timezone : $settings['timezone'];
            $regime = $historical && $day ? $day->regime : $settings;
            $instants = $this->normalizeEntries($data['entries'], $data['date'], $timezone, $day, $data['additional_breaks'] ?? null);
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
            'step' => ['required_without:action', 'prohibits:action', Rule::in(array_keys(WorkDay::STEPS))],
            'action' => ['required_without:step', 'prohibits:step', Rule::in(['start', 'pause', 'resume', 'finish'])],
            'date' => ['required', 'date_format:Y-m-d', 'after_or_equal:1900-01-01'],
            'entry_version' => ['required', 'integer', 'min:0'],
        ]);
        $user = DB::transaction(function () use ($request, $data): User {
            $user = User::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            $settings = array_replace(WorkDay::defaultSettings(), $user->work_settings ?? []);
            if (! $settings['enabled']) {
                throw ValidationException::withMessages(['enabled' => 'Ative o acompanhamento da jornada nas configurações do perfil.']);
            }
            $day = WorkDay::where('work_date', $data['date'])->lockForUpdate()->first();
            $this->checkVersion($day, (int) $data['entry_version']);
            $timezone = $day?->timezone ?? $settings['timezone'];
            $instant = CarbonImmutable::now()->utc();
            $today = $instant->setTimezone($timezone)->toDateString();
            if ($data['date'] !== $today && (! $day?->started_at || $day->finished_at || $day->started_at->lessThanOrEqualTo($instant->subDay()))) {
                throw ValidationException::withMessages(['date' => 'Escolha a jornada de hoje para registrar o horário atual.']);
            }
            $mapping = ['startedAt' => 'start', 'lunchOut' => 'pause', 'lunchIn' => 'resume', 'finishedAt' => 'finish'];
            $action = $data['action'] ?? $mapping[$data['step']];
            if (isset($data['step']) && $day?->{WorkDay::STEPS[$data['step']]} !== null) {
                throw ValidationException::withMessages(['step' => 'Este horário já foi registrado. Edite-o nas configurações do perfil.']);
            }
            $day ??= new WorkDay(['work_date' => $data['date'], 'timezone' => $timezone, 'regime' => $settings]);
            if ($day->finished_at) {
                throw ValidationException::withMessages(['action' => 'Esta jornada já foi encerrada. Corrija os horários nas configurações do perfil.']);
            }
            if ($action !== 'start' && (! $day->started_at || $day->started_at->lessThanOrEqualTo($instant->subDay()))) {
                throw ValidationException::withMessages(['action' => 'Inicie uma jornada de hoje antes de pausar ou finalizar.']);
            }
            $additional = $day->additional_breaks ?? [];
            $last = array_key_last($additional);
            $primaryOpen = $day->lunch_out_at && ! $day->lunch_in_at;
            $additionalOpen = $last !== null && empty($additional[$last]['finished_at']);
            if ($action === 'start') {
                if ($day->started_at) {
                    throw ValidationException::withMessages(['action' => 'Sua jornada já foi iniciada.']);
                }
                $day->started_at = $instant;
                $day->regime = $settings;
            } elseif ($action === 'pause') {
                if ($primaryOpen || $additionalOpen) {
                    throw ValidationException::withMessages(['action' => 'Sua jornada já está em pausa.']);
                }
                if (! $day->lunch_out_at) {
                    $day->lunch_out_at = $instant;
                } else {
                    if (count($additional) >= 30) {
                        throw ValidationException::withMessages(['action' => 'O limite de pausas desta jornada foi atingido.']);
                    }
                    $additional[] = ['started_at' => $instant->toIso8601String(), 'finished_at' => null];
                }
            } elseif ($action === 'resume') {
                if (! $primaryOpen && ! $additionalOpen) {
                    throw ValidationException::withMessages(['action' => 'Não há uma pausa em andamento para retomar.']);
                }
                if ($primaryOpen) {
                    $day->lunch_in_at = $instant;
                } else {
                    $additional[$last]['finished_at'] = $instant->toIso8601String();
                }
            } elseif ($action === 'finish') {
                if ($primaryOpen) {
                    $day->lunch_in_at = $instant;
                } elseif ($additionalOpen) {
                    $additional[$last]['finished_at'] = $instant->toIso8601String();
                }
                $day->finished_at = $instant;
            }
            $day->fill(['additional_breaks' => $additional, 'version' => ($day->version ?? 0) + 1])->save();

            return $user;
        }, 5);

        return $this->responseData($user, $user->work_settings['timezone'], $data['date']);
    }

    private function checkVersion(?WorkDay $day, int $expected): void
    {
        abort_if(($day?->version ?? 0) !== $expected, 409, 'Seus horários mudaram em outra aba. Atualize os dados antes de salvar.');
    }

    private function normalizeEntries(array $entries, string $date, string $timezone, ?WorkDay $day = null, ?array $additionalBreaks = null): array
    {
        if ($date > now($timezone)->toDateString()) {
            throw ValidationException::withMessages(['date' => 'Não é possível registrar uma jornada no futuro.']);
        }
        $additionalBreaks ??= array_map(fn (array $pause): array => [
            'startedAt' => CarbonImmutable::parse($pause['started_at'])->setTimezone($timezone)->format('H:i'),
            'finishedAt' => empty($pause['finished_at']) ? '' : CarbonImmutable::parse($pause['finished_at'])->setTimezone($timezone)->format('H:i'),
        ], $day?->additional_breaks ?? []);
        $result = ['started_at' => null, 'lunch_out_at' => null, 'lunch_in_at' => null, 'finished_at' => null, 'additional_breaks' => []];
        if (empty($entries['startedAt'])) {
            if (array_filter($entries) || $additionalBreaks) {
                throw ValidationException::withMessages(['entries.startedAt' => 'Preencha a entrada antes dos outros horários.']);
            }

            return $result;
        }
        if (! empty($entries['lunchIn']) && empty($entries['lunchOut'])) {
            throw ValidationException::withMessages(['entries.lunchOut' => 'Informe o início da pausa antes do retorno.']);
        }
        if (! empty($entries['lunchOut']) && empty($entries['lunchIn']) && (! empty($entries['finishedAt']) || $additionalBreaks)) {
            throw ValidationException::withMessages(['entries.lunchIn' => 'Informe o retorno da pausa antes dos próximos registros.']);
        }
        if ($additionalBreaks && empty($entries['lunchIn'])) {
            throw ValidationException::withMessages(['additional_breaks' => 'Complete a primeira pausa antes de adicionar outra.']);
        }
        $steps = [['column' => 'started_at', 'value' => $entries['startedAt'], 'original' => $day?->started_at]];
        foreach (['lunchOut' => 'lunch_out_at', 'lunchIn' => 'lunch_in_at'] as $key => $column) {
            if (! empty($entries[$key])) {
                $steps[] = ['column' => $column, 'value' => $entries[$key], 'original' => $day?->$column];
            }
        }
        foreach ($additionalBreaks as $index => $pause) {
            if (empty($pause['startedAt'])) {
                throw ValidationException::withMessages(['additional_breaks' => 'Informe o início de cada pausa adicional ou remova a pausa vazia.']);
            }
            if (empty($pause['finishedAt']) && ($index < count($additionalBreaks) - 1 || ! empty($entries['finishedAt']))) {
                throw ValidationException::withMessages(['additional_breaks' => 'Complete a pausa em andamento antes dos próximos horários.']);
            }
            $original = ($day?->additional_breaks ?? [])[$index] ?? [];
            $steps[] = ['column' => 'additional_start', 'value' => $pause['startedAt'], 'index' => $index, 'original' => isset($original['started_at']) ? CarbonImmutable::parse($original['started_at']) : null];
            if (! empty($pause['finishedAt'])) {
                $steps[] = ['column' => 'additional_end', 'value' => $pause['finishedAt'], 'index' => $index, 'original' => isset($original['finished_at']) ? CarbonImmutable::parse($original['finished_at']) : null];
            }
        }
        if (! empty($entries['finishedAt'])) {
            $steps[] = ['column' => 'finished_at', 'value' => $entries['finishedAt'], 'original' => $day?->finished_at];
        }
        $calendarDate = $date;
        $first = null;
        $previous = null;
        foreach ($steps as $step) {
            $original = $step['original'];
            $preserved = $day?->timezone === $timezone && $original?->setTimezone($timezone)->format('H:i') === $step['value'] ? $original : null;
            $instant = $preserved?->setTimezone($timezone) ?? CarbonImmutable::createFromFormat('!Y-m-d H:i', $calendarDate.' '.$step['value'], $timezone);
            if (! $preserved && $previous && $instant->lessThan($previous)) {
                $calendarDate = $instant->addDay()->toDateString();
                $instant = CarbonImmutable::createFromFormat('!Y-m-d H:i', $calendarDate.' '.$step['value'], $timezone);
            }
            if ($preserved) {
                $calendarDate = $instant->toDateString();
            }
            if ($instant->format('Y-m-d H:i') !== $calendarDate.' '.$step['value'] || $previous && ($instant->lessThan($previous) || ! $preserved && $instant->equalTo($previous))) {
                throw ValidationException::withMessages(['entries' => 'Confira a sequência dos horários e das pausas informados.']);
            }
            $first ??= $instant;
            if ($first->diffInSeconds($instant) > 86400 || $instant->greaterThan(now())) {
                throw ValidationException::withMessages(['entries' => 'Os horários devem caber em 24 horas e não podem estar no futuro.']);
            }
            $utc = $instant->utc();
            if ($step['column'] === 'additional_start') {
                $result['additional_breaks'][$step['index']] = ['started_at' => $utc->toIso8601String(), 'finished_at' => null];
            } elseif ($step['column'] === 'additional_end') {
                $result['additional_breaks'][$step['index']]['finished_at'] = $utc->toIso8601String();
            } else {
                $result[$step['column']] = $utc;
            }
            $previous = $instant;
        }

        return $result;
    }

    private function responseData(User $user, string $fallbackTimezone, ?string $selectedDate = null): JsonResponse
    {
        $settings = array_replace(WorkDay::defaultSettings($fallbackTimezone), $user->work_settings ?? []);
        $today = now($settings['timezone'])->toDateString();
        if ($selectedDate !== null && $selectedDate > $today) {
            throw ValidationException::withMessages(['date' => 'Não é possível registrar uma jornada no futuro.']);
        }
        $todayDay = WorkDay::where('work_date', $today)->first();
        $active = $todayDay?->started_at ? $todayDay : WorkDay::where('work_date', '>=', now($settings['timezone'])->subDay()->toDateString())
            ->where('work_date', '<=', $today)
            ->whereNull('finished_at')
            ->where('started_at', '>', now()->subDay())
            ->orderByDesc('work_date')->first() ?? $todayDay;
        $selected = $selectedDate === null ? $active : WorkDay::where('work_date', $selectedDate)->first();
        $selected ??= new WorkDay(['work_date' => $selectedDate ?? $today, 'timezone' => $settings['timezone'], 'regime' => $settings, 'version' => 0]);
        $active ??= new WorkDay(['work_date' => $today, 'timezone' => $settings['timezone'], 'regime' => $settings, 'version' => 0]);
        $records = WorkDay::withOvertimeData(collect([$selected, $active])->unique(fn (WorkDay $day): string => $day->work_date->toDateString()), $settings, CarbonImmutable::now());

        return response()->json([
            'settings' => $settings,
            'settings_version' => $user->work_settings_version,
            'today' => $today,
            'day' => $records[$selected->work_date->toDateString()],
            'active_day' => $records[$active->work_date->toDateString()],
            'server_now' => now()->toIso8601String(),
        ])->header('Cache-Control', 'no-store, private');
    }
}
