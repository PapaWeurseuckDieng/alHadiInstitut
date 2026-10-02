<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AdminUserController;
use App\Http\Controllers\Api\ClasseController;
use App\Http\Controllers\Api\EleveController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function () {
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:login');

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('logout', [AuthController::class, 'logout']);
        Route::get('me', [AuthController::class, 'me'])->middleware('password.changed');
    });
});

Route::prefix('v1')->group(function () {
    Route::prefix('auth')->group(function () {
        Route::post('login', [AuthController::class, 'login'])->middleware('throttle:login');
        Route::middleware(['auth:sanctum', 'password.change-token'])->post(
            'change-password',
            [AuthController::class, 'changePassword'],
        );
        Route::middleware('auth:sanctum')->group(function () {
            Route::post('logout', [AuthController::class, 'logout']);
            Route::get('me', [AuthController::class, 'me'])->middleware('password.changed');
        });
    });

    Route::middleware(['auth:sanctum', 'password.changed'])->group(function () {
        Route::middleware('role:admin')->group(function () {
            Route::post('admin/users', [AdminUserController::class, 'store']);
            Route::post('eleves', [EleveController::class, 'store']);
            Route::post('classes', [ClasseController::class, 'store']);
        });
        Route::middleware('role:tuteur')->get('tuteur/me/eleves', [EleveController::class, 'mine']);
        Route::middleware('role:oustaz')->get('oustaz/me/classes', [ClasseController::class, 'mine']);
    });
});
