<?php

use App\Http\Controllers\Api\AdminUserController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ClasseController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DepenseController;
use App\Http\Controllers\Api\DiplomeController;
use App\Http\Controllers\Api\EleveController;
use App\Http\Controllers\Api\InscriptionController;
use App\Http\Controllers\Api\PaiementController;
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
            Route::post('admin/users/{userId}/photo', [AdminUserController::class, 'updatePhoto'])->whereNumber('userId');
            Route::post('admin/users/{userId}/reset-password', [AdminUserController::class, 'resetPassword'])->whereNumber('userId');
            // Recherche d'un tuteur existant (prénom, nom ou téléphone) pour l'inscription
            Route::get('admin/tuteurs', [AdminUserController::class, 'tuteurs']);
            Route::get('eleves', [EleveController::class, 'index']);
            Route::post('eleves', [EleveController::class, 'store']);
            Route::get('eleves/{eleveId}', [EleveController::class, 'show']);
            Route::patch('eleves/{eleveId}', [EleveController::class, 'update']);
            Route::post('eleves/{eleveId}/archive', [EleveController::class, 'archive']);
            Route::post('eleves/{eleveId}/photo', [EleveController::class, 'updatePhoto'])->whereNumber('eleveId');
            // Tuteurs d'un élève existant : rattacher, modifier le lien, retirer (au moins un tuteur reste)
            Route::post('eleves/{eleveId}/tuteurs', [EleveController::class, 'attachTuteur'])->whereNumber('eleveId');
            Route::patch('eleves/{eleveId}/tuteurs/{tuteurId}', [EleveController::class, 'updateTuteurLink'])->whereNumber(['eleveId', 'tuteurId']);
            Route::post('eleves/{eleveId}/tuteurs/{tuteurId}/retirer', [EleveController::class, 'detachTuteur'])->whereNumber(['eleveId', 'tuteurId']);
            Route::get('inscriptions-annuelles', [InscriptionController::class, 'index']);
            Route::post('inscriptions-annuelles', [InscriptionController::class, 'store']);
            Route::post('inscriptions-annuelles/{inscriptionId}/changer-classe', [InscriptionController::class, 'changeClass'])->whereNumber('inscriptionId');
            // Frais d'inscription encaissés après l'inscription (montant fixé pour la classe)
            Route::post('inscriptions-annuelles/{inscriptionId}/frais-inscription', [InscriptionController::class, 'encaisserFrais'])->whereNumber('inscriptionId');
            Route::post('classes', [ClasseController::class, 'store']);
            Route::patch('classes/{classeId}', [ClasseController::class, 'update']);

            // Mensualités : paiements reçus au secrétariat, reçus, tarifs et rappels WhatsApp
            Route::get('paiements', [PaiementController::class, 'index']);
            Route::post('paiements', [PaiementController::class, 'store']);
            Route::get('paiements/tarifs', [PaiementController::class, 'tarifs']);
            Route::put('paiements/tarifs', [PaiementController::class, 'updateTarifs']);
            Route::get('paiements/rappels', [PaiementController::class, 'rappels']);
            Route::post('paiements/rappels', [PaiementController::class, 'envoyerRappels']);
            Route::post('paiements/{paiementId}/annuler', [PaiementController::class, 'annuler'])->whereNumber('paiementId');

            // Dépenses : saisie, correction tant qu'en attente, validation ou rejet (aucune suppression)
            Route::get('depenses', [DepenseController::class, 'index']);
            Route::post('depenses', [DepenseController::class, 'store']);
            Route::get('depenses/{depenseId}', [DepenseController::class, 'show'])->whereNumber('depenseId');
            Route::patch('depenses/{depenseId}', [DepenseController::class, 'update'])->whereNumber('depenseId');
            Route::post('depenses/{depenseId}/valider', [DepenseController::class, 'valider'])->whereNumber('depenseId');
            Route::post('depenses/{depenseId}/rejeter', [DepenseController::class, 'rejeter'])->whereNumber('depenseId');

            // Diplômes : délivrance, correction, annulation motivée (jamais de suppression)
            Route::get('diplomes', [DiplomeController::class, 'index']);
            Route::post('eleves/{eleveId}/diplomes', [DiplomeController::class, 'store'])->whereNumber('eleveId');
            Route::patch('diplomes/{diplomeId}', [DiplomeController::class, 'update'])->whereNumber('diplomeId');
            Route::post('diplomes/{diplomeId}/annuler', [DiplomeController::class, 'annuler'])->whereNumber('diplomeId');

            // Fiches hebdomadaires : l'administration consulte et peut rouvrir une fiche validée
            Route::post('fiches-hebdomadaires/{ficheId}/autoriser-modification', [SuiviCoraniqueController::class, 'allowChange'])->whereNumber('ficheId');
        });
        // Reçus et diplômes imprimables : Admin, ou tuteur rattaché à l'élève (vérifié par le contrôleur)
        Route::middleware('role:admin,tuteur')->group(function () {
            Route::get('paiements/{paiementId}/recu', [PaiementController::class, 'recu'])->whereNumber('paiementId');
            Route::get('inscriptions-annuelles/{inscriptionId}/recu', [InscriptionController::class, 'recu'])->whereNumber('inscriptionId');
            Route::get('diplomes/{diplomeId}', [DiplomeController::class, 'show'])->whereNumber('diplomeId');
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
            Route::get('fiches-hebdomadaires/{ficheId}', [SuiviCoraniqueController::class, 'show']);
            Route::post('eleves/{eleveId}/exemplarite', [SuiviCoraniqueController::class, 'evaluateExemplarite']);
            Route::get('classes/{classeId}/exemplarite', [SuiviCoraniqueController::class, 'classExemplarite'])->whereNumber('classeId');
        });
        // Fiches hebdomadaires : seul l'oustaz crée, remplit et valide ; il peut demander une réouverture
        Route::middleware('role:oustaz')->group(function () {
            Route::post('fiches-hebdomadaires', [SuiviCoraniqueController::class, 'store']);
            Route::patch('fiches-hebdomadaires/{ficheId}', [SuiviCoraniqueController::class, 'update']);
            Route::put('fiches-hebdomadaires/{ficheId}/jours/{jour}', [SuiviCoraniqueController::class, 'saveDay']);
            Route::post('fiches-hebdomadaires/{ficheId}/valider', [SuiviCoraniqueController::class, 'validateFiche']);
            Route::post('fiches-hebdomadaires/{ficheId}/demander-modification', [SuiviCoraniqueController::class, 'requestChange']);
        });
        Route::middleware('role:admin,oustaz,tuteur')->get(
            'referentiels/sourates',
            [SuiviCoraniqueController::class, 'sourates'],
        );
        Route::middleware('role:tuteur')->get('tuteur/me/eleves', [EleveController::class, 'mine']);
        Route::middleware('role:tuteur')->get('tuteur/me/paiements', [PaiementController::class, 'mine']);
        Route::middleware('role:tuteur')->get('tuteur/me/recus', [PaiementController::class, 'mesRecus']);
        Route::middleware('role:tuteur')->get('tuteur/enfants/{eleveId}/synthese', [EleveController::class, 'childSummary']);
        Route::middleware('role:oustaz')->get('oustaz/me/classes', [ClasseController::class, 'mine']);
    });
});
