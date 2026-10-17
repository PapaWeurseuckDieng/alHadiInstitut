<?php

namespace App\Http\Controllers\Api;

use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\AuditEvent;
use App\Models\Oustaz;
use App\Models\Tuteur;
use App\Models\User;
use App\Services\PhotoProfil;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminUserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'include_archived' => ['sometimes', 'boolean'],
            'role' => ['sometimes', Rule::in([Role::Admin->value, Role::Tuteur->value, Role::Oustaz->value])],
            'q' => ['nullable', 'string', 'max:120'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);

        $query = User::with(['tuteur', 'oustaz'])
            ->whereIn('role', [Role::Admin->value, Role::Tuteur->value, Role::Oustaz->value])
            ->when(! ($filters['include_archived'] ?? false), fn ($builder) => $builder->where('is_archived', false))
            ->when($filters['role'] ?? null, fn ($builder, $role) => $builder->where('role', $role))
            ->when($filters['q'] ?? null, function ($builder, $search): void {
                $builder->where(fn ($users) => $users
                    ->where('nom', 'like', '%'.$search.'%')
                    ->orWhere('prenom', 'like', '%'.$search.'%')
                    ->orWhere('telephone', 'like', '%'.$search.'%'));
            });

        $page = $query->orderBy('id')->paginate(20);

        return response()->json([
            'data' => $page->getCollection()->map(fn (User $user) => [
                ...(new UserResource($user))->resolve($request),
                'profil_id' => $user->tuteur?->id ?? $user->oustaz?->id,
            ]),
            'pagination' => [
                'page' => $page->currentPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    /**
     * POST /v1/admin/users : crée un compte Admin, Tuteur ou Oustaz (mot de passe temporaire « passer »).
     * JSON, ou multipart/form-data avec une photo facultative (champ « photo »).
     */
    public function store(Request $request, PhotoProfil $photos): JsonResponse
    {
        if (is_string($request->input('telephone'))) {
            $request->merge(['telephone' => User::normaliserTelephone($request->input('telephone'))]);
        }

        $data = $request->validate([
            'nom' => ['required', 'string', 'max:120'],
            'prenom' => ['required', 'string', 'max:120'],
            'sexe' => ['required', Rule::in(['M', 'F'])],
            'telephone' => ['required', 'string', 'max:16', 'regex:/^\+[1-9]\d{7,14}$/', 'unique:users,telephone'],
            'adresse' => ['nullable', 'string', 'max:255'],
            'date_naissance' => ['nullable', 'date', 'before_or_equal:today'],
            'role' => ['required', Rule::in([Role::Admin->value, Role::Tuteur->value, Role::Oustaz->value])],
            'profession' => ['nullable', 'string', 'max:120'],
            'specialite' => ['nullable', 'string', 'max:120'],
            'photo' => ['sometimes', 'nullable', ...PhotoProfil::REGLES],
        ], PhotoProfil::messages());

        // Photo enregistrée avant la transaction, supprimée si la création échoue
        $photoPath = $request->hasFile('photo') ? $photos->enregistrer($request->file('photo'), 'comptes') : null;
        try {
            $user = $this->createUser($data, $request, $photoPath);
        } catch (\Throwable $exception) {
            $photos->supprimer($photoPath);
            throw $exception;
        }
        $user->load(['tuteur', 'oustaz']);
        $userData = (new UserResource($user))->resolve($request);
        $userData['profil_id'] = $user->tuteur?->id ?? $user->oustaz?->id;

        return response()->json([
            'message' => 'Compte créé.',
            'data' => $userData,
        ], 201);
    }

    private function createUser(array $data, Request $request, ?string $photoPath): User
    {
        return DB::transaction(function () use ($data, $request, $photoPath): User {
            $user = User::create([
                'matricule' => 'USR-'.Str::upper(Str::random(12)),
                'nom' => $data['nom'],
                'prenom' => $data['prenom'],
                'sexe' => $data['sexe'],
                'telephone' => $data['telephone'],
                'adresse' => $data['adresse'] ?? null,
                'date_naissance' => $data['date_naissance'] ?? null,
                'password' => 'passer',
                'must_change_password' => true,
                'role' => $data['role'],
                'statut' => 'actif',
                'photo' => $photoPath,
            ]);

            if ($user->role === Role::Tuteur) {
                Tuteur::create([
                    'user_id' => $user->id,
                    'profession' => $data['profession'] ?? null,
                ]);
            } elseif ($user->role === Role::Oustaz) {
                Oustaz::create([
                    'user_id' => $user->id,
                    'specialite' => $data['specialite'] ?? null,
                ]);
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
    }

    /**
     * POST /v1/admin/users/{userId}/photo : ajoute ou remplace la photo du compte (multipart, champ « photo »).
     */
    public function updatePhoto(Request $request, int $userId, PhotoProfil $photos): JsonResponse
    {
        $user = User::where('is_archived', false)->findOrFail($userId);
        $request->validate(['photo' => ['required', ...PhotoProfil::REGLES]], [
            ...PhotoProfil::messages(),
            'photo.required' => 'Choisissez une photo.',
        ]);

        $ancienne = $user->photo;
        $user->forceFill(['photo' => $photos->enregistrer($request->file('photo'), 'comptes')])->save();
        $photos->supprimer($ancienne);

        AuditEvent::create([
            'actor_user_id' => $request->user()->id,
            'action' => 'user.photo_updated',
            'entity_type' => 'user',
            'entity_id' => $user->id,
            'metadata' => [],
            'created_at' => now(),
        ]);

        return response()->json([
            'message' => 'Photo enregistrée.',
            'data' => ['id' => $user->id, 'photo' => PhotoProfil::url($user->photo)],
        ]);
    }

    /**
     * POST /v1/admin/users/{userId}/reset-password : remet le mot de passe temporaire « passer »
     * (oubli du mot de passe). Le titulaire est déconnecté partout et devra le changer
     * à sa prochaine connexion.
     */
    public function resetPassword(Request $request, int $userId): JsonResponse
    {
        $user = User::findOrFail($userId);
        if ($user->id === $request->user()->id) {
            throw ValidationException::withMessages([
                'user' => ['Vous ne pouvez pas réinitialiser votre propre mot de passe.'],
            ]);
        }
        if ($user->is_archived) {
            throw ValidationException::withMessages([
                'user' => ['Ce compte est archivé : son mot de passe ne peut pas être réinitialisé.'],
            ]);
        }

        DB::transaction(function () use ($user, $request): void {
            $user->forceFill([
                'password' => 'passer',
                'must_change_password' => true,
            ])->save();
            $user->tokens()->delete();

            AuditEvent::create([
                'actor_user_id' => $request->user()->id,
                'action' => 'user.password_reset',
                'entity_type' => 'user',
                'entity_id' => $user->id,
                'metadata' => [],
                'created_at' => now(),
            ]);
        });

        return response()->json([
            'message' => 'Mot de passe réinitialisé. L’utilisateur se connectera avec le mot de passe temporaire et devra le changer.',
            'data' => [
                'id' => $user->id,
                'must_change_password' => true,
            ],
        ]);
    }

    public function show(Request $request, int $userId): JsonResponse
    {
        $request->validate(['include_archived' => ['sometimes', 'boolean']]);
        $user = User::with(['tuteur', 'oustaz'])
            ->when(! $request->boolean('include_archived'), fn ($query) => $query->where('is_archived', false))
            ->findOrFail($userId);

        return response()->json([
            'data' => [
                ...(new UserResource($user))->resolve($request),
                'profil_id' => $user->tuteur?->id ?? $user->oustaz?->id,
            ],
        ]);
    }

    public function update(Request $request, int $userId): JsonResponse
    {
        $user = User::with(['tuteur', 'oustaz'])->findOrFail($userId);
        if (is_string($request->input('telephone'))) {
            $request->merge(['telephone' => User::normaliserTelephone($request->input('telephone'))]);
        }
        $data = $request->validate([
            'nom' => ['sometimes', 'required', 'string', 'max:120'],
            'prenom' => ['sometimes', 'required', 'string', 'max:120'],
            'sexe' => ['sometimes', 'required', Rule::in(['M', 'F'])],
            'telephone' => [
                'sometimes', 'required', 'string', 'max:16', 'regex:/^\+[1-9]\d{7,14}$/',
                Rule::unique('users', 'telephone')->ignore($user->id),
            ],
            'adresse' => ['sometimes', 'nullable', 'string', 'max:255'],
            'date_naissance' => ['sometimes', 'nullable', 'date', 'before_or_equal:today'],
            'role' => ['sometimes', 'required', Rule::in([Role::Admin->value, Role::Tuteur->value, Role::Oustaz->value])],
            'statut' => ['sometimes', 'required', Rule::in(['actif', 'inactif'])],
            'is_active' => ['sometimes', 'boolean'],
            'profession' => ['sometimes', 'nullable', 'string', 'max:120'],
            'specialite' => ['sometimes', 'nullable', 'string', 'max:120'],
        ]);

        DB::transaction(function () use ($data, $user): void {
            $oldRole = $user->role;
            $newRole = Role::from($data['role'] ?? $oldRole->value);

            if ($newRole !== $oldRole) {
                if ($user->tuteur && $user->tuteur->eleves()->exists()) {
                    throw ValidationException::withMessages([
                        'role' => ['Le rôle ne peut pas être modifié tant que des élèves sont rattachés à ce tuteur.'],
                    ]);
                }

                if ($user->oustaz && $user->oustaz->classes()->exists()) {
                    throw ValidationException::withMessages([
                        'role' => ['Le rôle ne peut pas être modifié tant que cet Oustaz est affecté à une classe.'],
                    ]);
                }

                $user->tuteur?->delete();
                $user->oustaz?->delete();
                $user->role = $newRole;
                if ($newRole === Role::Tuteur) {
                    $user->tuteur()->create(['profession' => $data['profession'] ?? null]);
                } elseif ($newRole === Role::Oustaz) {
                    $user->oustaz()->create(['specialite' => $data['specialite'] ?? null]);
                }
            } elseif ($newRole === Role::Tuteur && array_key_exists('profession', $data)) {
                $user->tuteur?->update(['profession' => $data['profession']]);
            } elseif ($newRole === Role::Oustaz && array_key_exists('specialite', $data)) {
                $user->oustaz?->update(['specialite' => $data['specialite']]);
            }

            foreach (['nom', 'prenom', 'sexe', 'telephone', 'adresse', 'date_naissance'] as $attribute) {
                if (array_key_exists($attribute, $data)) {
                    $user->{$attribute} = $data[$attribute];
                }
            }
            if (isset($data['statut']) || array_key_exists('is_active', $data)) {
                $user->statut = $data['statut'] ?? ($data['is_active'] ? 'actif' : 'inactif');
            }
            $user->save();
        });

        $user->load(['tuteur', 'oustaz']);

        return response()->json([
            'message' => 'Compte modifié.',
            'data' => [
                ...(new UserResource($user))->resolve($request),
                'profil_id' => $user->tuteur?->id ?? $user->oustaz?->id,
            ],
        ]);
    }

    public function archive(Request $request, int $userId): JsonResponse
    {
        $data = $request->validate([
            'motif' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        $user = DB::transaction(function () use ($data, $request, $userId): User {
            $user = User::query()->lockForUpdate()->findOrFail($userId);
            if ($user->id === $request->user()->id) {
                throw ValidationException::withMessages([
                    'user' => ['Vous ne pouvez pas archiver votre propre compte.'],
                ]);
            }

            if (! $user->is_archived) {
                $user->forceFill([
                    'is_archived' => true,
                    'archived_at' => Carbon::now(),
                    'statut' => 'inactif',
                ])->save();
                $user->tokens()->delete();

                AuditEvent::create([
                    'actor_user_id' => $request->user()->id,
                    'action' => 'user.archived',
                    'entity_type' => 'user',
                    'entity_id' => $user->id,
                    'metadata' => ['motif' => $data['motif'] ?? null],
                    'created_at' => now(),
                ]);
            }

            return $user;
        });

        return response()->json([
            'message' => 'Compte archivé.',
            'data' => [
                'id' => $user->id,
                'is_archived' => $user->is_archived,
                'archived_at' => $user->archived_at?->toIso8601String(),
            ],
        ]);
    }

    /**
     * GET /v1/admin/tuteurs?q= : recherche d'un tuteur actif par prénom, nom ou téléphone (20 résultats),
     * pour le rattacher à un élève. Les homonymes sont signalés : le téléphone et les enfants les distinguent.
     * exclure_eleve_id : écarte les tuteurs déjà rattachés à cet élève.
     */
    public function tuteurs(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'exclure_eleve_id' => ['nullable', 'integer'],
        ]);
        $mots = preg_split('/\s+/', trim($data['q'] ?? ''), -1, PREG_SPLIT_NO_EMPTY);
        $actifs = fn ($users) => $users->where('role', 'tuteur')->where('statut', 'actif')->where('is_archived', false);

        $users = User::query()
            ->tap($actifs)
            ->whereHas('tuteur', fn ($tuteurs) => $tuteurs->when(
                $data['exclure_eleve_id'] ?? null,
                fn ($query, $eleveId) => $query->whereDoesntHave('eleves', fn ($eleves) => $eleves->where('eleves.id', $eleveId)),
            ))
            ->where(function ($query) use ($mots) {
                // Chaque mot doit se retrouver dans le prénom, le nom ou le numéro
                foreach ($mots as $mot) {
                    $like = '%'.addcslashes($mot, '%_\\').'%';
                    $chiffres = preg_replace('/\D/', '', $mot);
                    $query->where(fn ($champ) => $champ->where('prenom', 'like', $like)->orWhere('nom', 'like', $like)
                        ->when(strlen($chiffres) >= 3, fn ($tel) => $tel->orWhere('telephone', 'like', '%'.$chiffres.'%')));
                }
            })
            ->with(['tuteur.eleves' => fn ($eleves) => $eleves->where('eleves.is_archived', false)])
            ->orderBy('prenom')->orderBy('nom')
            ->limit(20)
            ->get();

        // Homonymes : même prénom et même nom (insensible à la casse) parmi tous les tuteurs actifs
        $cle = fn ($prenom, $nom) => mb_strtolower(trim($prenom).'|'.trim($nom));
        $memesNoms = $users->isEmpty() ? collect() : User::query()->tap($actifs)
            ->where(fn ($query) => $users->each(fn (User $user) => $query->orWhere(fn ($meme) => $meme->where('prenom', $user->prenom)->where('nom', $user->nom))))
            ->get(['prenom', 'nom'])
            ->countBy(fn (User $user) => $cle($user->prenom, $user->nom));

        return response()->json(['data' => $users->map(fn (User $user) => [
            'id' => $user->tuteur->id,
            'user_id' => $user->id,
            'prenom' => $user->prenom,
            'nom' => $user->nom,
            'telephone' => $user->telephone,
            'photo' => PhotoProfil::url($user->photo),
            'enfants' => $user->tuteur->eleves->map(fn ($eleve) => trim($eleve->prenom.' '.$eleve->nom))->values(),
            'homonyme' => ($memesNoms[$cle($user->prenom, $user->nom)] ?? 0) > 1,
        ])->values()]);
    }
}
