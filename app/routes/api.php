<?php

use App\Http\Controllers\AdminDashboardController;
use App\Http\Controllers\AdminEventController;
use App\Http\Controllers\AdminGrantController;
use App\Http\Controllers\AdminSettingController;
use App\Http\Controllers\AdminUserController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BillingController;
use App\Http\Controllers\DailyListController as D;
use App\Http\Controllers\ProfilePreferenceController;
use App\Http\Controllers\RoadmapController as R;
use App\Http\Controllers\WhiteboardController;
use App\Http\Controllers\WorkHistoryController;
use App\Http\Controllers\WorkHoursController;
use App\Http\Controllers\WorkspaceController as W;
use App\Http\Middleware\EnsureWorkTrackingSubscription;
use Illuminate\Support\Facades\Route;

Route::get('/auth/session', [AuthController::class, 'session']);
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:login');
Route::post('/auth/register', [AuthController::class, 'register'])->middleware('throttle:registration');
Route::post('/auth/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:password-recovery');
Route::post('/auth/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:password-recovery');

Route::middleware(['auth', 'auth.session'])->group(function (): void {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::post('/auth/email/verification-notification', [AuthController::class, 'sendEmailVerificationNotification'])->middleware('throttle:6,1');
});

Route::middleware(['auth', 'auth.session', 'verified'])->group(function (): void {

    Route::prefix('admin')->middleware(['can:access-admin', 'throttle:120,1'])->group(function (): void {
        Route::get('/overview', [AdminDashboardController::class, 'index']);
        Route::get('/users/export', [AdminUserController::class, 'export']);
        Route::get('/users', [AdminUserController::class, 'index']);
        Route::get('/users/{user}', [AdminUserController::class, 'show']);
        Route::patch('/users/{user}', [AdminUserController::class, 'update']);
        Route::post('/users/{user}/grant', [AdminGrantController::class, 'store'])->middleware('throttle:30,1');
        Route::delete('/users/{user}/grant', [AdminGrantController::class, 'destroy'])->middleware('throttle:30,1');
        Route::get('/events', [AdminEventController::class, 'index']);
        Route::get('/settings', [AdminSettingController::class, 'index']);
        Route::put('/settings', [AdminSettingController::class, 'update']);
    });

    Route::get('/billing', [BillingController::class, 'index']);
    Route::post('/billing/checkout', [BillingController::class, 'checkout'])->middleware('throttle:10,1');
    Route::post('/billing/portal', [BillingController::class, 'portal'])->middleware('throttle:10,1');
    Route::put('/profile/preferences', [ProfilePreferenceController::class, 'update']);
    Route::get('/whiteboards', [WhiteboardController::class, 'index']);
    Route::post('/whiteboards', [WhiteboardController::class, 'storeBoard']);
    Route::patch('/whiteboards/{whiteboard}', [WhiteboardController::class, 'renameBoard']);
    Route::delete('/whiteboards/{whiteboard}', [WhiteboardController::class, 'destroyBoard']);
    Route::get('/whiteboards/{whiteboard}/content', [WhiteboardController::class, 'showNamed']);
    Route::put('/whiteboards/{whiteboard}/content', [WhiteboardController::class, 'updateNamed']);
    Route::get('/whiteboard', [WhiteboardController::class, 'show']);
    Route::put('/whiteboard', [WhiteboardController::class, 'update']);
    Route::middleware(EnsureWorkTrackingSubscription::class)->group(function (): void {
        Route::get('/profile/work-hours', [WorkHoursController::class, 'index']);
        Route::put('/profile/work-hours', [WorkHoursController::class, 'update']);
        Route::post('/profile/work-hours/records', [WorkHoursController::class, 'record']);
        Route::get('/profile/work-hours/history', [WorkHistoryController::class, 'index']);
        Route::put('/profile/work-hours/receipts', [WorkHistoryController::class, 'updateReceipt']);
    });

    Route::post('/projects/{project}/roadmaps', [R::class, 'create']);
    Route::patch('/roadmaps/{roadmap}', [R::class, 'update']);
    Route::put('/roadmaps/{roadmap}/portals', [R::class, 'savePortals']);
    Route::delete('/roadmaps/{roadmap}', [R::class, 'delete']);
    Route::post('/roadmaps/{roadmap}/nodes', [R::class, 'addNode']);
    Route::post('/roadmaps/{roadmap}/activities', [R::class, 'createConnectedActivity']);
    Route::post('/roadmaps/{roadmap}/tasks', [R::class, 'createConnectedTask']);
    Route::patch('/roadmaps/{roadmap}/layout', [R::class, 'moveLayout']);
    Route::patch('/roadmaps/{roadmap}/nodes/{node}', [R::class, 'moveNode']);
    Route::delete('/roadmaps/{roadmap}/nodes/{node}', [R::class, 'deleteNode']);
    Route::post('/roadmaps/{roadmap}/edges', [R::class, 'addEdge']);
    Route::delete('/roadmaps/{roadmap}/edges/{edge}', [R::class, 'deleteEdge']);
    Route::get('/workspace', [W::class, 'index']);
    Route::post('/projects', [W::class, 'createProject']);
    Route::post('/projects/{project}/roadmap/reorder', [W::class, 'reorderRoadmap']);
    Route::patch('/projects/{project}', [W::class, 'updateProject']);
    Route::delete('/projects/{project}', [W::class, 'deleteProject']);
    Route::post('/tasks', [W::class, 'createTask']);
    Route::post('/tasks/reorder', [W::class, 'reorderTasks']);
    Route::patch('/tasks/{task}/schedule', [W::class, 'scheduleTask']);
    Route::patch('/tasks/{task}', [W::class, 'updateTask']);
    Route::delete('/tasks/{task}', [W::class, 'deleteTask']);
    Route::post('/tasks/{task}/activities', [W::class, 'createActivity']);
    Route::post('/tasks/{task}/activities/reorder', [W::class, 'reorderActivities']);
    Route::patch('/activities/{activity}', [W::class, 'updateActivity']);
    Route::delete('/activities/{activity}', [W::class, 'deleteActivity']);
    Route::post('/activities/{activity}/comments', [W::class, 'createComment']);
    Route::patch('/comments/{comment}', [W::class, 'updateComment']);
    Route::delete('/comments/{comment}', [W::class, 'deleteComment']);
    Route::post('/images', [W::class, 'uploadImage']);

    Route::get('/daily-list', [D::class, 'index']);
    Route::post('/daily-list', [D::class, 'store']);
    Route::post('/daily-list/carry', [D::class, 'carry']);
    Route::patch('/daily-list/{dailyEntry}', [D::class, 'update']);
    Route::delete('/daily-list/{dailyEntry}', [D::class, 'destroy']);
    Route::patch('/daily-routines/{dailyRoutine}/stop', [D::class, 'stopRoutine']);

});
