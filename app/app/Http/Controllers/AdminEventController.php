<?php

namespace App\Http\Controllers;

use App\Models\AdminEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminEventController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate(['page' => ['sometimes', 'integer', 'min:1', 'max:1000000']]);
        $events = AdminEvent::latest('id')->paginate(20);
        $titles = ['grant.created' => 'Acesso cortesia concedido', 'grant.revoked' => 'Cortesia encerrada', 'account.disabled' => 'Conta desativada', 'account.enabled' => 'Conta reativada', 'settings.updated' => 'Configurações atualizadas', 'users.exported' => 'Usuários exportados', 'admin.granted' => 'Administrador autorizado', 'admin.revoked' => 'Permissão administrativa removida'];

        return response()->json(['data' => $events->getCollection()->map(fn (AdminEvent $event) => [
            'id' => $event->id, 'title' => __($titles[$event->action] ?? 'Ação administrativa'),
            'detail' => ($event->target_name ? $event->target_name.' · ' : '').$event->detail,
            'type' => str_starts_with($event->action, 'grant.') ? 'grant' : 'admin',
            'expires_at' => $event->metadata['expires_at'] ?? null, 'actor' => $event->actor_name, 'time' => $event->created_at->toIso8601String(),
        ]), 'total' => $events->total(), 'current_page' => $events->currentPage(), 'last_page' => $events->lastPage()])->header('Cache-Control', 'no-store, private');
    }
}
