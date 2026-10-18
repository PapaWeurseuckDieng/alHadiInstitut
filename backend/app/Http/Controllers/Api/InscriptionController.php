<?php

namespace App\Http\Controllers\Api;

use App\Enums\ModePaiement;
use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Models\AuditEvent;
use App\Models\ClasseAcademique;
use App\Models\Eleve;
use App\Models\Inscription;
use App\Models\Tuteur;
use App\Services\FraisInscription;
use App\Support\AnneeScolaire;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
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

    /**
     * POST /v1/inscriptions-annuelles/{inscriptionId}/changer-classe : transfert de l'élève dans une
     * autre classe de la même année (ou affectation d'une inscription restée sans classe).
     * L'historique (appels, fiches, paiements déjà émis) reste attaché à l'élève ; l'opération est tracée.
     */
    public function changeClass(Request $request, int $inscriptionId): JsonResponse
    {
        $data = $request->validate([
            'classe_id' => ['required', 'integer', 'exists:classes_academiques,id'],
            'motif' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        $inscription = DB::transaction(function () use ($data, $request, $inscriptionId): Inscription {
            $inscription = Inscription::with('eleve')->lockForUpdate()->findOrFail($inscriptionId);
            if ($inscription->statut !== 'active' || $inscription->is_archived || $inscription->eleve?->is_archived) {
                throw ValidationException::withMessages(['inscription' => ['Seule l’inscription active d’un élève non archivé peut changer de classe.']]);
            }
            if ((int) $inscription->classe_academique_id === (int) $data['classe_id']) {
                throw ValidationException::withMessages(['classe_id' => ['L’élève est déjà dans cette classe.']]);
            }
            $classe = ClasseAcademique::whereKey($data['classe_id'])
                ->where('annee_scolaire', $inscription->annee_scolaire)
                ->where('statut', 'active')
                ->where('is_archived', false)
                ->first();
            if (! $classe) {
                throw ValidationException::withMessages(['classe_id' => ['La nouvelle classe doit être active et de la même année scolaire ('.$inscription->annee_scolaire.').']]);
            }

            $ancienne = $inscription->classe_academique_id;
            $inscription->update(['classe_academique_id' => $classe->id]);
            AuditEvent::create([
                'actor_user_id' => $request->user()->id,
                'action' => 'inscription.classe_changee',
                'entity_type' => 'inscription',
                'entity_id' => $inscription->id,
                'metadata' => ['eleve_id' => $inscription->eleve_id, 'ancienne_classe_id' => $ancienne, 'nouvelle_classe_id' => $classe->id, 'motif' => $data['motif'] ?? null],
                'created_at' => now(),
            ]);

            return $inscription->load('classeAcademique');
        });

        return response()->json([
            'message' => 'Élève transféré dans la classe '.$inscription->classeAcademique->nom.'.',
            'data' => [
                'id' => $inscription->id,
                'eleve_id' => $inscription->eleve_id,
                'classe_id' => $inscription->classe_academique_id,
                'classe' => $inscription->classeAcademique->nom,
                'annee_scolaire' => $inscription->annee_scolaire,
                'statut' => $inscription->statut,
            ],
        ]);
    }

    /**
     * POST /v1/inscriptions-annuelles/{inscriptionId}/frais-inscription : encaisse plus tard les frais
     * d'inscription (montant fixé pour la classe) et émet le reçu.
     */
    public function encaisserFrais(Request $request, int $inscriptionId, FraisInscription $frais): JsonResponse
    {
        $data = $request->validate([
            'mode_paiement' => ['required', Rule::enum(ModePaiement::class)],
            'date_paiement' => ['sometimes', 'nullable', 'date', 'before_or_equal:today'],
        ], [
            'mode_paiement.required' => 'Indiquez le mode de paiement.',
            'date_paiement.before_or_equal' => 'La date du paiement ne peut pas être dans le futur.',
        ]);
        $inscription = Inscription::where('is_archived', false)->where('statut', 'active')->findOrFail($inscriptionId);
        $inscription = $frais->encaisser($inscription, $data['mode_paiement'], $data['date_paiement'] ?? null, $request->user());

        return response()->json([
            'message' => 'Frais d’inscription encaissés.',
            'data' => $frais->donneesRecu($inscription),
        ], 201);
    }

    /**
     * GET /v1/inscriptions-annuelles/{inscriptionId}/recu : reçu des frais d'inscription
     * (Admin, ou tuteur rattaché à l'élève).
     */
    public function recu(Request $request, int $inscriptionId, FraisInscription $frais): JsonResponse
    {
        $inscription = Inscription::findOrFail($inscriptionId);
        if (! $inscription->fraisPayes()) {
            return response()->json(['message' => 'Aucun reçu : les frais d’inscription ne sont pas encore réglés.'], 404);
        }
        if ($request->user()->role === Role::Tuteur && ! Tuteur::where('user_id', $request->user()->id)
            ->whereHas('eleves', fn ($eleves) => $eleves->where('eleves.id', $inscription->eleve_id))->exists()) {
            return response()->json(['message' => 'Ce reçu ne concerne pas vos enfants.'], 403);
        }

        return response()->json(['data' => $frais->donneesRecu($inscription)]);
    }
}
