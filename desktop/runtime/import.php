<?php

use Dotenv\Dotenv;
use Illuminate\Encryption\Encrypter;
use Symfony\Component\Console\Input\ArrayInput;

$base = getenv('FLUXO_BACKEND_DIR');
$data = getenv('FLUXO_DATA_DIR');
$source = realpath($argv[1] ?? '');
require $base.'/vendor/autoload.php';
try {
    if (! $source || ! is_file($source.'/.env')) {
        throw new RuntimeException('Selecione a pasta app da sua instalação atual do Fluxo.');
    }
    $target = new SQLite3($data.'/database.sqlite');
    if ((int) $target->querySingle('SELECT COUNT(*) FROM users') !== 0) {
        throw new RuntimeException('Importe antes de criar uma conta neste aplicativo. Já existem dados locais para preservar.');
    }
    $target->close();
    $settings = Dotenv::parse(file_get_contents($source.'/.env'));
    if (($settings['DB_CONNECTION'] ?? 'sqlite') !== 'sqlite') {
        throw new RuntimeException('Esta importação aceita uma instalação local com SQLite.');
    }
    $databasePath = $settings['DB_DATABASE'] ?? $source.'/database/database.sqlite';
    $absolutePath = str_starts_with($databasePath, DIRECTORY_SEPARATOR) || str_starts_with($databasePath, '/')
        || (strlen($databasePath) > 2 && ctype_alpha($databasePath[0]) && $databasePath[1] === ':' && in_array($databasePath[2], ['/', DIRECTORY_SEPARATOR], true));
    if (! $absolutePath) {
        $databasePath = $source.'/'.$databasePath;
    }
    $databasePath = realpath($databasePath);
    $key = $settings['APP_KEY'] ?? '';
    $decodedKey = str_starts_with($key, 'base64:') ? base64_decode(substr($key, 7), true) : $key;
    if (! $databasePath || ! is_file($databasePath) || ! is_string($decodedKey) || ! Encrypter::supported($decodedKey, 'AES-256-CBC')) {
        throw new RuntimeException('O banco ou a chave da instalação selecionada não é válido.');
    }
    $original = new SQLite3($databasePath, SQLITE3_OPEN_READONLY);
    $original->enableExceptions(true);
    $encrypter = new Encrypter($decodedKey, 'AES-256-CBC');
    $users = $original->query('SELECT work_settings FROM users WHERE work_settings IS NOT NULL');
    while ($user = $users->fetchArray(SQLITE3_ASSOC)) {
        $encrypter->decrypt($user['work_settings'], false);
    }
    $users->finalize();
    $stagedDatabase = $data.'/import.sqlite';
    $copy = new SQLite3($stagedDatabase);
    if (! $original->backup($copy)) {
        throw new RuntimeException('Não foi possível copiar os registros. Feche o Fluxo antigo e tente novamente.');
    }
    $original->close();
    $copy->close();
    foreach (['private', 'public'] as $disk) {
        $sourceFiles = $source.'/storage/app/'.$disk;
        if (! is_dir($sourceFiles)) {
            continue;
        }
        $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($sourceFiles, FilesystemIterator::SKIP_DOTS));
        foreach ($iterator as $file) {
            if ($file->isLink() || ! $file->isFile()) {
                continue;
            }
            $relative = substr($file->getPathname(), strlen($sourceFiles));
            $destination = $data.'/storage/app/'.$disk.$relative;
            if (! is_dir(dirname($destination))) {
                mkdir(dirname($destination), 0700, true);
            }
            if (! copy($file->getPathname(), $destination)) {
                throw new RuntimeException('Não foi possível copiar as imagens da instalação selecionada.');
            }
        }
    }
    $environmentPath = $data.'/.env';
    $previousEnvironment = file_get_contents($environmentPath);
    $environment = preg_replace('/^APP_KEY=.*$/m', 'APP_KEY=base64:'.base64_encode($decodedKey), $previousEnvironment);
    if (file_put_contents($environmentPath.'.new', $environment, LOCK_EX) === false || ! rename($environmentPath.'.new', $environmentPath)) {
        throw new RuntimeException('Não foi possível guardar a chave dos registros importados.');
    }
    if (! rename($stagedDatabase, $data.'/database.sqlite')) {
        file_put_contents($environmentPath, $previousEnvironment, LOCK_EX);
        throw new RuntimeException('Não foi possível concluir a cópia do banco local.');
    }
    require __DIR__.'/bootstrap.php';
    $application = desktopApplication();
    $status = $application->handleCommand(new ArrayInput([
        'command' => 'migrate', '--force' => true, '--no-interaction' => true,
    ]));
    exit($status);
} catch (Throwable $error) {
    fwrite(STDERR, $error instanceof RuntimeException ? $error->getMessage() : 'A instalação selecionada não pôde ser importada. Confira se é uma cópia válida do Fluxo.');
    exit(1);
}
