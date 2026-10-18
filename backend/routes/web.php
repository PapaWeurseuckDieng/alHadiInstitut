<?php

use Illuminate\Support\Facades\Route;

// Backend = API seule (préfixe /api/v1, voir openapi.yaml) ; l'interface est l'application React (frontend/).
Route::get('/', fn () => response()->json([
    'application' => 'Institut Al-Hadi',
    'api' => url('/api/v1'),
    'documentation' => 'backend/openapi.yaml',
]));
