<?php

use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));
$public = getenv('FLUXO_BACKEND_DIR').'/public';
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');
if ($path === '/__fluxo_desktop_health') {
    header('Content-Type: application/json');
    echo json_encode(['instance' => getenv('FLUXO_INSTANCE')]);

    return true;
}
$file = realpath($public.$path);
$publicRoot = realpath($public).DIRECTORY_SEPARATOR;
if ($file && str_starts_with($file, $publicRoot) && is_file($file) && ! str_ends_with(strtolower($file), '.php')) {
    return false;
}
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
require __DIR__.'/bootstrap.php';
desktopApplication()->handleRequest(Request::capture());
