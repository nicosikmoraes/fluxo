<?php

namespace App\Console\Commands;

use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Support\Facades\Storage;
use League\Flysystem\FilesystemException;
use RuntimeException;

#[Signature('workspace:copy-images {--to= : Disco privado de destino} {--dry-run : Lista arquivos sem copiar}')]
#[Description('Copia imagens locais para um disco persistente sem apagar os originais ou mudar URLs')]
class CopyWorkspaceImages extends Command
{
    public function handle(): int
    {
        if (! app()->environment('local', 'testing')) {
            $this->error('Execute a cópia no ambiente local que contém os arquivos originais.');

            return self::FAILURE;
        }
        $target = $this->option('to');
        if (! is_string($target) || ! config('filesystems.disks.'.$target) || in_array($target, ['local', 'public'], true)) {
            $this->error('Informe --to com o nome de um disco privado diferente de local e public.');

            return self::FAILURE;
        }

        $copied = 0;
        $skipped = 0;
        try {
            $destination = Storage::disk($target);
            foreach (['local', 'public'] as $sourceName) {
                $source = Storage::disk($sourceName);
                foreach ($source->allFiles('images') as $path) {
                    if (! preg_match('#^images/(?:[0-9]+/)?[a-zA-Z0-9]+\.(jpg|jpeg|png|webp|gif)$#', $path)) {
                        continue;
                    }
                    if ($this->option('dry-run')) {
                        $this->line($sourceName.':'.$path.' -> '.$target.':'.$path);
                        $copied++;

                        continue;
                    }
                    $checksum = $this->checksum($source, $path);
                    if ($destination->exists($path)) {
                        if ($this->checksum($destination, $path) !== $checksum) {
                            throw new RuntimeException('O destino contém uma imagem diferente em '.$path.'. Nenhum arquivo foi sobrescrito.');
                        }
                        $skipped++;

                        continue;
                    }
                    $stream = $source->readStream($path);
                    if (! is_resource($stream)) {
                        throw new RuntimeException('Não foi possível ler '.$sourceName.':'.$path.'.');
                    }
                    try {
                        if (! $destination->put($path, $stream, ['ContentType' => $source->mimeType($path)])) {
                            throw new RuntimeException('Não foi possível copiar '.$path.'.');
                        }
                    } finally {
                        fclose($stream);
                    }
                    if ($this->checksum($destination, $path) !== $checksum) {
                        throw new RuntimeException('A verificação da cópia falhou em '.$path.'. O original foi preservado.');
                    }
                    $copied++;
                }
            }
        } catch (FilesystemException|RuntimeException $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }

        $this->info(($this->option('dry-run') ? 'A copiar: ' : 'Copiadas: ').$copied.'. Já existentes e verificadas: '.$skipped.'. Originais preservados.');

        return self::SUCCESS;
    }

    private function checksum(FilesystemAdapter $disk, string $path): string
    {
        $stream = $disk->readStream($path);
        if (! is_resource($stream)) {
            throw new RuntimeException('Não foi possível verificar '.$path.'.');
        }
        try {
            $hash = hash_init('sha256');
            hash_update_stream($hash, $stream);

            return hash_final($hash);
        } finally {
            fclose($stream);
        }
    }
}
