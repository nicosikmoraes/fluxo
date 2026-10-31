<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\WorkDay;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class WorkHistoryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'start' => ['required', 'date_format:Y-m-d', 'after_or_equal:1900-01-01'],
            'end' => ['required', 'date_format:Y-m-d', 'after_or_equal:start'],
            'timezone' => ['sometimes', 'timezone'],
        ], ['end.after_or_equal' => __('Escolha uma data final igual ou posterior à inicial.')]);
        $start = CarbonImmutable::createFromFormat('!Y-m-d', $data['start'], 'UTC');
        $end = CarbonImmutable::createFromFormat('!Y-m-d', $data['end'], 'UTC');
        if ($start->diffInDays($end) > 365) {
            throw ValidationException::withMessages(['end' => __('Selecione um período de até 366 dias.')]);
        }
        $settings = array_replace(WorkDay::defaultSettings($data['timezone'] ?? 'UTC'), $request->user()->work_settings ?? []);
        $settings['overtimeEnabled'] = $request->user()->locale !== 'en-US';
        $days = WorkDay::whereBetween('work_date', [$data['start'], $data['end']])
            ->where(function (Builder $query): void {
                $query->whereNotNull('started_at')->orWhereNotNull('overtime_receipt');
            })
            ->orderBy('work_date')
            ->get();

        return response()->json([
            'start' => $data['start'],
            'end' => $data['end'],
            'settings' => $request->user()->visibleWorkSettings($settings),
            'today' => now($settings['timezone'])->toDateString(),
            'server_now' => now()->toIso8601String(),
            'records' => array_values(WorkDay::withOvertimeData($days, $settings, CarbonImmutable::now(), $request->user()->hasPro())),
        ])->header('Cache-Control', 'no-store, private');
    }

    public function updateReceipt(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasPro(), 403, __('O cálculo de pagamento está disponível no Tempozi Pro.'));
        $data = $request->validate([
            'date' => ['required', 'date_format:Y-m-d', 'after_or_equal:1900-01-01'],
            'entry_version' => ['required', 'integer', 'min:0'],
            'receipt_version' => ['required', 'integer', 'min:0'],
            'amount' => ['present', 'nullable', 'numeric', 'min:0.01', 'max:999999999', 'decimal:0,2'],
            'received_on' => ['present', 'nullable', 'required_with:amount', 'date_format:Y-m-d', 'after_or_equal:date'],
        ], [
            'amount.min' => __('Informe um valor recebido maior que zero.'),
            'received_on.required_with' => __('Informe a data do recebimento.'),
            'received_on.after_or_equal' => __('O recebimento não pode ser anterior à jornada.'),
        ]);
        if ($data['amount'] === null && $data['received_on'] !== null) {
            throw ValidationException::withMessages(['amount' => __('Informe o valor recebido ou limpe também a data do recebimento.')]);
        }
        $day = DB::transaction(function () use ($request, $data): WorkDay {
            User::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            $day = WorkDay::where('work_date', $data['date'])->lockForUpdate()->firstOrFail();
            abort_if($day->version !== (int) $data['entry_version'] || $day->receipt_version !== (int) $data['receipt_version'], 409, __('Esta jornada ou seu recebimento mudou em outra aba. Atualize os dados antes de salvar.'));
            if ($data['amount'] !== null) {
                if (! $day->finished_at || $day->completedOvertimeSeconds() <= 0) {
                    throw ValidationException::withMessages(['amount' => __('Encerre uma jornada com horas extras antes de registrar o recebimento.')]);
                }
                if ($data['received_on'] > now($day->timezone)->toDateString()) {
                    throw ValidationException::withMessages(['received_on' => __('Não é possível registrar um recebimento no futuro.')]);
                }
            }
            $receipt = $data['amount'] === null ? null : [
                'amount_cents' => (int) round((float) $data['amount'] * 100),
                'received_on' => $data['received_on'],
            ];
            $day->forceFill(['overtime_receipt' => $receipt, 'receipt_version' => $day->receipt_version + 1])->save();

            return $day;
        }, 5);

        $settings = array_replace(WorkDay::defaultSettings($day->timezone), $request->user()->work_settings ?? []);
        $settings['overtimeEnabled'] = $request->user()->locale !== 'en-US';
        $records = WorkDay::withOvertimeData(collect([$day]), $settings, CarbonImmutable::now());

        return response()->json([
            'record' => $records[$day->work_date->toDateString()],
            'server_now' => now()->toIso8601String(),
        ])->header('Cache-Control', 'no-store, private');
    }
}
