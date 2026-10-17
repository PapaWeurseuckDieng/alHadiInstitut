<?php

namespace App\Http\Controllers\Api;

use App\Enums\ModePaiement;
use App\Http\Controllers\Controller;
use App\Models\AuditEvent;
use App\Models\ClasseAcademique;
use App\Models\Diplome;
use App\Models\Eleve;
use App\Models\FicheHebdomadaire;
use App\Models\Inscription;
use App\Models\Paiement;
use App\Models\Tuteur;
use App\Models\User;
use App\Services\EncaissementMensualite;
use App\Services\FraisInscription;
use App\Services\PhotoProfil;
use App\Support\AnneeScolaire;
use App\Support\Mensualites;
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

    /**
     * POST /v1/eleves : inscription officielle d'un élève.
     * Accepte du JSON, ou du multipart/form-data quand une photo est jointe (champ « photo »).
     * Le bloc facultatif « paiement » encaisse dans la même transaction les frais d'inscription
     * (frais_inscription: true → montant fixé pour la classe, jamais saisi) et/ou une ou plusieurs
     * mensualités ; chaque encaissement produit un reçu.
     */
    public function store(Request $request, PhotoProfil $photos, EncaissementMensualite $encaissement, FraisInscription $frais): JsonResponse
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
            // En multipart, les cases à cocher arrivent en texte « true » / « false »
            foreach (['est_responsable_legal', 'est_payeur'] as $flag) {
                if (isset($tuteur[$flag]) && is_string($tuteur[$flag]) && in_array(strtolower($tuteur[$flag]), ['true', 'false'], true)) {
                    $tuteurs[$index][$flag] = strtolower($tuteur[$flag]) === 'true';
                }
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
            'photo' => ['sometimes', 'nullable', ...PhotoProfil::REGLES],
            'paiement' => ['sometimes', 'nullable', 'array'],
            'paiement.mode_paiement' => ['required_with:paiement', Rule::enum(ModePaiement::class)],
            'paiement.date_paiement' => ['sometimes', 'nullable', 'date', 'before_or_equal:today'],
            // Booléen : le montant est celui de la classe (Tarifs), il n'est jamais saisi
            'paiement.frais_inscription' => ['sometimes', 'boolean'],
            'paiement.mensualites' => ['sometimes', 'array', 'max:10'],
            'paiement.mensualites.*.mois' => ['required', 'regex:'.Mensualites::REGEX_MOIS, 'distinct'],
            'paiement.mensualites.*.montant' => ['required', 'numeric', 'min:1', 'max:100000000'],
        ], [
            ...PhotoProfil::messages(),
            'paiement.mode_paiement.required_with' => 'Indiquez le mode de paiement.',
            'paiement.frais_inscription.boolean' => 'Le montant des frais d’inscription est fixé par classe : indiquez seulement s’ils sont payés.',
            'paiement.mensualites.*.mois.regex' => 'Le mois doit être au format AAAA-MM.',
            'paiement.mensualites.*.mois.distinct' => 'Le même mois ne peut être payé qu’une fois dans le formulaire.',
            'paiement.mensualites.*.montant.min' => 'Le montant doit être supérieur à zéro.',
        ]);

        $paiement = $data['paiement'] ?? null;
        if ($paiement && empty($paiement['frais_inscription']) && empty($paiement['mensualites'])) {
            throw ValidationException::withMessages([
                'paiement' => ['Indiquez les frais d’inscription ou au moins une mensualité.'],
            ]);
        }

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

        // Chemin de la photo enregistrée : supprimée si la transaction échoue
        $photoPath = null;
        try {
            $result = DB::transaction(function () use ($data, $request, $class, $year, $paiement, $photos, $encaissement, $frais, &$photoPath): array {
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

                // Frais d'inscription : montant de la classe, reçu INS-… émis immédiatement
                if (! empty($paiement['frais_inscription'])) {
                    $inscription = $frais->encaisser($inscription, $paiement['mode_paiement'], $paiement['date_paiement'] ?? null, $request->user());
                }

                if ($request->hasFile('photo')) {
                    $photoPath = $photos->enregistrer($request->file('photo'), 'eleves');
                    $eleve->forceFill(['photo' => $photoPath])->save();
                }

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
                        'frais_inscription' => $inscription->montant_inscription !== null ? (float) $inscription->montant_inscription : null,
                    ],
                    'created_at' => now(),
                ]);

                // Mensualités payées à l'inscription : mêmes règles et mêmes reçus que POST /v1/paiements
                $recus = [];
                foreach ($paiement['mensualites'] ?? [] as $index => $mensualite) {
                    try {
                        $recus[] = $encaissement->encaisser($inscription, [
                            'mois' => $mensualite['mois'],
                            'montant' => $mensualite['montant'],
                            'mode_paiement' => $paiement['mode_paiement'],
                            'date_paiement' => $paiement['date_paiement'] ?? null,
                        ], $request->user());
                    } catch (ValidationException $exception) {
                        // Erreur rattachée à la ligne du formulaire : paiement.mensualites.{index}.mois|montant
                        throw ValidationException::withMessages(collect($exception->errors())
                            ->mapWithKeys(fn (array $messages, string $champ) => ["paiement.mensualites.$index.$champ" => $messages])
                            ->all());
                    }
                }

                return compact('eleve', 'inscription', 'createdTuteurs', 'recus');
            });
        } catch (\Throwable $exception) {
            $photos->supprimer($photoPath);
            throw $exception;
        }

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
                    'photo' => PhotoProfil::url($result['eleve']->photo),
                    'a_un_compte' => false,
                ],
                'inscription' => [
                    'id' => $result['inscription']->id,
                    'annee_scolaire' => $result['inscription']->annee_scolaire,
                    'date_inscription' => $result['inscription']->date_inscription->toDateString(),
                    'statut' => $result['inscription']->statut,
                    'classe_id' => $result['inscription']->classe_academique_id,
                    'montant_inscription' => $result['inscription']->montant_inscription !== null ? (float) $result['inscription']->montant_inscription : null,
                    'mode_paiement' => $result['inscription']->mode_paiement?->value,
                    'numero_recu_inscription' => $result['inscription']->numero_recu_inscription,
                ],
                'tuteurs' => $result['createdTuteurs'],
                // Reçu des frais d'inscription (null s'ils n'ont pas été payés à l'inscription)
                'recu_inscription' => $result['inscription']->fraisPayes() ? $frais->donneesRecu($result['inscription']) : null,
                // Reçus des mensualités payées à l'inscription (vide si aucune)
                'recus' => collect($result['recus'])->map(fn (Paiement $recu) => $encaissement->donneesRecu($recu->fresh()))->values(),
            ],
        ], 201);
    }

    /**
     * POST /v1/eleves/{eleveId}/tuteurs : rattache un tuteur supplémentaire à un élève existant.
     * Tuteur existant (mode « existant » + tuteur_id) ou compte à créer (mode « creer » + compte,
     * mot de passe temporaire « passer »).
     */
    public function attachTuteur(Request $request, int $eleveId): JsonResponse
    {
        $eleve = Eleve::where('is_archived', false)->findOrFail($eleveId);
        if (is_string($request->input('compte.telephone'))) {
            $request->merge(['compte' => [...$request->input('compte'), 'telephone' => User::normaliserTelephone($request->input('compte.telephone'))]]);
        }
        $data = $request->validate([
            'mode' => ['required', Rule::in(['existant', 'creer'])],
            'tuteur_id' => ['required_if:mode,existant', 'prohibited_unless:mode,existant', 'integer', 'exists:tuteurs,id'],
            'compte' => ['required_if:mode,creer', 'prohibited_unless:mode,creer', 'array'],
            'compte.nom' => ['required_if:mode,creer', 'string', 'max:120'],
            'compte.prenom' => ['required_if:mode,creer', 'string', 'max:120'],
            'compte.sexe' => ['required_if:mode,creer', Rule::in(['M', 'F'])],
            'compte.telephone' => ['required_if:mode,creer', 'nullable', 'string', 'max:16', 'regex:/^\+[1-9]\d{7,14}$/', 'unique:users,telephone'],
            'compte.adresse' => ['nullable', 'string', 'max:255'],
            ...$this->linkRules(),
        ], [
            'compte.telephone.unique' => 'Ce numéro a déjà un compte : choisissez « Tuteur existant ».',
        ]);

        DB::transaction(function () use ($data, $eleve, $request): void {
            if ($data['mode'] === 'existant') {
                $tuteur = Tuteur::with('user')->findOrFail($data['tuteur_id']);
                if ($eleve->tuteurs()->whereKey($tuteur->id)->exists()) {
                    throw ValidationException::withMessages(['tuteur_id' => ['Ce tuteur est déjà rattaché à cet élève.']]);
                }
            } else {
                $user = User::create([
                    'matricule' => 'USR-'.Str::upper(Str::random(12)),
                    'nom' => $data['compte']['nom'],
                    'prenom' => $data['compte']['prenom'],
                    'sexe' => $data['compte']['sexe'],
                    'telephone' => $data['compte']['telephone'],
                    'adresse' => $data['compte']['adresse'] ?? null,
                    'password' => 'passer',
                    'must_change_password' => true,
                    'role' => 'tuteur',
                    'statut' => 'actif',
                ]);
                $tuteur = Tuteur::create(['user_id' => $user->id]);
                $tuteur->setRelation('user', $user);
            }
            if (! $tuteur->user || ! $tuteur->user->estActif() || $tuteur->user->role->value !== 'tuteur') {
                throw ValidationException::withMessages(['tuteur_id' => ['Le compte choisi doit être un Tuteur actif et non archivé.']]);
            }

            $eleve->tuteurs()->attach($tuteur->id, [
                'lien_parente' => $data['lien_parente'] ?? null,
                'est_responsable_legal' => $data['est_responsable_legal'] ?? false,
                'est_payeur' => $data['est_payeur'] ?? false,
            ]);
            $this->auditTuteur($request, $eleve, 'eleve.tuteur_rattache', $tuteur->id, ['compte_cree' => $data['mode'] === 'creer']);
        });

        return response()->json([
            'message' => $data['mode'] === 'creer'
                ? 'Tuteur créé et rattaché. Mot de passe temporaire : passer.'
                : 'Tuteur rattaché.',
            'data' => $this->studentData($eleve->fresh(['tuteurs.user', 'inscriptions.classeAcademique'])),
        ], 201);
    }

    /** PATCH /v1/eleves/{eleveId}/tuteurs/{tuteurId} : lien de parenté, responsable légal, payeur. */
    public function updateTuteurLink(Request $request, int $eleveId, int $tuteurId): JsonResponse
    {
        $eleve = Eleve::where('is_archived', false)->findOrFail($eleveId);
        abort_unless($eleve->tuteurs()->whereKey($tuteurId)->exists(), 404);
        $data = $request->validate($this->linkRules());

        $eleve->tuteurs()->updateExistingPivot($tuteurId, $data);
        $this->auditTuteur($request, $eleve, 'eleve.tuteur_modifie', $tuteurId, $data);

        return response()->json([
            'message' => 'Rattachement modifié.',
            'data' => $this->studentData($eleve->fresh(['tuteurs.user', 'inscriptions.classeAcademique'])),
        ]);
    }

    /**
     * POST /v1/eleves/{eleveId}/tuteurs/{tuteurId}/retirer : retire un rattachement.
     * L'élève garde au moins un tuteur ; le compte du tuteur n'est pas touché.
     */
    public function detachTuteur(Request $request, int $eleveId, int $tuteurId): JsonResponse
    {
        $eleve = Eleve::where('is_archived', false)->findOrFail($eleveId);

        DB::transaction(function () use ($eleve, $tuteurId, $request): void {
            $linked = $eleve->tuteurs()->lockForUpdate()->pluck('tuteurs.id');
            abort_unless($linked->contains($tuteurId), 404);
            if ($linked->count() === 1) {
                throw ValidationException::withMessages(['tuteur_id' => ['Un élève doit garder au moins un tuteur.']]);
            }
            $eleve->tuteurs()->detach($tuteurId);
            $this->auditTuteur($request, $eleve, 'eleve.tuteur_retire', $tuteurId, []);
        });

        return response()->json([
            'message' => 'Tuteur retiré de cet élève.',
            'data' => $this->studentData($eleve->fresh(['tuteurs.user', 'inscriptions.classeAcademique'])),
        ]);
    }

    /** Règles communes d'un rattachement élève ↔ tuteur. */
    private function linkRules(): array
    {
        return [
            'lien_parente' => ['sometimes', 'nullable', 'string', 'max:40'],
            'est_responsable_legal' => ['sometimes', 'boolean'],
            'est_payeur' => ['sometimes', 'boolean'],
        ];
    }

    private function auditTuteur(Request $request, Eleve $eleve, string $action, int $tuteurId, array $metadata): void
    {
        AuditEvent::create([
            'actor_user_id' => $request->user()->id,
            'action' => $action,
            'entity_type' => 'eleve',
            'entity_id' => $eleve->id,
            'metadata' => ['tuteur_id' => $tuteurId, ...$metadata],
            'created_at' => now(),
        ]);
    }

    /**
     * POST /v1/eleves/{eleveId}/photo : ajoute ou remplace la photo de l'élève (multipart, champ « photo »).
     */
    public function updatePhoto(Request $request, int $eleveId, PhotoProfil $photos): JsonResponse
    {
        $eleve = Eleve::where('is_archived', false)->findOrFail($eleveId);
        $request->validate(['photo' => ['required', ...PhotoProfil::REGLES]], [
            ...PhotoProfil::messages(),
            'photo.required' => 'Choisissez une photo.',
        ]);

        $ancienne = $eleve->photo;
        $eleve->forceFill(['photo' => $photos->enregistrer($request->file('photo'), 'eleves')])->save();
        $photos->supprimer($ancienne);

        AuditEvent::create([
            'actor_user_id' => $request->user()->id,
            'action' => 'eleve.photo_updated',
            'entity_type' => 'eleve',
            'entity_id' => $eleve->id,
            'metadata' => [],
            'created_at' => now(),
        ]);

        return response()->json([
            'message' => 'Photo enregistrée.',
            'data' => ['id' => $eleve->id, 'photo' => PhotoProfil::url($eleve->photo)],
        ]);
    }

    public function show(Request $request, int $eleveId): JsonResponse
    {
        $request->validate(['include_archived' => ['sometimes', 'boolean']]);
        $eleve = Eleve::with(['tuteurs.user', 'inscriptions.classeAcademique', 'diplomes'])
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
            ->with([
                'inscriptions' => fn ($inscriptions) => $inscriptions->where('is_archived', false)->with('classeAcademique'),
                'diplomes' => fn ($diplomes) => $diplomes->whereNull('annule_at')->orderByDesc('date_obtention'),
            ])])
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        return response()->json([
            'data' => $tuteur->eleves->map(fn (Eleve $eleve) => [
                'id' => $eleve->id,
                'matricule' => $eleve->matricule,
                'nom' => $eleve->nom,
                'prenom' => $eleve->prenom,
                'photo' => PhotoProfil::url($eleve->photo),
                'inscriptions' => $eleve->inscriptions->map(fn (Inscription $inscription) => [
                    'id' => $inscription->id,
                    'annee_scolaire' => $inscription->annee_scolaire,
                    'statut' => $inscription->statut,
                    'classe_id' => $inscription->classe_academique_id,
                    'classe' => $inscription->classeAcademique?->nom,
                ]),
                // Diplômes délivrés (imprimables depuis l'espace tuteur)
                'diplomes' => $eleve->diplomes->map(fn (Diplome $diplome) => DiplomeController::resume($diplome))->values(),
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
            ->where('statut', 'validee')
            ->orderByDesc('date_fin')
            ->limit(5)
            ->get();
        $yearStart = (int) substr(AnneeScolaire::courante(), 0, 4);
        $presenceStart = sprintf('%04d-10-01', $yearStart);
        $presenceEnd = sprintf('%04d-09-30', $yearStart + 1);
        $presenceCounts = DB::table('presences')
            ->where('eleve_id', $eleve->id)
            ->whereBetween('date_cours', [$presenceStart, $presenceEnd])
            ->select('statut', DB::raw('COUNT(*) as total'))
            ->groupBy('statut')
            ->pluck('total', 'statut');
        $recentPresences = DB::table('presences')
            ->where('eleve_id', $eleve->id)
            ->whereBetween('date_cours', [$presenceStart, $presenceEnd])
            ->orderByDesc('date_cours')
            ->limit(10)
            ->get(['date_cours', 'statut']);
        $month = now(config('app.timezone'))->format('Y-m');
        $behavior = DB::table('evaluations_exemplarite')
            ->where('eleve_id', $eleve->id)
            ->where('mois', $month)
            ->first();
        $recitationNotes = $latestSheets->flatMap(
            fn (FicheHebdomadaire $fiche) => $fiche->notes->filter(fn ($note) => $note->qualite_recitation !== null)
        )->values();
        $recitationGrades = $recitationNotes->pluck('qualite_recitation');
        $averageRecitation = $recitationGrades->isNotEmpty()
            ? round($recitationGrades->avg() * 5, 2)
            : null;

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
                    'moyenne_periode' => $averageRecitation,
                    'moyenne_periode_precedente' => null,
                    'tendance' => $averageRecitation === null ? 'non_evalue' : 'evalue',
                    'dernieres_evaluations' => $recitationNotes->take(5)->map(fn ($note) => [
                        'note' => round($note->qualite_recitation * 5, 2),
                        'sur' => 20,
                        'date' => $note->updated_at->toDateString(),
                    ]),
                ],
                'comportement' => $behavior ? [
                    'mois' => $behavior->mois,
                    'assiduite_ponctualite' => $behavior->assiduite_ponctualite,
                    'discipline_comportement' => $behavior->discipline_comportement,
                    'proprete_hygiene' => $behavior->proprete_hygiene,
                    'camaraderie_respect' => $behavior->camaraderie_respect,
                    'prieres_devotion' => $behavior->prieres_devotion,
                ] : null,
                'presences' => [
                    'periode' => ['du' => $presenceStart, 'au' => $presenceEnd],
                    'totaux' => [
                        'present' => (int) ($presenceCounts['present'] ?? 0),
                        'absent' => (int) ($presenceCounts['absent'] ?? 0),
                        'retard' => (int) ($presenceCounts['retard'] ?? 0),
                        'excuse' => (int) ($presenceCounts['excuse'] ?? 0),
                    ],
                    'dernieres' => $recentPresences->map(fn ($presence) => [
                        'date' => $presence->date_cours,
                        'statut' => $presence->statut,
                    ]),
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
                        'reperes' => [
                            'D' => $note->d_sourate_debut === null ? null : [
                                'sourate_debut_id' => $note->d_sourate_debut,
                                'verset_debut' => $note->d_verset_debut,
                                'sourate_fin_id' => $note->d_sourate_fin,
                                'verset_fin' => $note->d_verset_fin,
                            ],
                            'J' => $note->j_sourate_debut === null ? null : [
                                'sourate_debut_id' => $note->j_sourate_debut,
                                'verset_debut' => $note->j_verset_debut,
                                'sourate_fin_id' => $note->j_sourate_fin,
                                'verset_fin' => $note->j_verset_fin,
                            ],
                            'M' => $note->m_sourate_debut === null ? null : [
                                'sourate_debut_id' => $note->m_sourate_debut,
                                'verset_debut' => $note->m_verset_debut,
                                'sourate_fin_id' => $note->m_sourate_fin,
                                'verset_fin' => $note->m_verset_fin,
                            ],
                        ],
                        'qualite_recitation' => $note->qualite_recitation,
                    ]),
                    'statut' => $fiche->statut,
                ]),
                'diplomes' => $eleve->diplomes()->whereNull('annule_at')->orderByDesc('date_obtention')->get()
                    ->map(fn (Diplome $diplome) => DiplomeController::resume($diplome))->values(),
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
            'photo' => PhotoProfil::url($eleve->photo),
            'statut' => $eleve->statut,
            'is_archived' => $eleve->is_archived,
            'archived_at' => $eleve->archived_at?->toIso8601String(),
            'inscriptions' => $eleve->inscriptions->map(fn (Inscription $inscription) => [
                'id' => $inscription->id,
                'annee_scolaire' => $inscription->annee_scolaire,
                'statut' => $inscription->statut,
                'classe_id' => $inscription->classe_academique_id,
                'classe' => $inscription->classeAcademique?->nom,
                'montant_inscription' => $inscription->montant_inscription !== null ? (float) $inscription->montant_inscription : null,
                'mode_paiement' => $inscription->mode_paiement?->value,
                // Frais d'inscription : montant fixé pour la classe, réglés ou non, numéro du reçu
                'frais_inscription' => $inscription->classeAcademique?->fraisInscriptionAppliques(),
                'frais_payes' => $inscription->fraisPayes(),
                'numero_recu_inscription' => $inscription->numero_recu_inscription,
                'date_paiement_inscription' => $inscription->date_paiement_inscription?->toDateString(),
            ]),
            'diplomes' => $eleve->relationLoaded('diplomes')
                ? $eleve->diplomes->sortByDesc('date_obtention')->values()->map(fn (Diplome $diplome) => DiplomeController::resume($diplome))
                : [],
            'tuteurs' => $eleve->tuteurs->map(fn (Tuteur $tuteur) => [
                'id' => $tuteur->id,
                'user_id' => $tuteur->user_id,
                'nom' => $tuteur->user?->nom,
                'prenom' => $tuteur->user?->prenom,
                'telephone' => $tuteur->user?->telephone,
                'lien_parente' => $tuteur->pivot?->lien_parente,
                'est_responsable_legal' => (bool) $tuteur->pivot?->est_responsable_legal,
                'est_payeur' => (bool) $tuteur->pivot?->est_payeur,
            ]),
        ];
    }
}
