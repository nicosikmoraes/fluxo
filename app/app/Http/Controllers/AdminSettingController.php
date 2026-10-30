<?php

namespace App\Http\Controllers;

use App\Models\AdminEvent;
use App\Models\AdminSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AdminSettingController extends Controller
{
    public function index(): JsonResponse
    {
        $setting = AdminSetting::findOrFail(1);

        return response()->json(['settings' => $setting->values, 'version' => $setting->version,
            'billing' => ['ready' => (bool) (config('billing.enabled') && config('billing.pro_price_id') && config('cashier.secret') && config('cashier.webhook.secret')),
                'currency' => config('billing.currency'), 'amounts' => config('billing.amounts')]])->header('Cache-Control', 'no-store, private');
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate(['version' => ['required', 'integer', 'min:0'],
            'settings' => ['required', 'array:name,email,defaultGrant,newAccounts,maintenance'],
            'settings.name' => ['required', 'string', 'max:60'], 'settings.email' => ['present', 'nullable', 'email', 'max:254'],
            'settings.defaultGrant' => ['required', Rule::in(['7', '30', '90'])],
            'settings.newAccounts' => ['required', 'boolean'], 'settings.maintenance' => ['required', 'boolean']]);
        DB::transaction(function () use ($request, $data): void {
            $setting = AdminSetting::query()->lockForUpdate()->findOrFail(1);
            abort_if($setting->version !== (int) $data['version'], 409, __('As configurações foram alteradas por outro administrador. Recarregue antes de salvar.'));
            $previous = $setting->values;
            $setting->update(['values' => $data['settings'], 'version' => $setting->version + 1]);
            AdminEvent::record($request->user(), null, 'settings.updated', __('Preferências gerais atualizadas.'), ['previous' => $previous, 'current' => $data['settings']]);
        }, 3);

        return $this->index();
    }
}
