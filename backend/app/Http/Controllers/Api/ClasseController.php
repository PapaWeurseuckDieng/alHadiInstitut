<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditEvent;
use App\Models\ClasseAcademique;
use App\Models\Inscription;
use App\Models\Oustaz;
use App\Support\AnneeScolaire;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ClasseController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'annee_scolaire' => ['sometimes', 'regex:/^\d{4}-\d{4}$/'],
            'include_archived' => ['sometimes', 'boolean'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);
        if (
            $request->user()->role->value !== 'admin'
            && (($filters['include_archived'] ?? false) || isset($filters['annee_scolaire']))
        ) {
            return response()->json(['message' => 'Seul un administrateur peut consulter les archives ou les années antérieures.'], 403);
        }
        $year = $filters['annee_scolaire'] ?? AnneeScolaire::courante();

        $query = ClasseAcademique::with('oustaz.user')
            ->withCount(['inscriptions' => fn ($builder) => $builder
                ->where('is_archived', false)
                ->where('statut', 'active')
                ->whereHas('eleve', fn ($eleves) => $eleves->where('is_archived', false))])
            ->where('annee_scolaire', $year)
            ->when(! ($filters['include_archived'] ?? false), fn ($builder) => $builder->where('is_archived', false));
        if ($request->user()->role->value === 'oustaz') {
            $oustazId = Oustaz::where('user_id', $request->user()->id)->value('id');
            $query->where('oustaz_id', $oustazId ?? 0);
        }

        $page = $query->orderBy('nom')->paginate(20);

        return response()->json([
            'data' => $page->getCollection()->map(fn (ClasseAcademique $classe) => [
                'id' => $classe->id,
                'nom' => $classe->nom,
                'niveau' => $classe->niveau,
                'annee_scolaire' => $classe->annee_scolaire,
                'oustaz_id' => $classe->oustaz_id,
                'oustaz' => $classe->oustaz?->user
                    ? trim($classe->oustaz->user->prenom.' '.$classe->oustaz->user->nom)
                    : null,
                'effectif' => $classe->inscriptions_count,
                'is_archived' => $classe->is_archived,
            ]),
            'pagination' => [
                'page' => $page->currentPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'nom' => ['required', 'string', 'max:120'],
            'niveau' => ['required', 'string', 'max:80'],
            'annee_scolaire' => ['prohibited'],
            'oustaz_id' => ['required', 'integer', 'exists:oustazs,id'],
            'inscription_ids' => ['sometimes', 'array'],
            'inscription_ids.*' => ['required', 'integer', 'distinct', 'exists:inscriptions,id'],
        ]);
        $schoolYear = AnneeScolaire::courante();
        if (ClasseAcademique::where('nom', $data['nom'])->where('annee_scolaire', $schoolYear)->exists()) {
            throw ValidationException::withMessages([
                'nom' => ['Une classe portant ce nom existe déjà pour cette année scolaire.'],
            ]);
        }

        $classe = DB::transaction(function () use ($data, $request, $schoolYear): ClasseAcademique {
            $oustaz = Oustaz::with('user')->findOrFail($data['oustaz_id']);
            if (! $oustaz->user || ! $oustaz->user->estActif() || $oustaz->user->role->value !== 'oustaz') {
                throw ValidationException::withMessages([
                    'oustaz_id' => ['L’Oustaz doit être actif et avoir le rôle Oustaz.'],
                ]);
            }

            $inscriptionIds = $data['inscription_ids'] ?? [];
            $inscriptions = Inscription::query()
                ->whereIn('id', $inscriptionIds)
                ->where('is_archived', false)
                ->lockForUpdate()
                ->get();

            if (
                $inscriptions->count() !== count($inscriptionIds)
                || $inscriptions->contains(fn (Inscription $inscription) => $inscription->statut !== 'active'
                    || $inscription->annee_scolaire !== $schoolYear
                    || $inscription->classe_academique_id !== null)
            ) {
                throw ValidationException::withMessages([
                    'inscription_ids' => ['Toutes les inscriptions doivent être actives, non affectées et de la même année scolaire.'],
                ]);
            }

            $classe = ClasseAcademique::create([
                'nom' => $data['nom'],
                'niveau' => $data['niveau'],
                'annee_scolaire' => $schoolYear,
                'oustaz_id' => $oustaz->id,
                'effectif' => count($inscriptionIds),
                'statut' => 'active',
            ]);

            if ($inscriptionIds !== []) {
                Inscription::whereIn('id', $inscriptionIds)->update([
                    'classe_academique_id' => $classe->id,
                ]);
            }

            AuditEvent::create([
                'actor_user_id' => $request->user()->id,
                'action' => 'classe.created',
                'entity_type' => 'classe',
                'entity_id' => $classe->id,
                'metadata' => [
                    'oustaz_id' => $oustaz->id,
                    'inscription_ids' => $inscriptionIds,
                ],
                'created_at' => now(),
            ]);

            return $classe;
        });

        $classe->load(['oustaz.user', 'inscriptions.eleve']);

        return response()->json([
            'message' => 'Classe créée et élèves affectés.',
            'data' => [
                'id' => $classe->id,
                'nom' => $classe->nom,
                'niveau' => $classe->niveau,
                'annee_scolaire' => $classe->annee_scolaire,
                'oustaz' => [
                    'id' => $classe->oustaz->id,
                    'nom' => $classe->oustaz->user->nom,
                    'prenom' => $classe->oustaz->user->prenom,
                    'telephone' => $classe->oustaz->user->telephone,
                ],
                'effectif' => $classe->inscriptions->count(),
                'eleves' => $classe->inscriptions->map(fn (Inscription $inscription) => [
                    'inscription_id' => $inscription->id,
                    'eleve_id' => $inscription->eleve->id,
                    'matricule' => $inscription->eleve->matricule,
                    'nom_complet' => $inscription->eleve->prenom.' '.$inscription->eleve->nom,
                ]),
            ],
        ], 201);
    }

    public function update(Request $request, int $classeId): JsonResponse
    {
        $classe = ClasseAcademique::where('is_archived', false)->findOrFail($classeId);
        $data = $request->validate([
            'nom' => ['sometimes', 'required', 'string', 'max:120'],
            'niveau' => ['sometimes', 'required', 'string', 'max:80'],
            'oustaz_id' => ['sometimes', 'required', 'integer', 'exists:oustazs,id'],
            'annee_scolaire' => ['prohibited'],
        ]);

        DB::transaction(function () use ($classe, $data, $request): void {
            if (isset($data['oustaz_id'])) {
                $oustaz = Oustaz::with('user')->findOrFail($data['oustaz_id']);
                if (! $oustaz->user || ! $oustaz->user->estActif() || $oustaz->user->role->value !== 'oustaz') {
                    throw ValidationException::withMessages([
                        'oustaz_id' => ['L’Oustaz doit être actif et avoir le rôle Oustaz.'],
                    ]);
                }
                $classe->oustaz_id = $oustaz->id;
            }

            foreach (['nom', 'niveau'] as $field) {
                if (array_key_exists($field, $data)) {
                    $classe->{$field} = $data[$field];
                }
            }
            $classe->save();

            AuditEvent::create([
                'actor_user_id' => $request->user()->id,
                'action' => 'classe.updated',
                'entity_type' => 'classe',
                'entity_id' => $classe->id,
                'metadata' => $data,
                'created_at' => now(),
            ]);
        });

        return response()->json([
            'message' => 'Classe modifiée.',
            'data' => [
                'id' => $classe->id,
                'nom' => $classe->nom,
                'niveau' => $classe->niveau,
                'annee_scolaire' => $classe->annee_scolaire,
                'oustaz_id' => $classe->oustaz_id,
            ],
        ]);
    }

    public function students(Request $request, int $classeId): JsonResponse
    {
        $filters = $request->validate([
            'include_archived' => ['sometimes', 'boolean'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);
        if ($request->user()->role->value !== 'admin' && ($filters['include_archived'] ?? false)) {
            return response()->json(['message' => 'Seul un administrateur peut consulter les archives.'], 403);
        }
        $classe = ClasseAcademique::query()
            ->when(! ($filters['include_archived'] ?? false), fn ($query) => $query->where('is_archived', false))
            ->findOrFail($classeId);
        if (
            $request->user()->role->value === 'oustaz'
            && Oustaz::where('user_id', $request->user()->id)->value('id') !== $classe->oustaz_id
        ) {
            return response()->json(['message' => 'Vous n’êtes pas autorisé à consulter cette classe.'], 403);
        }

        $page = Inscription::with('eleve')
            ->where('classe_academique_id', $classe->id)
            ->where('annee_scolaire', $classe->annee_scolaire)
            ->where('statut', 'active')
            ->where('is_archived', false)
            ->when(! ($filters['include_archived'] ?? false), fn ($builder) => $builder->whereHas(
                'eleve',
                fn ($eleves) => $eleves->where('is_archived', false),
            ))
            ->orderBy('id')
            ->paginate(20);

        return response()->json([
            'data' => $page->getCollection()->map(fn (Inscription $inscription) => [
                'id' => $inscription->eleve->id,
                'matricule' => $inscription->eleve->matricule,
                'nom' => $inscription->eleve->nom,
                'prenom' => $inscription->eleve->prenom,
                'sexe' => $inscription->eleve->sexe,
                'inscription_id' => $inscription->id,
            ]),
            'pagination' => [
                'page' => $page->currentPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    public function mine(Request $request): JsonResponse
    {
        $year = AnneeScolaire::courante();
        $oustaz = Oustaz::with(['classes' => fn ($query) => $query
            ->where('annee_scolaire', $year)
            ->where('is_archived', false)
            ->with(['inscriptions' => fn ($inscriptions) => $inscriptions
                ->where('is_archived', false)
                ->whereHas('eleve', fn ($eleves) => $eleves->where('is_archived', false))
                ->with('eleve')])])
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        return response()->json([
            'data' => $oustaz->classes->map(fn (ClasseAcademique $classe) => [
                'id' => $classe->id,
                'nom' => $classe->nom,
                'niveau' => $classe->niveau,
                'annee_scolaire' => $classe->annee_scolaire,
                'eleves' => $classe->inscriptions->map(fn (Inscription $inscription) => [
                    'id' => $inscription->eleve->id,
                    'matricule' => $inscription->eleve->matricule,
                    'nom' => $inscription->eleve->nom,
                    'prenom' => $inscription->eleve->prenom,
                ]),
            ]),
        ]);
    }
}
