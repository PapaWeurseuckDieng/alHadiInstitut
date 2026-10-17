<?php

namespace App\Http\Controllers\Api;

use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Models\AuditEvent;
use App\Models\ClasseAcademique;
use App\Models\Eleve;
use App\Models\FicheHebdomadaire;
use App\Models\Note;
use App\Models\Sourate;
use App\Models\User;
use App\Services\PhotoProfil;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Suivi coranique : fiches hebdomadaires (créées, remplies et validées par l'oustaz ; l'administration
 * consulte et peut rouvrir une fiche validée), exemplarité mensuelle et Élève du mois.
 */
class SuiviCoraniqueController extends Controller
{
    /** Positions des sourates dans le Coran (chargées une fois par requête). */
    private ?array $referentiel = null;

    private const JOURS = ['samedi', 'dimanche', 'lundi', 'mardi', 'mercredi'];

    /** Les cinq critères mensuels d'exemplarité, notés de 0 à 4. */
    private const CRITERES = ['assiduite_ponctualite', 'discipline_comportement', 'proprete_hygiene', 'camaraderie_respect', 'prieres_devotion'];

    public function sourates(): JsonResponse
    {
        return response()->json(['data' => Sourate::orderBy('numero')->get()]);
    }

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'eleve_id' => ['sometimes', 'integer', 'exists:eleves,id'],
            'classe_id' => ['sometimes', 'integer'],
            'statut' => ['sometimes', Rule::in(['brouillon', 'validee'])],
            'date_debut' => ['sometimes', 'date_format:Y-m-d'],
            'date_fin' => ['sometimes', 'date_format:Y-m-d'],
            // Fiches validées dont l'oustaz demande la réouverture (à traiter par l'administration)
            'demande_modification' => ['sometimes', 'boolean'],
        ]);

        $fiches = FicheHebdomadaire::with(['eleve', 'notes', 'enseignant', 'validateur', 'autorisateur'])
            ->when(isset($filters['eleve_id']), fn ($query) => $query->where('eleve_id', $filters['eleve_id']))
            ->when(isset($filters['classe_id']), fn ($query) => $query->whereIn('eleve_id', $this->elevesDeClasses([(int) $filters['classe_id']])))
            ->when(isset($filters['statut']), fn ($query) => $query->where('statut', $filters['statut']))
            ->when(isset($filters['date_debut']), fn ($query) => $query->whereDate('date_debut', '>=', $filters['date_debut']))
            ->when(isset($filters['date_fin']), fn ($query) => $query->whereDate('date_fin', '<=', $filters['date_fin']))
            ->when($request->boolean('demande_modification'), fn ($query) => $query->where('statut', 'validee')->whereNotNull('modification_demandee_at'))
            ->when($request->user()->role === Role::Oustaz, fn ($query) => $query->where(fn ($siennes) => $siennes
                ->where('enseignant_id', $request->user()->id)
                ->orWhereIn('eleve_id', $this->elevesDeClasses($this->classesDeLOustaz($request->user())))))
            ->orderByDesc('date_debut')
            ->get();

        return response()->json(['data' => $fiches->map(fn (FicheHebdomadaire $fiche) => $this->ficheData($fiche))]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'eleve_id' => ['required', 'integer', 'exists:eleves,id'],
            'date_debut' => ['required', 'date_format:Y-m-d'],
            'date_fin' => ['required', 'date_format:Y-m-d'],
            'sourate_debut_id' => ['required', 'integer', 'exists:sourates,numero'],
            'verset_debut' => ['required', 'integer', 'min:1'],
            'sourate_fin_id' => ['required', 'integer', 'exists:sourates,numero'],
            'verset_fin' => ['required', 'integer', 'min:1'],
        ]);
        $this->validateWeek($data['date_debut'], $data['date_fin']);
        if (FicheHebdomadaire::where('eleve_id', $data['eleve_id'])
            ->whereDate('date_debut', $data['date_debut'])
            ->exists()) {
            throw ValidationException::withMessages([
                'date_debut' => ['Une fiche existe déjà pour cet élève et cette semaine.'],
            ]);
        }
        $this->validateQuranRange(
            $data['sourate_debut_id'],
            $data['verset_debut'],
            $data['sourate_fin_id'],
            $data['verset_fin'],
        );

        $student = Eleve::where('is_archived', false)->findOrFail($data['eleve_id']);
        if (! $this->elevesDeClasses($this->classesDeLOustaz($request->user()))->contains($student->id)) {
            return response()->json(['message' => 'Cet élève ne fait pas partie de vos classes.'], 403);
        }

        $start = Sourate::findOrFail($data['sourate_debut_id']);
        $end = Sourate::findOrFail($data['sourate_fin_id']);
        $fiche = FicheHebdomadaire::create([
            'eleve_id' => $student->id,
            'enseignant_id' => $request->user()->id,
            'date_debut' => $data['date_debut'],
            'date_fin' => $data['date_fin'],
            'sourate_debut' => $start->nom,
            'verset_debut' => $data['verset_debut'],
            'sourate_fin' => $end->nom,
            'verset_fin' => $data['verset_fin'],
            'statut' => 'brouillon',
        ]);

        return response()->json([
            'message' => 'Fiche hebdomadaire créée en brouillon.',
            'data' => $this->ficheData($fiche->load(['eleve', 'notes', 'enseignant'])),
        ], 201);
    }

    public function show(Request $request, int $ficheId): JsonResponse
    {
        $fiche = $this->findAccessibleFiche($request, $ficheId);

        return response()->json(['data' => $this->ficheData($fiche->load(['eleve', 'notes', 'enseignant', 'validateur', 'autorisateur']))]);
    }

    public function update(Request $request, int $ficheId): JsonResponse
    {
        $fiche = $this->findAccessibleFiche($request, $ficheId);
        $this->requireDraft($fiche);
        $data = $request->validate([
            'date_debut' => ['sometimes', 'required', 'date_format:Y-m-d'],
            'date_fin' => ['sometimes', 'required', 'date_format:Y-m-d'],
            'sourate_debut_id' => ['sometimes', 'required', 'integer', 'exists:sourates,numero'],
            'verset_debut' => ['sometimes', 'required', 'integer', 'min:1'],
            'sourate_fin_id' => ['sometimes', 'required', 'integer', 'exists:sourates,numero'],
            'verset_fin' => ['sometimes', 'required', 'integer', 'min:1'],
        ]);

        $startDate = $data['date_debut'] ?? $fiche->date_debut->toDateString();
        $endDate = $data['date_fin'] ?? $fiche->date_fin->toDateString();
        $this->validateWeek($startDate, $endDate);

        $start = isset($data['sourate_debut_id'])
            ? Sourate::findOrFail($data['sourate_debut_id'])
            : Sourate::where('nom', $fiche->sourate_debut)->firstOrFail();
        $end = isset($data['sourate_fin_id'])
            ? Sourate::findOrFail($data['sourate_fin_id'])
            : Sourate::where('nom', $fiche->sourate_fin)->firstOrFail();
        $startVerse = $data['verset_debut'] ?? $fiche->verset_debut;
        $endVerse = $data['verset_fin'] ?? $fiche->verset_fin;
        $this->validateQuranRange($start->numero, $startVerse, $end->numero, $endVerse);

        $fiche->fill([
            'date_debut' => $startDate,
            'date_fin' => $endDate,
            'sourate_debut' => $start->nom,
            'verset_debut' => $startVerse,
            'sourate_fin' => $end->nom,
            'verset_fin' => $endVerse,
        ])->save();

        return response()->json(['message' => 'Fiche hebdomadaire mise à jour.', 'data' => $this->ficheData($fiche->load('notes'))]);
    }

    public function saveDay(Request $request, int $ficheId, string $jour): JsonResponse
    {
        $fiche = $this->findAccessibleFiche($request, $ficheId);
        $this->requireDraft($fiche);
        if (! in_array($jour, self::JOURS, true)) {
            throw ValidationException::withMessages(['jour' => ['Le jour doit être compris entre samedi et mercredi.']]);
        }

        $rules = ['qualite_recitation' => ['sometimes', 'nullable', 'integer', 'between:0,4']];
        foreach (['D' => 'd', 'J' => 'j', 'M' => 'm'] as $key => $prefix) {
            $rules["reperes.$key"] = ['sometimes', 'nullable', 'array'];
            $rules["reperes.$key.sourate_debut_id"] = ["required_with:reperes.$key", 'integer', 'exists:sourates,numero'];
            $rules["reperes.$key.verset_debut"] = ["required_with:reperes.$key", 'integer', 'min:1'];
            $rules["reperes.$key.sourate_fin_id"] = ["required_with:reperes.$key", 'integer', 'exists:sourates,numero'];
            $rules["reperes.$key.verset_fin"] = ["required_with:reperes.$key", 'integer', 'min:1'];
        }
        $data = $request->validate($rules);
        $record = Note::firstOrNew([
            'fiche_hebdomadaire_id' => $fiche->id,
            'jour' => $jour,
        ]);

        foreach (['D' => 'd', 'J' => 'j', 'M' => 'm'] as $key => $prefix) {
            if (! array_key_exists($key, $data['reperes'] ?? [])) {
                continue;
            }
            $repere = $data['reperes'][$key];
            if ($repere === null) {
                foreach (['sourate_debut', 'verset_debut', 'sourate_fin', 'verset_fin'] as $field) {
                    $record->{$prefix.'_'.$field} = null;
                }

                continue;
            }
            $this->validateQuranRange(
                $repere['sourate_debut_id'],
                $repere['verset_debut'],
                $repere['sourate_fin_id'],
                $repere['verset_fin'],
                "reperes.$key",
            );
            $record->{$prefix.'_sourate_debut'} = $repere['sourate_debut_id'];
            $record->{$prefix.'_verset_debut'} = $repere['verset_debut'];
            $record->{$prefix.'_sourate_fin'} = $repere['sourate_fin_id'];
            $record->{$prefix.'_verset_fin'} = $repere['verset_fin'];
        }
        if (array_key_exists('qualite_recitation', $data)) {
            $record->qualite_recitation = $data['qualite_recitation'];
        }
        $record->save();

        return response()->json([
            'message' => 'Repères coraniques enregistrés.',
            'data' => $this->noteData($record->refresh()),
        ]);
    }

    /**
     * POST /v1/fiches-hebdomadaires/{ficheId}/valider (Oustaz) : la fiche remplie est validée et figée.
     * Elle compte alors dans les objectifs de l'Élève du mois.
     */
    public function validateFiche(Request $request, int $ficheId): JsonResponse
    {
        $fiche = $this->findAccessibleFiche($request, $ficheId);
        $this->requireDraft($fiche);
        if ($fiche->notes->isEmpty()) {
            throw ValidationException::withMessages(['statut' => ['Enregistrez au moins un jour avant de valider la fiche.']]);
        }
        $fiche->update([
            'statut' => 'validee',
            'valide_par' => $request->user()->id,
            'valide_at' => now(),
            'modification_demandee_at' => null,
            'motif_demande_modification' => null,
        ]);
        $this->auditFiche($request, $fiche, 'fiche.validee', []);

        return response()->json(['message' => 'Fiche hebdomadaire validée.', 'data' => $this->ficheData($fiche->load(['eleve', 'enseignant', 'validateur', 'autorisateur']))]);
    }

    /**
     * POST /v1/fiches-hebdomadaires/{ficheId}/demander-modification (Oustaz) : demande à l'administration
     * de rouvrir une fiche validée (motif facultatif).
     */
    public function requestChange(Request $request, int $ficheId): JsonResponse
    {
        $data = $request->validate(['motif' => ['sometimes', 'nullable', 'string', 'max:255']]);
        $fiche = $this->findAccessibleFiche($request, $ficheId);
        if ($fiche->statut !== 'validee') {
            throw ValidationException::withMessages(['statut' => ['Seule une fiche validée peut faire l’objet d’une demande de modification.']]);
        }
        if ($fiche->modification_demandee_at) {
            throw ValidationException::withMessages(['statut' => ['Une demande de modification est déjà en attente pour cette fiche.']]);
        }
        $fiche->update(['modification_demandee_at' => now(), 'motif_demande_modification' => $data['motif'] ?? null]);
        $this->auditFiche($request, $fiche, 'fiche.modification_demandee', ['motif' => $data['motif'] ?? null]);

        return response()->json([
            'message' => 'Demande de modification envoyée à l’administration.',
            'data' => $this->ficheData($fiche->load(['eleve', 'enseignant', 'validateur', 'autorisateur'])),
        ]);
    }

    /**
     * POST /v1/fiches-hebdomadaires/{ficheId}/autoriser-modification (Admin) : rouvre une fiche validée ;
     * elle repasse en brouillon et l'oustaz peut la corriger puis la valider de nouveau.
     */
    public function allowChange(Request $request, int $ficheId): JsonResponse
    {
        $fiche = FicheHebdomadaire::findOrFail($ficheId);
        if ($fiche->statut !== 'validee') {
            throw ValidationException::withMessages(['statut' => ['Seule une fiche validée peut être rouverte.']]);
        }
        $fiche->update([
            'statut' => 'brouillon',
            'modification_autorisee_par' => $request->user()->id,
            'modification_autorisee_at' => now(),
            'modification_demandee_at' => null,
        ]);
        $this->auditFiche($request, $fiche, 'fiche.modification_autorisee', ['motif_demande' => $fiche->motif_demande_modification]);

        return response()->json([
            'message' => 'Modification autorisée : l’oustaz peut de nouveau modifier cette fiche.',
            'data' => $this->ficheData($fiche->load(['eleve', 'enseignant', 'validateur', 'autorisateur'])),
        ]);
    }

    public function evaluateExemplarite(Request $request, int $eleveId): JsonResponse
    {
        $student = Eleve::where('is_archived', false)->findOrFail($eleveId);
        $data = $request->validate([
            'mois' => ['required', 'date_format:Y-m'],
            'assiduite_ponctualite' => ['required', 'integer', 'between:0,4'],
            'discipline_comportement' => ['required', 'integer', 'between:0,4'],
            'proprete_hygiene' => ['required', 'integer', 'between:0,4'],
            'camaraderie_respect' => ['required', 'integer', 'between:0,4'],
            'prieres_devotion' => ['required', 'integer', 'between:0,4'],
        ]);
        $this->authorizeStudentForOustaz($request, $student);
        $createdAt = DB::table('evaluations_exemplarite')
            ->where('eleve_id', $student->id)
            ->where('mois', $data['mois'])
            ->value('created_at') ?? now();
        DB::table('evaluations_exemplarite')->updateOrInsert(
            ['eleve_id' => $student->id, 'mois' => $data['mois']],
            [
                'assiduite_ponctualite' => $data['assiduite_ponctualite'],
                'discipline_comportement' => $data['discipline_comportement'],
                'proprete_hygiene' => $data['proprete_hygiene'],
                'camaraderie_respect' => $data['camaraderie_respect'],
                'prieres_devotion' => $data['prieres_devotion'],
                'evalue_par' => $request->user()->id,
                'updated_at' => now(),
                'created_at' => $createdAt,
            ],
        );

        return response()->json([
            'message' => 'Évaluation d’exemplarité enregistrée.',
            'data' => $this->scoreData($student->id, $data['mois']),
        ]);
    }

    /**
     * GET /v1/classes/{classeId}/exemplarite?mois=AAAA-MM : élèves actifs de la classe, avec
     * l'évaluation d'exemplarité déjà saisie pour le mois (ou null) et leur score du mois.
     */
    public function classExemplarite(Request $request, int $classeId): JsonResponse
    {
        $data = $request->validate(['mois' => ['sometimes', 'date_format:Y-m']], [
            'mois.date_format' => 'Le mois doit être au format AAAA-MM.',
        ]);
        $month = $data['mois'] ?? now(config('app.timezone'))->format('Y-m');
        $classe = ClasseAcademique::where('is_archived', false)->findOrFail($classeId);
        if ($request->user()->role === Role::Oustaz && $classe->oustaz_id !== $request->user()->oustaz?->id) {
            return response()->json(['message' => 'Cette classe ne vous est pas affectée.'], 403);
        }

        $students = Eleve::where('is_archived', false)
            ->whereHas('inscriptions', fn ($query) => $query
                ->where('classe_academique_id', $classe->id)
                ->where('statut', 'active')
                ->where('is_archived', false))
            ->orderBy('nom')
            ->orderBy('prenom')
            ->get();
        $evaluations = DB::table('evaluations_exemplarite')
            ->whereIn('eleve_id', $students->pluck('id'))
            ->where('mois', $month)
            ->get()
            ->keyBy('eleve_id');

        return response()->json(['data' => [
            'classe_id' => $classe->id,
            'mois' => $month,
            'criteres' => self::CRITERES,
            'eleves' => $students->map(function (Eleve $student) use ($evaluations, $month) {
                $evaluation = $evaluations->get($student->id);

                return [
                    'eleve_id' => $student->id,
                    'matricule' => $student->matricule,
                    'nom' => $student->nom,
                    'prenom' => $student->prenom,
                    'photo' => PhotoProfil::url($student->photo),
                    'evaluation' => $evaluation
                        ? collect(self::CRITERES)->mapWithKeys(fn (string $critere) => [$critere => (int) $evaluation->{$critere}])->all()
                        : null,
                    'score' => $this->scoreData($student->id, $month),
                ];
            })->values(),
        ]]);
    }

    public function eleveDuMois(Request $request): JsonResponse
    {
        $data = $request->validate(['mois' => ['sometimes', 'date_format:Y-m']], [
            'mois.date_format' => 'Le mois doit être au format AAAA-MM.',
        ]);
        $month = $data['mois'] ?? now()->format('Y-m');
        $students = Eleve::where('is_archived', false)
            ->whereIn('id', DB::table('evaluations_exemplarite')->where('mois', $month)->select('eleve_id'))
            ->with(['inscriptions' => fn ($query) => $query->where('statut', 'active')->where('is_archived', false)->with('classeAcademique')->orderByDesc('id')])
            ->get();
        $scores = $students->map(fn (Eleve $student) => $this->scoreData($student->id, $month) + [
            'eleve' => [
                'id' => $student->id,
                'matricule' => $student->matricule,
                'nom' => $student->nom,
                'prenom' => $student->prenom,
                'photo' => PhotoProfil::url($student->photo),
                'classe' => $student->inscriptions->first()?->classeAcademique?->nom,
                'classe_id' => $student->inscriptions->first()?->classeAcademique?->id,
            ],
        ]);
        $ranking = $scores->filter(fn ($score) => $score['score_total'] !== null)
            ->sortByDesc('score_total')
            ->values()
            ->map(fn (array $score, int $index) => ['rang' => $index + 1] + $score);
        // Évalués mais pas encore classables : composantes manquantes (fiche validée, notes de récitation)
        $unranked = $scores->filter(fn ($score) => $score['score_total'] === null)
            ->map(fn (array $score) => $score + ['manque' => array_values(array_filter([
                $score['objectifs_sur_100'] === null ? 'objectifs' : null,
                $score['recitation_sur_100'] === null ? 'recitation' : null,
            ]))])
            ->sortBy(fn (array $score) => $score['eleve']['nom'].' '.$score['eleve']['prenom'])
            ->values();

        $classes = $this->classementParClasse($ranking, $scores);

        return response()->json([
            'data' => [
                'mois' => $month,
                // Meilleur des meilleurs : premier du classement général (donc le meilleur des premiers de classe)
                'gagnant' => $ranking->first(),
                'classement' => $ranking,
                'non_classes' => $unranked,
                // Par classe : moyennes, premier de la classe et classement interne ; triées par moyenne
                'classes' => $classes,
                // Classe exemplaire : meilleure moyenne des scores (départage : exemplarité, puis nombre de classés)
                'classe_exemplaire' => $classes->first(fn (array $classe) => $classe['moyenne_score'] !== null),
            ],
        ]);
    }

    /** Regroupe le classement par classe et calcule les moyennes de chaque classe. */
    private function classementParClasse($ranking, $scores)
    {
        $moyenne = fn ($lignes, string $cle) => ($valeurs = $lignes->pluck($cle)->filter(fn ($valeur) => $valeur !== null))->isEmpty()
            ? null
            : round($valeurs->avg(), 2);
        $classes = ClasseAcademique::with('oustaz.user')
            ->whereIn('id', $scores->pluck('eleve.classe_id')->filter()->unique())
            ->get()->keyBy('id');

        return $scores->groupBy(fn (array $score) => $score['eleve']['classe_id'] ?? 0)
            ->map(function ($evalues, $classeId) use ($ranking, $classes, $moyenne) {
                $classe = $classes->get($classeId);
                $rangs = $ranking->filter(fn (array $ligne) => ($ligne['eleve']['classe_id'] ?? 0) === $classeId)->values()
                    ->map(fn (array $ligne, int $index) => ['rang_classe' => $index + 1] + $ligne);

                return [
                    'classe' => $classe ? [
                        'id' => $classe->id,
                        'nom' => $classe->nom,
                        'niveau' => $classe->niveau,
                        'annee_scolaire' => $classe->annee_scolaire,
                        'oustaz' => $classe->oustaz?->user ? trim($classe->oustaz->user->prenom.' '.$classe->oustaz->user->nom) : null,
                        'oustaz_id' => $classe->oustaz_id,
                    ] : null,
                    'evalues' => $evalues->count(),
                    'classes' => $rangs->count(),
                    'moyenne_score' => $moyenne($rangs, 'score_total'),
                    'moyenne_exemplarite' => $moyenne($evalues, 'exemplarite_sur_100'),
                    'moyenne_objectifs' => $moyenne($evalues, 'objectifs_sur_100'),
                    'moyenne_recitation' => $moyenne($evalues, 'recitation_sur_100'),
                    'meilleur' => $rangs->first(),
                    'classement' => $rangs,
                ];
            })
            ->sort(fn (array $a, array $b) => [$b['moyenne_score'] !== null, $b['moyenne_score'], $b['moyenne_exemplarite'], $b['classes']]
                <=> [$a['moyenne_score'] !== null, $a['moyenne_score'], $a['moyenne_exemplarite'], $a['classes']])
            ->values()
            ->map(fn (array $classe, int $index) => ['rang' => $classe['moyenne_score'] !== null ? $index + 1 : null] + $classe);
    }

    /** Fiche accessible : toutes pour l'administration ; pour l'oustaz, les siennes et celles des élèves de ses classes. */
    private function findAccessibleFiche(Request $request, int $ficheId): FicheHebdomadaire
    {
        $fiche = FicheHebdomadaire::with('notes')->findOrFail($ficheId);
        if (
            $request->user()->role === Role::Oustaz
            && $fiche->enseignant_id !== $request->user()->id
            && ! $this->elevesDeClasses($this->classesDeLOustaz($request->user()))->contains($fiche->eleve_id)
        ) {
            abort(403, 'Cette fiche ne vous est pas affectée.');
        }

        return $fiche;
    }

    /** Classes actives de l'oustaz connecté. */
    private function classesDeLOustaz(User $user): array
    {
        return ClasseAcademique::where('oustaz_id', $user->oustaz?->id ?? 0)->where('is_archived', false)->pluck('id')->all();
    }

    /** Élèves inscrits (inscription active) dans ces classes. */
    private function elevesDeClasses(array $classeIds)
    {
        return DB::table('inscriptions')->whereIn('classe_academique_id', $classeIds)
            ->where('statut', 'active')->where('is_archived', false)->pluck('eleve_id');
    }

    private function auditFiche(Request $request, FicheHebdomadaire $fiche, string $action, array $metadata): void
    {
        AuditEvent::create([
            'actor_user_id' => $request->user()->id,
            'action' => $action,
            'entity_type' => 'fiche_hebdomadaire',
            'entity_id' => $fiche->id,
            'metadata' => ['eleve_id' => $fiche->eleve_id, ...$metadata],
            'created_at' => now(),
        ]);
    }

    private function authorizeStudentForOustaz(Request $request, Eleve $student): void
    {
        if ($request->user()->role !== Role::Oustaz) {
            return;
        }
        $inClass = DB::table('inscriptions')
            ->join('classes_academiques', 'classes_academiques.id', '=', 'inscriptions.classe_academique_id')
            ->where('inscriptions.eleve_id', $student->id)
            ->where('inscriptions.statut', 'active')
            ->where('inscriptions.is_archived', false)
            ->where('classes_academiques.oustaz_id', $request->user()->oustaz?->id)
            ->exists();
        abort_unless($inClass, 403, 'Cet élève ne fait pas partie de vos classes.');
    }

    private function requireDraft(FicheHebdomadaire $fiche): void
    {
        if ($fiche->statut !== 'brouillon') {
            throw ValidationException::withMessages(['statut' => ['Fiche validée : seule l’administration peut autoriser sa modification.']]);
        }
    }

    private function validateWeek(string $startDate, string $endDate): void
    {
        $start = Carbon::parse($startDate);
        if ($start->dayOfWeekIso !== Carbon::SATURDAY || $endDate !== $start->copy()->addDays(4)->toDateString()) {
            throw ValidationException::withMessages([
                'date_debut' => ['Une fiche doit couvrir les jours de cours, du samedi au mercredi.'],
            ]);
        }
    }

    private function validateQuranRange(int $startSurah, int $startVerse, int $endSurah, int $endVerse, string $field = 'sourate_fin_id'): void
    {
        $start = Sourate::findOrFail($startSurah);
        $end = Sourate::findOrFail($endSurah);
        if ($startVerse > $start->nombre_versets) {
            throw ValidationException::withMessages(['verset_debut' => ['Le verset dépasse le nombre de versets de la sourate choisie.']]);
        }
        if ($endVerse > $end->nombre_versets) {
            throw ValidationException::withMessages(['verset_fin' => ['Le verset dépasse le nombre de versets de la sourate choisie.']]);
        }
        if ($startSurah > $endSurah || ($startSurah === $endSurah && $startVerse > $endVerse)) {
            throw ValidationException::withMessages([$field => ['La fin du repère doit suivre son début dans le Coran.']]);
        }
    }

    private function ficheData(FicheHebdomadaire $fiche): array
    {
        $start = Sourate::where('nom', $fiche->sourate_debut)->first();
        $end = Sourate::where('nom', $fiche->sourate_fin)->first();

        $nom = fn (?User $user) => $user ? trim($user->prenom.' '.$user->nom) : null;

        return [
            'id' => $fiche->id,
            'eleve_id' => $fiche->eleve_id,
            'eleve' => $fiche->eleve ? [
                'nom' => $fiche->eleve->nom,
                'prenom' => $fiche->eleve->prenom,
                'matricule' => $fiche->eleve->matricule,
                'photo' => PhotoProfil::url($fiche->eleve->photo),
            ] : null,
            'enseignant_id' => $fiche->enseignant_id,
            'enseignant' => $fiche->relationLoaded('enseignant') ? $nom($fiche->enseignant) : null,
            'valide_at' => $fiche->valide_at?->toIso8601String(),
            'valide_par' => $fiche->relationLoaded('validateur') ? $nom($fiche->validateur) : null,
            'modification_demandee_at' => $fiche->modification_demandee_at?->toIso8601String(),
            'motif_demande_modification' => $fiche->motif_demande_modification,
            'modification_autorisee_at' => $fiche->modification_autorisee_at?->toIso8601String(),
            'modification_autorisee_par' => $fiche->relationLoaded('autorisateur') ? $nom($fiche->autorisateur) : null,
            'date_debut' => $fiche->date_debut->toDateString(),
            'date_fin' => $fiche->date_fin->toDateString(),
            'sourate_debut_id' => $start?->numero,
            'sourate_debut' => $fiche->sourate_debut,
            'verset_debut' => $fiche->verset_debut,
            'sourate_fin_id' => $end?->numero,
            'sourate_fin' => $fiche->sourate_fin,
            'verset_fin' => $fiche->verset_fin,
            'statut' => $fiche->statut,
            'notes' => $fiche->notes->map(fn (Note $note) => $this->noteData($note)),
        ];
    }

    private function noteData(Note $note): array
    {
        $repereData = [];
        foreach (['D' => 'd', 'J' => 'j', 'M' => 'm'] as $key => $prefix) {
            $startId = $note->{$prefix.'_sourate_debut'};
            $endId = $note->{$prefix.'_sourate_fin'};
            $repereData[$key] = $startId === null ? null : [
                'sourate_debut_id' => $startId,
                'verset_debut' => $note->{$prefix.'_verset_debut'},
                'sourate_fin_id' => $endId,
                'verset_fin' => $note->{$prefix.'_verset_fin'},
            ];
        }

        return [
            'jour' => $note->jour->value,
            'reperes' => $repereData,
            'qualite_recitation' => $note->qualite_recitation,
            'nouvelle_lecon' => $note->nouvelle_lecon,
            'revision_partielle' => $note->revision_partielle,
            'revision_generale' => $note->revision_generale,
        ];
    }

    private function scoreData(int $studentId, string $month): array
    {
        $evaluation = DB::table('evaluations_exemplarite')
            ->where('eleve_id', $studentId)
            ->where('mois', $month)
            ->first();
        if (! $evaluation) {
            return ['mois' => $month, 'score_total' => null];
        }

        $exemplarite = (
            $evaluation->assiduite_ponctualite
            + $evaluation->discipline_comportement
            + $evaluation->proprete_hygiene
            + $evaluation->camaraderie_respect
            + $evaluation->prieres_devotion
        ) / 20 * 100;

        $monthStart = Carbon::createFromFormat('Y-m', $month)->startOfMonth()->toDateString();
        $monthEnd = Carbon::createFromFormat('Y-m', $month)->endOfMonth()->toDateString();
        $sheets = FicheHebdomadaire::with('notes')
            ->where('eleve_id', $studentId)
            ->where('statut', 'validee')
            ->whereBetween('date_debut', [$monthStart, $monthEnd])
            ->get();
        $targetVerses = 0;
        $coveredVerses = 0;
        $recitationGrades = [];
        foreach ($sheets as $sheet) {
            $targetStart = $this->positionForName($sheet->sourate_debut, $sheet->verset_debut);
            $targetEnd = $this->positionForName($sheet->sourate_fin, $sheet->verset_fin);
            if ($targetStart === null || $targetEnd === null) {
                continue;
            }
            $targetVerses += $targetEnd - $targetStart + 1;
            $intervals = [];
            foreach ($sheet->notes as $note) {
                if ($note->qualite_recitation !== null) {
                    $recitationGrades[] = $note->qualite_recitation;
                }
                if ($note->d_sourate_debut === null || $note->d_sourate_fin === null) {
                    continue;
                }
                $start = $this->positionForNumber($note->d_sourate_debut, $note->d_verset_debut);
                $end = $this->positionForNumber($note->d_sourate_fin, $note->d_verset_fin);
                if ($start !== null && $end !== null) {
                    $intervals[] = [max($targetStart, $start), min($targetEnd, $end)];
                }
            }
            $coveredVerses += $this->countMergedIntervals($intervals);
        }

        $objectivePercent = $targetVerses > 0 ? min(100, $coveredVerses / $targetVerses * 100) : null;
        $recitationPercent = count($recitationGrades) > 0 ? array_sum($recitationGrades) / count($recitationGrades) / 4 * 100 : null;
        $total = $objectivePercent === null || $recitationPercent === null
            ? null
            : round($exemplarite * 0.5 + $objectivePercent * 0.3 + $recitationPercent * 0.2, 2);

        return [
            'mois' => $month,
            'exemplarite_sur_100' => round($exemplarite, 2),
            'objectifs_sur_100' => $objectivePercent === null ? null : round($objectivePercent, 2),
            'recitation_sur_100' => $recitationPercent === null ? null : round($recitationPercent, 2),
            'score_total' => $total,
        ];
    }

    /** Sourates indexées par numéro : nom, nombre de versets et versets qui précèdent. */
    private function referentielSourates(): array
    {
        if ($this->referentiel === null) {
            $precedents = 0;
            $this->referentiel = [];
            foreach (Sourate::orderBy('numero')->get(['numero', 'nom', 'nombre_versets']) as $sourate) {
                $this->referentiel[$sourate->numero] = ['nom' => $sourate->nom, 'versets' => $sourate->nombre_versets, 'avant' => $precedents];
                $precedents += $sourate->nombre_versets;
            }
        }

        return $this->referentiel;
    }

    private function positionForName(string $name, int $verse): ?int
    {
        $numero = collect($this->referentielSourates())->search(fn (array $sourate) => $sourate['nom'] === $name);

        return $numero === false ? null : $this->positionForNumber($numero, $verse);
    }

    private function positionForNumber(int $surahNumber, int $verse): ?int
    {
        $surah = $this->referentielSourates()[$surahNumber] ?? null;
        if (! $surah || $verse < 1 || $verse > $surah['versets']) {
            return null;
        }

        return $surah['avant'] + $verse;
    }

    private function countMergedIntervals(array $intervals): int
    {
        $intervals = array_values(array_filter($intervals, fn (array $range) => $range[0] <= $range[1]));
        usort($intervals, fn (array $left, array $right) => $left[0] <=> $right[0]);
        $count = 0;
        $current = null;
        foreach ($intervals as $interval) {
            if ($current === null) {
                $current = $interval;

                continue;
            }
            if ($interval[0] <= $current[1] + 1) {
                $current[1] = max($current[1], $interval[1]);

                continue;
            }
            $count += $current[1] - $current[0] + 1;
            $current = $interval;
        }
        if ($current !== null) {
            $count += $current[1] - $current[0] + 1;
        }

        return $count;
    }
}
