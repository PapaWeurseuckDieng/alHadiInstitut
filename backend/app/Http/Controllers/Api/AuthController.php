<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Resources\UserResource;
use App\Models\AuditEvent;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    /**
     * Connexion par numéro de téléphone + mot de passe (tous les rôles).
     */
    public function login(LoginRequest $request): JsonResponse
    {
        $user = User::where('telephone', $request->validated('telephone'))->first();

        if (! $user || ! Hash::check($request->validated('password'), $user->password)) {
            return response()->json([
                'message' => 'Numéro de téléphone ou mot de passe incorrect.',
            ], 401);
        }

        if (! $user->estActif()) {
            return response()->json([
                'message' => 'Ce compte est désactivé. Veuillez contacter l\'administration.',
            ], 403);
        }

        if ($user->role->value === 'eleve') {
            return response()->json([
                'message' => 'Les élèves ne disposent pas de compte de connexion.',
            ], 403);
        }

        $mustChangePassword = $user->must_change_password || $request->validated('password') === 'passer';
        if ($mustChangePassword && ! $user->must_change_password) {
            $user->forceFill(['must_change_password' => true])->save();
        }
        $newToken = $user->createToken(
            $mustChangePassword ? 'password-change' : 'api',
            $mustChangePassword ? ['password:change'] : ['*'],
        );
        if ($mustChangePassword) {
            $newToken->accessToken->forceFill(['expires_at' => now()->addMinutes(15)])->save();
        }
        $token = $newToken->plainTextToken;

        if ($mustChangePassword) {
            return response()->json([
                'message' => 'Changement de mot de passe obligatoire.',
                'token' => $token,
                'token_type' => 'Bearer',
                'must_change_password' => true,
                'next_action' => 'change_password',
                'user' => new UserResource($user),
            ]);
        }

        return response()->json([
            'message' => 'Connexion réussie.',
            'token' => $token,
            'token_type' => 'Bearer',
            'user' => new UserResource($user),
        ]);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'new_password' => [
                'required',
                'string',
                'min:6',
                'confirmed',
                'not_in:passer',
            ],
        ], [
            'new_password.confirmed' => 'La confirmation du mot de passe ne correspond pas.',
            'new_password.not_in' => 'Le nouveau mot de passe ne peut pas être le mot de passe temporaire.',
        ]);

        $user = $request->user();
        DB::transaction(function () use ($user, $validated): void {
            $user->forceFill([
                'password' => $validated['new_password'],
                'must_change_password' => false,
            ])->save();
            AuditEvent::create([
                'actor_user_id' => $user->id,
                'action' => 'user.password_changed',
                'entity_type' => 'user',
                'entity_id' => $user->id,
                'metadata' => [],
                'created_at' => now(),
            ]);
        });

        $user->tokens()->delete();

        return response()->json([
            'message' => 'Mot de passe modifié. Vous pouvez vous connecter.',
        ]);
    }

    public function me(Request $request): UserResource
    {
        return new UserResource($request->user());
    }

    /**
     * Révoque uniquement le token utilisé pour la requête.
     */
    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Déconnexion réussie.']);
    }
}
