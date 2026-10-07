<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditEvent;
use App\Models\ClasseAcademique;
use App\Models\Eleve;
use App\Models\Inscription;
use App\Support\AnneeScolaire;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class InscriptionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'annee_scolaire' => ['sometimes', 'regex:/^\d{4}-\d{4}$/'],
            'classe_id' => ['sometimes', 'integer', 'min:1'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);
        $year = $filters['annee_scolaire'] ?? AnneeScolaire::courante();
        $page = Inscription::with('eleve')
            ->where('annee_scolaire', $year)
            ->where('is_archived', false)
            ->when($filters['classe_id'] ?? null, fn ($query, $classId) => $query->where('classe_academique_id', $classId))
            ->orderBy('id')
            ->paginate(20);

        return response()->json([
            'data' => $page->getCollection()->map(fn (Inscription $inscription) => [
                'id' => $inscription->id,
                'eleve_id' => $inscription->eleve_id,
                'classe_id' => $inscription->classe_academique_id,
                'annee_scolaire' => $inscription->annee_scolaire,
                'statut' => $inscription->statut,
                'eleve' => [
                    'matricule' => $inscription->eleve->matricule,
                    'nom' => $inscription->eleve->nom,
                    'prenom' => $inscription->eleve->prenom,
                ],
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
            'eleve_id' => ['required', 'integer', 'exists:eleves,id'],
            'classe_id' => ['required', 'integer', 'exists:classes_academiques,id'],
            'annee_scolaire' => ['prohibited'],
        ]);
        $year = AnneeScolaire::courante();

        $inscription = DB::transaction(function () use ($data, $request, $year): Inscription {
            $eleve = Eleve::where('is_archived', false)->lockForUpdate()->find($data['eleve_id']);
            if (! $eleve) {
                throw ValidationException::withMessages([
                    'eleve_id' => ['L’élève est introuvable ou archivé.'],
                ]);
            }

            if (Inscription::where('eleve_id', $eleve->id)->where('annee_scolaire', $year)->exists()) {
                throw ValidationException::withMessages([
                    'eleve_id' => ['Une inscription existe déjà pour cet élève pendant l’année scolaire courante.'],
                ]);
            }

            $classe = ClasseAcademique::whereKey($data['classe_id'])
                ->where('annee_scolaire', $year)
                ->where('statut', 'active')
                ->where('is_archived', false)
                ->first();
            if (! $classe) {
                throw ValidationException::withMessages([
                    'classe_id' => ['La classe doit être active et appartenir à l’année scolaire courante ('.$year.').'],
                ]);
            }

            $inscription = Inscription::create([
                'eleve_id' => $eleve->id,
                'classe_academique_id' => $classe->id,
                'annee_scolaire' => $year,
                'date_inscription' => now()->toDateString(),
                'statut' => 'active',
                'created_by' => $request->user()->id,
            ]);

            AuditEvent::create([
                'actor_user_id' => $request->user()->id,
                'action' => 'eleve.reenrolled',
                'entity_type' => 'inscription',
                'entity_id' => $inscription->id,
                'metadata' => ['eleve_id' => $eleve->id, 'classe_id' => $classe->id, 'annee_scolaire' => $year],
                'created_at' => now(),
            ]);

            return $inscription;
        });

        return response()->json([
            'message' => 'Réinscription créée pour l’année scolaire '.$year.'.',
            'data' => [
                'id' => $inscription->id,
                'eleve_id' => $inscription->eleve_id,
                'classe_id' => $inscription->classe_academique_id,
                'annee_scolaire' => $inscription->annee_scolaire,
                'statut' => $inscription->statut,
            ],
        ], 201);
    }
}
