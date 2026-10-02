<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditEvent;
use App\Models\ClasseAcademique;
use App\Models\Inscription;
use App\Models\Oustaz;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ClasseController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'nom' => [
                'required', 'string', 'max:120',
                Rule::unique('classes_academiques', 'nom')->where('annee_scolaire', $request->input('annee_scolaire')),
            ],
            'niveau' => ['required', 'string', 'max:80'],
            'annee_scolaire' => ['required', 'regex:/^\d{4}-\d{4}$/'],
            'oustaz_id' => ['required', 'integer', 'exists:oustazs,id'],
            'inscription_ids' => ['sometimes', 'array'],
            'inscription_ids.*' => ['required', 'integer', 'distinct', 'exists:inscriptions,id'],
        ]);

        $classe = DB::transaction(function () use ($data, $request): ClasseAcademique {
            $oustaz = Oustaz::with('user')->findOrFail($data['oustaz_id']);
            if (! $oustaz->user || ! $oustaz->user->estActif() || $oustaz->user->role->value !== 'oustaz') {
                throw ValidationException::withMessages([
                    'oustaz_id' => ['L’Oustaz doit être actif et avoir le rôle Oustaz.'],
                ]);
            }

            $inscriptionIds = $data['inscription_ids'] ?? [];
            $inscriptions = Inscription::query()
                ->whereIn('id', $inscriptionIds)
                ->lockForUpdate()
                ->get();

            if (
                $inscriptions->count() !== count($inscriptionIds)
                || $inscriptions->contains(fn (Inscription $inscription) => $inscription->statut !== 'active'
                    || $inscription->annee_scolaire !== $data['annee_scolaire']
                    || $inscription->classe_academique_id !== null)
            ) {
                throw ValidationException::withMessages([
                    'inscription_ids' => ['Toutes les inscriptions doivent être actives, non affectées et de la même année scolaire.'],
                ]);
            }

            $classe = ClasseAcademique::create([
                'nom' => $data['nom'],
                'niveau' => $data['niveau'],
                'annee_scolaire' => $data['annee_scolaire'],
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

    public function mine(Request $request): JsonResponse
    {
        $oustaz = Oustaz::with('classes.inscriptions.eleve')
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
