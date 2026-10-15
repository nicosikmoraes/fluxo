<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

#[Signature('workspace:import-legacy {email} {--confirm : Confirma o vínculo dos dados sem proprietário} {--dry-run : Mostra os totais sem alterar dados}')]
#[Description('Vincula os dados locais sem proprietário a uma conta existente')]
class ImportLegacyWorkspace extends Command
{
    public function handle(): int
    {
        if (! app()->environment('local', 'testing')) {
            $this->error('A importação de dados locais só pode ser executada em ambiente local.');

            return self::FAILURE;
        }
        $user = User::where('email', Str::lower(trim($this->argument('email'))))->first();
        if (! $user) {
            $this->error('Crie a conta no Fluxo antes de importar seus dados.');

            return self::FAILURE;
        }
        $tables = ['projects', 'tasks', 'activities', 'comments', 'roadmaps', 'roadmap_nodes', 'roadmap_edges', 'daily_routines', 'daily_entries'];
        $this->table(['Tabela', 'Registros sem proprietário'], array_map(fn (string $table): array => [$table, DB::table($table)->whereNull('user_id')->count()], $tables));
        if ($this->option('dry-run')) {
            return self::SUCCESS;
        }
        if (! $this->option('confirm')) {
            $this->error('Faça um backup do banco e das imagens e execute novamente com --confirm para vincular os dados a '.$user->email.'.');

            return self::FAILURE;
        }
        DB::transaction(function () use ($tables, $user): void {
            foreach ($tables as $table) {
                DB::table($table)->whereNull('user_id')->update(['user_id' => $user->id]);
            }
        });
        $this->info('Dados locais vinculados a '.$user->email.'. Registros de outras contas foram preservados.');

        return self::SUCCESS;
    }
}
