<?php

use Illuminate\Foundation\Application;

function desktopApplication(): Application
{
    $base = getenv('FLUXO_BACKEND_DIR');
    $data = getenv('FLUXO_DATA_DIR');
    if (! $base || ! $data) {
        throw new RuntimeException('A pasta de dados do aplicativo não foi configurada.');
    }
    require_once $base.'/vendor/autoload.php';
    $application = require $base.'/bootstrap/app.php';
    $application->addAbsoluteCachePathPrefix($data);
    $application->useEnvironmentPath($data);
    $application->useStoragePath($data.'/storage');

    return $application;
}
