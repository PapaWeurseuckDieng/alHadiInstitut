<?php

namespace App\Http\Controllers\Api;

use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\AuditEvent;
use App\Models\Oustaz;
use App\Models\Tuteur;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminUserController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        if (is_string($request->input('telephone'))) {
            $request->merge(['telephone' => User::normaliserTelephone($request->input('telephone'))]);
        }

        $data = $request->validate([
            'nom' => ['required', 'string', 'max:120'],
            'prenom' => ['required', 'string', 'max:120'],
            'telephone' => ['required', 'string', 'max:16', 'regex:/^\+[1-9]\d{7,14}$/', 'unique:users,telephone'],
            'adresse' => ['nullable', 'string', 'max:255'],
            'role' => ['required', Rule::in([Role::Admin->value, Role::Tuteur->value, Role::Oustaz->value])],
        ]);

        $user = DB::transaction(function () use ($data, $request): User {
            $user = User::create([
                'matricule' => 'USR-'.Str::upper(Str::random(12)),
                'nom' => $data['nom'],
                'prenom' => $data['prenom'],
                'telephone' => $data['telephone'],
                'adresse' => $data['adresse'] ?? null,
                'password' => 'passer',
                'must_change_password' => true,
                'role' => $data['role'],
                'statut' => 'actif',
            ]);

            if ($user->role === Role::Tuteur) {
                Tuteur::create(['user_id' => $user->id]);
            } elseif ($user->role === Role::Oustaz) {
                Oustaz::create(['user_id' => $user->id]);
            }

            AuditEvent::create([
                'actor_user_id' => $request->user()->id,
                'action' => 'user.created',
                'entity_type' => 'user',
                'entity_id' => $user->id,
                'metadata' => ['role' => $user->role->value],
                'created_at' => now(),
            ]);

            return $user;
        });
        $user->load(['tuteur', 'oustaz']);
        $userData = (new UserResource($user))->resolve($request);
        $userData['profil_id'] = $user->tuteur?->id ?? $user->oustaz?->id;

        return response()->json([
            'message' => 'Compte créé.',
            'data' => $userData,
        ], 201);
    }
}
