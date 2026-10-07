<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditEvent;
use App\Models\ClasseAcademique;
use App\Models\Eleve;
use App\Models\FicheHebdomadaire;
use App\Models\Inscription;
use App\Models\Tuteur;
use App\Models\User;
use App\Support\AnneeScolaire;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class EleveController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'annee_scolaire' => ['sometimes', 'regex:/^\d{4}-\d{4}$/'],
            'include_archived' => ['sometimes', 'boolean'],
            'q' => ['nullable', 'string', 'max:120'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);
        $year = $filters['annee_scolaire'] ?? AnneeScolaire::courante();

        $query = Eleve::with([
            'tuteurs.user',
            'inscriptions' => fn ($inscriptions) => $inscriptions
                ->where('is_archived', false)
                ->with('classeAcademique'),
        ])->when(
            ! ($filters['include_archived'] ?? false),
            fn ($builder) => $builder->where('is_archived', false),
        )->whereHas(
            'inscriptions',
            fn ($inscriptions) => $inscriptions->where('annee_scolaire', $year)->where('is_archived', false),
        )->when($filters['q'] ?? null, function ($builder, $search): void {
            $builder->where(fn ($students) => $students
                ->where('nom', 'like', '%'.$search.'%')
                ->orWhere('prenom', 'like', '%'.$search.'%')
                ->orWhere('matricule', 'like', '%'.$search.'%'));
        });

        $page = $query->orderBy('id')->paginate(20);

        return response()->json([
            'data' => $page->getCollection()->map(fn (Eleve $eleve) => $this->studentData($eleve)),
            'pagination' => [
                'page' => $page->currentPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $studentFields = ['nom', 'prenom', 'date_naissance', 'sexe', 'adresse'];
        if (! $request->exists('eleve')) {
            $request->merge(['eleve' => $request->only($studentFields)]);
        }
        if (! $request->exists('tuteurs') && $request->filled('tuteur_id')) {
            $request->merge(['tuteurs' => [[
                'mode' => 'existant',
                'tuteur_id' => $request->input('tuteur_id'),
            ]]]);
        }

        $tuteurs = $request->input('tuteurs', []);
        foreach ($tuteurs as $index => $tuteur) {
            if (isset($tuteur['compte']['telephone']) && is_string($tuteur['compte']['telephone'])) {
                $tuteurs[$index]['compte']['telephone'] = User::normaliserTelephone($tuteur['compte']['telephone']);
            }
        }
        $request->merge(['tuteurs' => $tuteurs]);

        $data = $request->validate([
            'eleve' => ['required', 'array'],
            'eleve.nom' => ['required', 'string', 'max:120'],
            'eleve.prenom' => ['required', 'string', 'max:120'],
            'eleve.date_naissance' => ['nullable', 'date', 'before_or_equal:today'],
            'eleve.sexe' => ['required', Rule::in(['M', 'F'])],
            'eleve.adresse' => ['nullable', 'string', 'max:255'],
            'classe_id' => ['required', 'integer', 'exists:classes_academiques,id'],
            'annee_scolaire' => ['prohibited'],
            'inscription' => ['sometimes', 'array'],
            'inscription.annee_scolaire' => ['prohibited'],
            'inscription.date_inscription' => ['sometimes', 'date', 'before_or_equal:today'],
            'tuteurs' => ['required', 'array', 'min:1'],
            'tuteurs.*.mode' => ['required', Rule::in(['existant', 'creer'])],
            'tuteurs.*.tuteur_id' => ['required_if:tuteurs.*.mode,existant', 'prohibited_unless:tuteurs.*.mode,existant', 'integer', 'exists:tuteurs,id'],
            'tuteurs.*.compte' => ['required_if:tuteurs.*.mode,creer', 'prohibited_unless:tuteurs.*.mode,creer', 'array'],
            'tuteurs.*.compte.nom' => ['required_if:tuteurs.*.mode,creer', 'string', 'max:120'],
            'tuteurs.*.compte.prenom' => ['required_if:tuteurs.*.mode,creer', 'string', 'max:120'],
            'tuteurs.*.compte.sexe' => ['required_if:tuteurs.*.mode,creer', Rule::in(['M', 'F'])],
            'tuteurs.*.compte.telephone' => [
                'required_if:tuteurs.*.mode,creer',
                'nullable',
                'string',
                'max:16',
                'regex:/^\+[1-9]\d{7,14}$/',
                'unique:users,telephone',
            ],
            'tuteurs.*.compte.adresse' => ['nullable', 'string', 'max:255'],
            'tuteurs.*.lien_parente' => ['nullable', 'string', 'max:40'],
            'tuteurs.*.est_responsable_legal' => ['sometimes', 'boolean'],
            'tuteurs.*.est_payeur' => ['sometimes', 'boolean'],
        ]);

        $year = AnneeScolaire::courante();
        $class = ClasseAcademique::whereKey($data['classe_id'])
            ->where('annee_scolaire', $year)
            ->where('statut', 'active')
            ->where('is_archived', false)
            ->first();
        if (! $class) {
            throw ValidationException::withMessages([
                'classe_id' => ['La classe doit être active et appartenir à l’année scolaire courante ('.$year.').'],
            ]);
        }

        $relatedTuteurs = [];
        foreach ($data['tuteurs'] as $index => $item) {
            $identifier = $item['mode'] === 'existant'
                ? 'tuteur:'.$item['tuteur_id']
                : 'telephone:'.$item['compte']['telephone'];
            if (isset($relatedTuteurs[$identifier])) {
                throw ValidationException::withMessages([
                    "tuteurs.$index" => ['Un même compte Tuteur ne peut être rattaché qu’une seule fois à cet élève.'],
                ]);
            }
            $relatedTuteurs[$identifier] = true;
        }

        $result = DB::transaction(function () use ($data, $request, $class, $year): array {
            $schoolYearStart = (int) substr($year, 0, 4);
            DB::table('sequences_matricules')->insertOrIgnore([
                'annee' => $schoolYearStart,
                'dernier_numero' => 0,
            ]);
            $sequence = DB::table('sequences_matricules')
                ->where('annee', $schoolYearStart)
                ->lockForUpdate()
                ->first();
            $number = $sequence->dernier_numero + 1;
            DB::table('sequences_matricules')
                ->where('annee', $schoolYearStart)
                ->update(['dernier_numero' => $number]);

            $eleve = Eleve::create([
                ...$data['eleve'],
                'matricule' => sprintf('ELV-%d-%06d', $schoolYearStart, $number),
                'statut' => 'actif',
                'is_archived' => false,
            ]);
            $inscription = Inscription::create([
                'eleve_id' => $eleve->id,
                'classe_academique_id' => $class->id,
                'annee_scolaire' => $year,
                'date_inscription' => $data['inscription']['date_inscription'] ?? Carbon::today()->toDateString(),
                'statut' => 'active',
                'created_by' => $request->user()->id,
                'is_archived' => false,
            ]);

            $createdTuteurs = [];
            foreach ($data['tuteurs'] as $item) {
                if ($item['mode'] === 'existant') {
                    $tuteur = Tuteur::with('user')->findOrFail($item['tuteur_id']);
                } else {
                    $account = $item['compte'];
                    $user = User::create([
                        'matricule' => 'USR-'.Str::upper(Str::random(12)),
                        'nom' => $account['nom'],
                        'prenom' => $account['prenom'],
                        'sexe' => $account['sexe'],
                        'telephone' => $account['telephone'],
                        'adresse' => $account['adresse'] ?? null,
                        'password' => 'passer',
                        'must_change_password' => true,
                        'role' => 'tuteur',
                        'statut' => 'actif',
                    ]);
                    $tuteur = Tuteur::create(['user_id' => $user->id]);
                    $tuteur->setRelation('user', $user);
                }

                if (! $tuteur->user || ! $tuteur->user->estActif() || $tuteur->user->role->value !== 'tuteur') {
                    throw ValidationException::withMessages([
                        'tuteurs' => ['Chaque compte lié doit être un Tuteur actif et non archivé.'],
                    ]);
                }

                $eleve->tuteurs()->syncWithoutDetaching([
                    $tuteur->id => [
                        'lien_parente' => $item['lien_parente'] ?? null,
                        'est_responsable_legal' => $item['est_responsable_legal'] ?? false,
                        'est_payeur' => $item['est_payeur'] ?? false,
                    ],
                ]);
                $createdTuteurs[] = [
                    'id' => $tuteur->id,
                    'user_id' => $tuteur->user_id,
                    'nom' => $tuteur->user->nom,
                    'prenom' => $tuteur->user->prenom,
                    'telephone' => $tuteur->user->telephone,
                    'compte_cree' => $item['mode'] === 'creer',
                    'must_change_password' => $tuteur->user->must_change_password,
                    'lien_parente' => $item['lien_parente'] ?? null,
                    'est_responsable_legal' => $item['est_responsable_legal'] ?? false,
                    'est_payeur' => $item['est_payeur'] ?? false,
                ];
            }

            AuditEvent::create([
                'actor_user_id' => $request->user()->id,
                'action' => 'eleve.enrolled',
                'entity_type' => 'eleve',
                'entity_id' => $eleve->id,
                'metadata' => [
                    'inscription_id' => $inscription->id,
                    'classe_id' => $class->id,
                    'tuteur_ids' => array_column($createdTuteurs, 'id'),
                ],
                'created_at' => now(),
            ]);

            return compact('eleve', 'inscription', 'createdTuteurs');
        });

        return response()->json([
            'message' => 'Élève inscrit pour l’année scolaire '.$year.'.',
            'data' => [
                'eleve' => [
                    'id' => $result['eleve']->id,
                    'matricule' => $result['eleve']->matricule,
                    'nom' => $result['eleve']->nom,
                    'prenom' => $result['eleve']->prenom,
                    'sexe' => $result['eleve']->sexe,
                    'statut' => $result['eleve']->statut,
                    'a_un_compte' => false,
                ],
                'inscription' => [
                    'id' => $result['inscription']->id,
                    'annee_scolaire' => $result['inscription']->annee_scolaire,
                    'date_inscription' => $result['inscription']->date_inscription->toDateString(),
                    'statut' => $result['inscription']->statut,
                    'classe_id' => $result['inscription']->classe_academique_id,
                ],
                'tuteurs' => $result['createdTuteurs'],
            ],
        ], 201);
    }

    public function show(Request $request, int $eleveId): JsonResponse
    {
        $request->validate(['include_archived' => ['sometimes', 'boolean']]);
        $eleve = Eleve::with(['tuteurs.user', 'inscriptions.classeAcademique'])
            ->when(! $request->boolean('include_archived'), fn ($query) => $query->where('is_archived', false))
            ->findOrFail($eleveId);

        return response()->json(['data' => $this->studentData($eleve)]);
    }

    public function update(Request $request, int $eleveId): JsonResponse
    {
        $eleve = Eleve::where('is_archived', false)->findOrFail($eleveId);
        $data = $request->validate([
            'nom' => ['sometimes', 'required', 'string', 'max:120'],
            'prenom' => ['sometimes', 'required', 'string', 'max:120'],
            'date_naissance' => ['sometimes', 'nullable', 'date', 'before_or_equal:today'],
            'sexe' => ['sometimes', 'required', Rule::in(['M', 'F'])],
            'adresse' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);
        $eleve->fill($data)->save();

        return response()->json([
            'message' => 'Fiche élève modifiée.',
            'data' => $this->studentData($eleve->load(['tuteurs.user', 'inscriptions.classeAcademique'])),
        ]);
    }

    public function archive(Request $request, int $eleveId): JsonResponse
    {
        $data = $request->validate([
            'motif' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);
        $eleve = DB::transaction(function () use ($data, $request, $eleveId): Eleve {
            $eleve = Eleve::query()->lockForUpdate()->findOrFail($eleveId);
            if (! $eleve->is_archived) {
                $eleve->forceFill([
                    'is_archived' => true,
                    'archived_at' => Carbon::now(),
                    'statut' => 'inactif',
                ])->save();
                AuditEvent::create([
                    'actor_user_id' => $request->user()->id,
                    'action' => 'eleve.archived',
                    'entity_type' => 'eleve',
                    'entity_id' => $eleve->id,
                    'metadata' => ['motif' => $data['motif'] ?? null],
                    'created_at' => now(),
                ]);
            }

            return $eleve;
        });

        return response()->json([
            'message' => 'Élève archivé.',
            'data' => [
                'id' => $eleve->id,
                'is_archived' => $eleve->is_archived,
                'archived_at' => $eleve->archived_at?->toIso8601String(),
            ],
        ]);
    }

    public function mine(Request $request): JsonResponse
    {
        $tuteur = Tuteur::with(['eleves' => fn ($eleves) => $eleves
            ->where('eleves.is_archived', false)
            ->with(['inscriptions' => fn ($inscriptions) => $inscriptions->where('is_archived', false)])])
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        return response()->json([
            'data' => $tuteur->eleves->map(fn (Eleve $eleve) => [
                'id' => $eleve->id,
                'matricule' => $eleve->matricule,
                'nom' => $eleve->nom,
                'prenom' => $eleve->prenom,
                'inscriptions' => $eleve->inscriptions->map(fn (Inscription $inscription) => [
                    'id' => $inscription->id,
                    'annee_scolaire' => $inscription->annee_scolaire,
                    'statut' => $inscription->statut,
                    'classe_id' => $inscription->classe_academique_id,
                ]),
            ]),
        ]);
    }

    public function childSummary(Request $request, int $eleveId): JsonResponse
    {
        $tuteur = Tuteur::where('user_id', $request->user()->id)->firstOrFail();
        $eleve = Eleve::where('is_archived', false)
            ->whereHas('tuteurs', fn ($query) => $query->where('tuteurs.id', $tuteur->id))
            ->with(['inscriptions' => fn ($query) => $query
                ->where('annee_scolaire', AnneeScolaire::courante())
                ->where('statut', 'active')
                ->where('is_archived', false)
                ->with('classeAcademique')])
            ->find($eleveId);
        if (! $eleve) {
            return response()->json(['message' => 'Cet élève n’est pas rattaché à votre compte.'], 403);
        }

        $latestSheets = FicheHebdomadaire::with('notes')
            ->where('eleve_id', $eleve->id)
            ->orderByDesc('date_fin')
            ->limit(5)
            ->get();

        return response()->json([
            'data' => [
                'eleve' => [
                    'id' => $eleve->id,
                    'matricule' => $eleve->matricule,
                    'nom_complet' => trim($eleve->prenom.' '.$eleve->nom),
                ],
                'annee_scolaire' => AnneeScolaire::courante(),
                'classe' => $eleve->inscriptions->first()?->classeAcademique
                    ? [
                        'id' => $eleve->inscriptions->first()->classeAcademique->id,
                        'nom' => $eleve->inscriptions->first()->classeAcademique->nom,
                    ]
                    : null,
                'progression' => [
                    'moyenne_periode' => null,
                    'moyenne_periode_precedente' => null,
                    'tendance' => 'non_evalue',
                    'dernieres_evaluations' => [],
                ],
                'activite_hebdomadaire' => $latestSheets->map(fn (FicheHebdomadaire $fiche) => [
                    'date_debut' => $fiche->date_debut->toDateString(),
                    'date_fin' => $fiche->date_fin->toDateString(),
                    'sourate_debut' => $fiche->sourate_debut,
                    'verset_debut' => $fiche->verset_debut,
                    'sourate_fin' => $fiche->sourate_fin,
                    'verset_fin' => $fiche->verset_fin,
                    'notes' => $fiche->notes->map(fn ($note) => [
                        'jour' => $note->jour->value,
                        'nouvelle_lecon' => $note->nouvelle_lecon,
                        'revision_partielle' => $note->revision_partielle,
                        'revision_generale' => $note->revision_generale,
                    ]),
                ]),
                'mise_a_jour' => now()->toIso8601String(),
            ],
        ]);
    }

    private function studentData(Eleve $eleve): array
    {
        return [
            'id' => $eleve->id,
            'matricule' => $eleve->matricule,
            'nom' => $eleve->nom,
            'prenom' => $eleve->prenom,
            'date_naissance' => $eleve->date_naissance?->toDateString(),
            'sexe' => $eleve->sexe,
            'adresse' => $eleve->adresse,
            'statut' => $eleve->statut,
            'is_archived' => $eleve->is_archived,
            'archived_at' => $eleve->archived_at?->toIso8601String(),
            'inscriptions' => $eleve->inscriptions->map(fn (Inscription $inscription) => [
                'id' => $inscription->id,
                'annee_scolaire' => $inscription->annee_scolaire,
                'statut' => $inscription->statut,
                'classe_id' => $inscription->classe_academique_id,
                'classe' => $inscription->classeAcademique?->nom,
            ]),
            'tuteurs' => $eleve->tuteurs->map(fn (Tuteur $tuteur) => [
                'id' => $tuteur->id,
                'nom' => $tuteur->user?->nom,
                'prenom' => $tuteur->user?->prenom,
                'telephone' => $tuteur->user?->telephone,
            ]),
        ];
    }
}
