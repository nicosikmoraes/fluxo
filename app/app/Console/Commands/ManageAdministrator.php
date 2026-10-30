<?php

namespace App\Console\Commands;

use App\Models\AdminEvent;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ManageAdministrator extends Command
{
    protected $signature = 'fluxo:admin {email : E-mail de uma conta existente} {--revoke : Revogar o acesso administrativo}';

    protected $description = 'Autoriza ou revoga um administrador sem expor permissões pelo cadastro público.';

    public function handle(): int
    {
        $email = Str::lower(trim((string) $this->argument('email')));
        $error = DB::transaction(function () use ($email): ?string {
            $target = User::query()->whereRaw('LOWER(email) = ?', [$email])->lockForUpdate()->first();
            if (! $target) {
                return 'Conta não encontrada. Nenhuma conta foi criada.';
            }
            if ($target->disabled_at) {
                return 'A conta está desativada.';
            }
            $revoke = (bool) $this->option('revoke');
            if ($revoke && $target->is_admin && User::where('is_admin', true)->whereNull('disabled_at')->lockForUpdate()->get(['id'])->count() <= 1) {
                return 'Não é possível remover o último administrador ativo.';
            }
            if ($target->is_admin === ! $revoke) {
                return null;
            }
            $target->forceFill(['is_admin' => ! $revoke, 'admin_version' => $target->admin_version + 1])->save();
            AdminEvent::record(null, $target, $revoke ? 'admin.revoked' : 'admin.granted', 'Alteração de permissão pelo console.');

            return null;
        }, 3);
        if ($error) {
            $this->error($error);

            return self::FAILURE;
        }
        $this->info($this->option('revoke') ? 'Permissão administrativa revogada.' : 'Conta autorizada como administrador.');

        return self::SUCCESS;
    }
}
