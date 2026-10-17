<?php

use Symfony\Component\Console\Input\ArrayInput;

$base = getenv('FLUXO_BACKEND_DIR');
$data = getenv('FLUXO_DATA_DIR');
if (! $base || ! $data || ! is_dir($base)) {
    fwrite(STDERR, "Não foi possível localizar os arquivos do Fluxo.\n");
    exit(1);
}
foreach (['', '/storage/app/private', '/storage/app/public', '/storage/framework/cache/data', '/storage/framework/sessions', '/storage/framework/views', '/storage/logs', '/cache'] as $folder) {
    if (! is_dir($data.$folder) && ! mkdir($data.$folder, 0700, true) && ! is_dir($data.$folder)) {
        throw new RuntimeException('Não foi possível criar a pasta de dados.');
    }
}
$environmentPath = $data.'/.env';
if (! file_exists($environmentPath)) {
    $key = 'base64:'.base64_encode(random_bytes(32));
    $environment = "APP_NAME=Fluxo\nAPP_ENV=desktop\nAPP_DEBUG=false\nAPP_KEY=".$key."\nDB_CONNECTION=sqlite\nSESSION_DRIVER=database\nSESSION_LIFETIME=10080\nCACHE_STORE=database\nQUEUE_CONNECTION=sync\nMAIL_MAILER=log\nLOG_CHANNEL=single\nLOG_LEVEL=warning\n";
    $temporaryPath = $environmentPath.'.new';
    if (file_put_contents($temporaryPath, $environment, LOCK_EX) === false || ! rename($temporaryPath, $environmentPath)) {
        throw new RuntimeException('Não foi possível preparar os dados locais.');
    }
}
if (! file_exists($data.'/database.sqlite')) {
    $database = fopen($data.'/database.sqlite', 'x');
    if ($database === false) {
        throw new RuntimeException('Não foi possível criar o banco de dados.');
    }
    fclose($database);
}
foreach (['config.php', 'services.php', 'packages.php', 'routes.php', 'events.php'] as $cacheFile) {
    $cached = $data.'/cache/'.$cacheFile;
    if (is_file($cached)) {
        unlink($cached);
    }
}
require __DIR__.'/bootstrap.php';
$application = desktopApplication();
$status = $application->handleCommand(new ArrayInput([
    'command' => 'migrate', '--force' => true, '--no-interaction' => true,
]));
exit($status);
