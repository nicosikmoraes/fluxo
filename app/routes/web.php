<?php

use Illuminate\Support\Facades\Route;

Route::get('/', fn () => response(file_get_contents(public_path('ui/index.html')), 200, ['Content-Type'=>'text/html; charset=UTF-8']));
Route::get('/storage/images/{file}', function (string $file) {
    $path = storage_path('app/public/images/'.$file);
    abort_unless(is_file($path), 404);
    return response(file_get_contents($path), 200, ['Content-Type'=>(new finfo(FILEINFO_MIME_TYPE))->file($path), 'X-Content-Type-Options'=>'nosniff']);
})->where('file', '[a-zA-Z0-9]+\.(jpg|jpeg|png|webp|gif)');
