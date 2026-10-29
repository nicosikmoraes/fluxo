<?php

use App\Http\Controllers\BillingWebhookController;
use App\Models\Project;
use App\Models\Task;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;

$screen = fn () => response(file_get_contents(public_path('ui/index.html')), 200, ['Content-Type' => 'text/html; charset=UTF-8', 'Cache-Control' => 'no-store, private']);
Route::get('/', $screen)->name('login');
Route::get('/reset-password/{token}', $screen)->name('password.reset');
Route::prefix('api')->group(base_path('routes/api.php'));
Route::post('/stripe/webhook', BillingWebhookController::class)->name('cashier.webhook');

Route::get('/storage/images/{owner}/{file}', function (string $owner, string $file) {
    abort_unless($owner === (string) auth()->id(), 404);
    $path = 'images/'.$owner.'/'.$file;
    $disk = Storage::disk();
    abort_unless($disk->exists($path), 404);

    return $disk->response($path, headers: ['X-Content-Type-Options' => 'nosniff', 'Cache-Control' => 'no-store, private']);
})->whereNumber('owner')->where('file', '[a-zA-Z0-9]+\.(jpg|jpeg|png|webp|gif)')->middleware(['auth', 'auth.session']);

Route::get('/storage/images/{file}', function (string $file) {
    $url = '/storage/images/'.$file;
    abort_unless(Project::where('cover_path', $url)->exists() || Task::where('cover_path', $url)->exists(), 404);
    $path = 'images/'.$file;
    $disk = Storage::disk();
    if (! $disk->exists($path) && config('filesystems.disks.public.driver') === 'local') {
        $disk = Storage::disk('public');
    }
    abort_unless($disk->exists($path), 404);

    return $disk->response($path, headers: ['X-Content-Type-Options' => 'nosniff', 'Cache-Control' => 'no-store, private']);
})->where('file', '[a-zA-Z0-9]+\.(jpg|jpeg|png|webp|gif)')->middleware(['auth', 'auth.session']);
