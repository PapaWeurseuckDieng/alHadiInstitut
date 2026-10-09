<?php

use App\Http\Controllers\Api\AdminUserController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ClasseController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\EleveController;
use App\Http\Controllers\Api\InscriptionController;
use App\Http\Controllers\Api\PlanningController;
use App\Http\Controllers\Api\SuiviCoraniqueController;
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
            Route::get('admin/dashboard', [DashboardController::class, 'index']);
            Route::get('admin/eleve-du-mois', [SuiviCoraniqueController::class, 'eleveDuMois']);
            Route::get('admin/users', [AdminUserController::class, 'index']);
            Route::post('admin/users', [AdminUserController::class, 'store']);
            Route::get('admin/users/{userId}', [AdminUserController::class, 'show']);
            Route::patch('admin/users/{userId}', [AdminUserController::class, 'update']);
            Route::post('admin/users/{userId}/archive', [AdminUserController::class, 'archive']);
            Route::get('eleves', [EleveController::class, 'index']);
            Route::post('eleves', [EleveController::class, 'store']);
            Route::get('eleves/{eleveId}', [EleveController::class, 'show']);
            Route::patch('eleves/{eleveId}', [EleveController::class, 'update']);
            Route::post('eleves/{eleveId}/archive', [EleveController::class, 'archive']);
            Route::get('inscriptions-annuelles', [InscriptionController::class, 'index']);
            Route::post('inscriptions-annuelles', [InscriptionController::class, 'store']);
            Route::post('classes', [ClasseController::class, 'store']);
            Route::patch('classes/{classeId}', [ClasseController::class, 'update']);
        });
        Route::middleware('role:admin,oustaz')->group(function () {
            Route::get('classes', [ClasseController::class, 'index']);
            Route::get('classes/{classeId}/eleves', [ClasseController::class, 'students']);
            Route::get('classes/{classeId}/planning', [PlanningController::class, 'index']);
            Route::post('classes/{classeId}/planning', [PlanningController::class, 'store']);
            Route::patch('plannings/{planningId}', [PlanningController::class, 'update']);
            Route::get('plannings/{planningId}/presences', [PlanningController::class, 'presences']);
            Route::put('plannings/{planningId}/presences', [PlanningController::class, 'savePresences']);
            Route::get('fiches-hebdomadaires', [SuiviCoraniqueController::class, 'index']);
            Route::post('fiches-hebdomadaires', [SuiviCoraniqueController::class, 'store']);
            Route::get('fiches-hebdomadaires/{ficheId}', [SuiviCoraniqueController::class, 'show']);
            Route::patch('fiches-hebdomadaires/{ficheId}', [SuiviCoraniqueController::class, 'update']);
            Route::put('fiches-hebdomadaires/{ficheId}/jours/{jour}', [SuiviCoraniqueController::class, 'saveDay']);
            Route::post('fiches-hebdomadaires/{ficheId}/soumettre', [SuiviCoraniqueController::class, 'submit']);
            Route::post('eleves/{eleveId}/exemplarite', [SuiviCoraniqueController::class, 'evaluateExemplarite']);
        });
        Route::middleware('role:admin')->post(
            'fiches-hebdomadaires/{ficheId}/valider',
            [SuiviCoraniqueController::class, 'validateFiche'],
        );
        Route::middleware('role:admin,oustaz,tuteur')->get(
            'referentiels/sourates',
            [SuiviCoraniqueController::class, 'sourates'],
        );
        Route::middleware('role:tuteur')->get('tuteur/me/eleves', [EleveController::class, 'mine']);
        Route::middleware('role:tuteur')->get('tuteur/enfants/{eleveId}/synthese', [EleveController::class, 'childSummary']);
        Route::middleware('role:oustaz')->get('oustaz/me/classes', [ClasseController::class, 'mine']);
    });
});
