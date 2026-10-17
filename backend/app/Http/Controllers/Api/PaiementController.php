<?php

namespace App\Http\Controllers\Api;

use App\Enums\ModePaiement;
use App\Enums\Role;
use App\Enums\StatutPaiement;
use App\Http\Controllers\Controller;
use App\Models\AuditEvent;
use App\Models\ClasseAcademique;
use App\Models\Eleve;
use App\Models\Inscription;
use App\Models\Paiement;
use App\Models\RappelPaiement;
use App\Models\Tuteur;
use App\Services\EncaissementMensualite;
use App\Services\PhotoProfil;
use App\Services\RappelsPaiement;
use App\Support\AnneeScolaire;
use App\Support\Mensualites;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Mensualités : suivi des paiements reçus au secrétariat, reçus, tarifs et rappels WhatsApp.
 * Aucun paiement en ligne : l'administration enregistre ce qu'elle encaisse.
 */
class PaiementController extends Controller
{
    /** Nombre d'élèves par page dans la liste du mois. */
    private const PAR_PAGE = 20;

    public function __construct(
        private readonly RappelsPaiement $rappels,
        private readonly EncaissementMensualite $encaissement,
    ) {}

    /**
     * GET /v1/paiements : situation de tous les élèves pour un mois
     * (filtres : statut, classe, recherche), indicateurs et état des rappels.
     */
    public function index(Request $request): JsonResponse
    {
        $filtres = $request->validate([
            'mois' => ['sometimes', 'regex:'.Mensualites::REGEX_MOIS],
            'statut' => ['nullable', Rule::enum(StatutPaiement::class)],
            'classe_id' => ['nullable', 'integer'],
            'q' => ['nullable', 'string', 'max:120'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);
        $mois = $filtres['mois'] ?? Mensualites::moisParDefaut();
        $annee = Mensualites::anneeDuMois($mois);

        $situation = Mensualites::situation($mois);

        // Indicateurs du mois (tous les élèves, avant filtres)
        $stats = [
            'attendu' => $situation->sum('montant_du'),
            'encaisse' => $situation->sum('montant_paye'),
            'reste' => $situation->sum('reste'),
            'eleves' => $situation->count(),
            'payes' => $situation->where('statut', StatutPaiement::Paye)->count(),
            'partiels' => $situation->where('statut', StatutPaiement::Partiel)->count(),
            'impayes' => $situation->where('statut', StatutPaiement::Impaye)->count(),
        ];

        // Filtres
        $recherche = mb_strtolower(trim($filtres['q'] ?? ''));
        $lignes = $situation
            ->when($filtres['statut'] ?? null, fn ($lignes, $statut) => $lignes->filter(fn ($ligne) => $ligne['statut']->value === $statut))
            ->when($filtres['classe_id'] ?? null, fn ($lignes, $classeId) => $lignes->filter(fn ($ligne) => $ligne['inscription']->classe_academique_id === (int) $classeId))
            ->when($recherche !== '', fn ($lignes) => $lignes->filter(fn ($ligne) => str_contains(
                mb_strtolower($ligne['eleve']->prenom.' '.$ligne['eleve']->nom.' '.$ligne['eleve']->nom.' '.$ligne['eleve']->prenom.' '.$ligne['eleve']->matricule),
                $recherche,
            )))
            ->values();

        // Pagination
        $page = (int) ($filtres['page'] ?? 1);
        $total = $lignes->count();
        $pageLignes = $lignes->forPage($page, self::PAR_PAGE)->values();

        // Dernier rappel par parent pour ce mois (affiché sur chaque ligne)
        $derniersRappels = RappelPaiement::where('mois', $mois)->orderByDesc('id')->get()->unique('tuteur_id')->keyBy('tuteur_id');

        return response()->json(['data' => [
            'mois' => $mois,
            'mois_libelle' => Mensualites::libelleMois($mois),
            'annee_scolaire' => $annee,
            'mois_disponibles' => collect(Mensualites::moisDeLAnnee($annee))
                ->map(fn (string $valeur) => ['value' => $valeur, 'label' => Mensualites::libelleMois($valeur)]),
            'devise' => config('paiements.devise'),
            'stats' => $stats,
            'items' => $pageLignes->map(fn (array $ligne) => $this->ligneData($ligne, $mois, $derniersRappels)),
            'pagination' => [
                'page' => $page,
                'last_page' => max(1, (int) ceil($total / self::PAR_PAGE)),
                'total' => $total,
            ],
            'classes' => ClasseAcademique::where('annee_scolaire', $annee)->where('is_archived', false)
                ->orderBy('nom')->get(['id', 'nom']),
            'modes' => collect(ModePaiement::cases())->map->value,
            'rappels' => $this->etatRappels($mois),
        ]]);
    }

    /**
     * POST /v1/paiements : enregistre un paiement reçu et attribue un numéro de reçu.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'eleve_id' => ['required', 'integer', Rule::exists('eleves', 'id')->where('is_archived', 0)],
            'mois' => ['required', 'regex:'.Mensualites::REGEX_MOIS],
            'montant' => ['required', 'numeric', 'min:1', 'max:100000000'],
            'mode_paiement' => ['required', Rule::enum(ModePaiement::class)],
            'date_paiement' => ['sometimes', 'date', 'before_or_equal:today'],
            'note' => ['nullable', 'string', 'max:255'],
        ], [
            'eleve_id.exists' => 'Élève introuvable ou archivé.',
            'mois.regex' => 'Le mois doit être au format AAAA-MM.',
            'montant.min' => 'Le montant doit être supérieur à zéro.',
            'date_paiement.before_or_equal' => 'La date du paiement ne peut pas être dans le futur.',
        ]);

        if (! Mensualites::estMoisFacture($data['mois'])) {
            throw ValidationException::withMessages(['mois' => 'Ce mois ne fait pas partie des mois facturés.']);
        }

        $inscription = Mensualites::inscriptionsConcernees($data['mois'])->firstWhere('eleve_id', (int) $data['eleve_id']);
        if (! $inscription) {
            throw ValidationException::withMessages(['eleve_id' => 'Cet élève n’a pas d’inscription active pour ce mois.']);
        }

        $paiement = $this->encaissement->encaisser($inscription, $data, $request->user());

        return response()->json([
            'message' => 'Paiement enregistré.',
            'data' => $this->encaissement->donneesRecu($paiement->fresh()),
        ], 201);
    }

    /**
     * GET /v1/paiements/{id}/recu : données du reçu à imprimer (Admin, ou tuteur rattaché à l'élève).
     */
    public function recu(Request $request, int $paiementId): JsonResponse
    {
        $paiement = Paiement::findOrFail($paiementId);
        if ($request->user()->role === Role::Tuteur && ! $this->enfantsDuTuteur($request)->contains($paiement->eleve_id)) {
            return response()->json(['message' => 'Ce reçu ne concerne pas vos enfants.'], 403);
        }

        return response()->json(['data' => $this->encaissement->donneesRecu($paiement)]);
    }

    /**
     * GET /v1/tuteur/me/recus : tous les reçus (mensualités et frais d'inscription) des enfants
     * du tuteur connecté, du plus récent au plus ancien. Les reçus annulés sont signalés.
     */
    public function mesRecus(Request $request): JsonResponse
    {
        $enfants = $this->enfantsDuTuteur($request);
        $eleve = fn ($eleve) => $eleve ? ['id' => $eleve->id, 'matricule' => $eleve->matricule, 'nom' => $eleve->nom, 'prenom' => $eleve->prenom] : null;

        $mensualites = Paiement::with(['eleve', 'inscription.classeAcademique'])->whereIn('eleve_id', $enfants)->get()
            ->map(fn (Paiement $paiement) => [
                'type' => 'mensualite',
                'id' => $paiement->id,
                'numero_recu' => $paiement->numero_recu,
                'date_paiement' => $paiement->date_paiement->toDateString(),
                'mois' => $paiement->mois,
                'libelle' => 'Mensualité de '.Mensualites::libelleMois($paiement->mois),
                'annee_scolaire' => $paiement->annee_scolaire,
                'eleve' => $eleve($paiement->eleve),
                'classe' => $paiement->inscription?->classeAcademique?->nom,
                'montant' => (float) $paiement->montant,
                'mode_paiement' => $paiement->mode_paiement->value,
                'annule' => $paiement->estAnnule(),
            ]);
        $inscriptions = Inscription::with(['eleve', 'classeAcademique'])->whereIn('eleve_id', $enfants)
            ->whereNotNull('numero_recu_inscription')->get()
            ->map(fn (Inscription $inscription) => [
                'type' => 'inscription',
                'id' => $inscription->id,
                'numero_recu' => $inscription->numero_recu_inscription,
                'date_paiement' => $inscription->date_paiement_inscription?->toDateString(),
                'mois' => null,
                'libelle' => 'Frais d’inscription '.$inscription->annee_scolaire,
                'annee_scolaire' => $inscription->annee_scolaire,
                'eleve' => $eleve($inscription->eleve),
                'classe' => $inscription->classeAcademique?->nom,
                'montant' => (float) $inscription->montant_inscription,
                'mode_paiement' => $inscription->mode_paiement?->value,
                'annule' => false,
            ]);
        $recus = $mensualites->concat($inscriptions)
            ->sortBy([['date_paiement', 'desc'], ['numero_recu', 'desc']])->values();

        return response()->json(['data' => [
            'recus' => $recus,
            'total_paye' => $recus->where('annule', false)->sum('montant'),
            'devise' => config('paiements.devise'),
        ]]);
    }

    /** Identifiants des enfants rattachés au tuteur connecté. */
    private function enfantsDuTuteur(Request $request)
    {
        $tuteur = Tuteur::where('user_id', $request->user()->id)->first();

        return $tuteur ? $tuteur->eleves()->pluck('eleves.id') : collect();
    }

    /**
     * POST /v1/paiements/{id}/annuler : annule un reçu erroné (il reste en base, marqué annulé).
     */
    public function annuler(Request $request, int $paiementId): JsonResponse
    {
        $data = $request->validate([
            'motif' => ['required', 'string', 'min:3', 'max:255'],
        ], [
            'motif.required' => 'Indiquez le motif de l’annulation.',
        ]);

        $paiement = Paiement::findOrFail($paiementId);
        if ($paiement->estAnnule()) {
            throw ValidationException::withMessages(['motif' => 'Ce reçu est déjà annulé.']);
        }

        $paiement->update([
            'annule_at' => now(),
            'annule_par' => $request->user()->id,
            'motif_annulation' => $data['motif'],
        ]);

        AuditEvent::create([
            'actor_user_id' => $request->user()->id,
            'action' => 'paiement.annule',
            'entity_type' => 'paiement',
            'entity_id' => $paiement->id,
            'metadata' => ['motif' => $data['motif']],
            'created_at' => now(),
        ]);

        return response()->json(['message' => 'Reçu annulé.', 'data' => $this->encaissement->donneesRecu($paiement->fresh())]);
    }

    /**
     * GET /v1/paiements/tarifs : mensualité et frais d'inscription de chaque classe de l'année en cours.
     */
    public function tarifs(): JsonResponse
    {
        $defaut = (float) config('paiements.mensualite_par_defaut');

        return response()->json(['data' => [
            'annee_scolaire' => AnneeScolaire::courante(),
            'defaut' => $defaut,
            'defaut_frais_inscription' => (float) config('paiements.frais_inscription_par_defaut'),
            'devise' => config('paiements.devise'),
            'classes' => ClasseAcademique::where('annee_scolaire', AnneeScolaire::courante())
                ->where('is_archived', false)->orderBy('nom')->get()
                ->map(fn (ClasseAcademique $classe) => [
                    'id' => $classe->id,
                    'nom' => $classe->nom,
                    'niveau' => $classe->niveau,
                    'mensualite' => $classe->mensualite !== null ? (float) $classe->mensualite : null,
                    'mensualite_appliquee' => $classe->mensualiteAppliquee(),
                    'frais_inscription' => $classe->frais_inscription !== null ? (float) $classe->frais_inscription : null,
                    'frais_inscription_appliques' => $classe->fraisInscriptionAppliques(),
                ]),
        ]]);
    }

    /**
     * PUT /v1/paiements/tarifs : modifie la mensualité et/ou les frais d'inscription des classes
     * (vide = montant par défaut ; champ absent = inchangé). N'affecte pas les reçus déjà émis.
     */
    public function updateTarifs(Request $request): JsonResponse
    {
        $data = $request->validate([
            'tarifs' => ['required', 'array', 'min:1'],
            'tarifs.*.classe_id' => ['required', 'integer', Rule::exists('classes_academiques', 'id')],
            'tarifs.*.mensualite' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100000000'],
            'tarifs.*.frais_inscription' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100000000'],
        ]);

        DB::transaction(function () use ($data, $request) {
            foreach ($data['tarifs'] as $tarif) {
                $valeurs = collect($tarif)->only(['mensualite', 'frais_inscription'])->all();
                if ($valeurs !== []) {
                    ClasseAcademique::whereKey($tarif['classe_id'])->update($valeurs);
                }
            }
            AuditEvent::create([
                'actor_user_id' => $request->user()->id,
                'action' => 'paiement.tarifs_modifies',
                'entity_type' => 'tarifs',
                'entity_id' => 0, // plusieurs classes : le détail est dans metadata
                'metadata' => ['tarifs' => $data['tarifs']],
                'created_at' => now(),
            ]);
        });

        return response()->json(['message' => 'Tarifs enregistrés.']);
    }

    /**
     * GET /v1/paiements/rappels?mois= : journal des rappels envoyés pour un mois.
     */
    public function rappels(Request $request): JsonResponse
    {
        $filtres = $request->validate([
            'mois' => ['sometimes', 'regex:'.Mensualites::REGEX_MOIS],
            'statut' => ['sometimes', 'nullable', Rule::in(['envoye', 'simule', 'echec'])],
        ]);
        $mois = $filtres['mois'] ?? Mensualites::moisParDefaut();
        $base = RappelPaiement::where('mois', $mois);

        return response()->json([
            'data' => (clone $base)->with(['tuteur.user', 'expediteur'])
                ->when($filtres['statut'] ?? null, fn ($query, $statut) => $query->where('statut', $statut))
                ->orderByDesc('id')->limit(200)->get()
                ->map(fn (RappelPaiement $rappel) => [
                    'id' => $rappel->id,
                    'mois' => $rappel->mois,
                    'tuteur' => trim(($rappel->tuteur?->user?->prenom ?? '').' '.($rappel->tuteur?->user?->nom ?? '')),
                    'telephone' => $rappel->telephone,
                    'canal' => $rappel->canal,
                    'statut' => $rappel->statut,
                    'automatique' => $rappel->automatique,
                    // Envoi manuel : qui a cliqué sur « Envoyer les rappels »
                    'envoye_par' => $rappel->expediteur ? trim($rappel->expediteur->prenom.' '.$rappel->expediteur->nom) : null,
                    'message' => $rappel->message,
                    'erreur' => $rappel->erreur,
                    'created_at' => $rappel->created_at?->toIso8601String(),
                ]),
            // Totaux du mois, tous statuts confondus
            'totaux' => [
                'envoye' => (clone $base)->where('statut', 'envoye')->count(),
                'simule' => (clone $base)->where('statut', 'simule')->count(),
                'echec' => (clone $base)->where('statut', 'echec')->count(),
            ],
        ]);
    }

    /**
     * POST /v1/paiements/rappels : envoie maintenant les rappels du mois
     * à tous les parents dont un enfant n'est pas à jour.
     */
    public function envoyerRappels(Request $request): JsonResponse
    {
        $data = $request->validate(['mois' => ['required', 'regex:'.Mensualites::REGEX_MOIS]]);
        if (! Mensualites::estMoisFacture($data['mois'])) {
            throw ValidationException::withMessages(['mois' => 'Ce mois ne fait pas partie des mois facturés.']);
        }

        $bilan = $this->rappels->envoyer($data['mois'], false, $request->user());
        $total = $bilan['envoyes'] + $bilan['simules'];

        return response()->json([
            'message' => $total === 0 && $bilan['echecs'] === 0
                ? 'Aucun parent à relancer : tous les élèves sont à jour.'
                : $total.' rappel(s) envoyé(s)'.($bilan['echecs'] ? ', '.$bilan['echecs'].' échec(s)' : '').'.',
            'data' => $bilan + ['pilote' => $this->rappels->pilote()],
        ]);
    }

    /**
     * GET /v1/tuteur/me/paiements : mensualités de l'année en cours pour les enfants du tuteur connecté.
     */
    public function mine(Request $request): JsonResponse
    {
        $tuteur = Tuteur::where('user_id', $request->user()->id)->firstOrFail();
        $annee = AnneeScolaire::courante();
        $moisCourant = Mensualites::moisCourant();

        $inscriptions = Inscription::with(['eleve', 'classeAcademique'])
            ->whereIn('eleve_id', $tuteur->eleves()->where('eleves.is_archived', false)->pluck('eleves.id'))
            ->where('annee_scolaire', $annee)->where('statut', 'active')->where('is_archived', false)
            ->get()->unique('eleve_id');

        $paiements = Paiement::valides()->whereIn('eleve_id', $inscriptions->pluck('eleve_id'))
            ->where('annee_scolaire', $annee)->get()->groupBy(fn (Paiement $paiement) => $paiement->eleve_id.'|'.$paiement->mois);

        return response()->json(['data' => $inscriptions->values()->map(function (Inscription $inscription) use ($paiements, $moisCourant) {
            $debut = CarbonImmutable::parse($inscription->date_inscription)->format('Y-m');

            return [
                'eleve' => $this->eleveData($inscription->eleve),
                'classe' => $inscription->classeAcademique?->nom,
                'mois' => collect(Mensualites::moisDeLAnnee($inscription->annee_scolaire))
                    ->filter(fn (string $mois) => $mois >= $debut)
                    ->values()
                    ->map(function (string $mois) use ($inscription, $paiements, $moisCourant) {
                        $ligne = Mensualites::ligne($inscription, $paiements->get($inscription->eleve_id.'|'.$mois, collect()));

                        return [
                            'mois' => $mois,
                            'libelle' => Mensualites::libelleMois($mois),
                            'montant_du' => $ligne['montant_du'],
                            'montant_paye' => $ligne['montant_paye'],
                            'reste' => $ligne['reste'],
                            'statut' => $ligne['statut']->value,
                            'a_venir' => $mois > $moisCourant,
                        ];
                    }),
            ];
        })]);
    }

    /* ------------------------------------------------------------------ */

    /** Une ligne de la liste du mois. */
    private function ligneData(array $ligne, string $mois, $derniersRappels): array
    {
        $tuteurs = $ligne['eleve']->tuteurs;
        $aPrevenir = Mensualites::tuteursAPrevenir($ligne['eleve']);
        $dernierRappel = $aPrevenir->map(fn (Tuteur $tuteur) => $derniersRappels->get($tuteur->id))->filter()->sortByDesc('id')->first();

        return [
            'eleve' => $this->eleveData($ligne['eleve']),
            'classe' => $ligne['inscription']->classeAcademique
                ? ['id' => $ligne['inscription']->classeAcademique->id, 'nom' => $ligne['inscription']->classeAcademique->nom]
                : null,
            'montant_du' => $ligne['montant_du'],
            'montant_paye' => $ligne['montant_paye'],
            'reste' => $ligne['reste'],
            'statut' => $ligne['statut']->value,
            'paiements' => $ligne['paiements']->map(fn (Paiement $paiement) => [
                'id' => $paiement->id,
                'numero_recu' => $paiement->numero_recu,
                'montant' => (float) $paiement->montant,
                'mode_paiement' => $paiement->mode_paiement->value,
                'date_paiement' => $paiement->date_paiement->toDateString(),
            ]),
            'tuteurs' => $tuteurs->map(fn (Tuteur $tuteur) => [
                'id' => $tuteur->id,
                'nom' => trim(($tuteur->user?->prenom ?? '').' '.($tuteur->user?->nom ?? '')),
                'telephone' => $tuteur->user?->telephone,
            ])->values(),
            // Lien WhatsApp manuel (numéro + message pré-rempli), seulement si l'élève n'est pas à jour
            'whatsapp' => $ligne['statut'] !== StatutPaiement::Paye ? $this->rappels->lienManuel($ligne, $mois) : null,
            'dernier_rappel' => $dernierRappel ? [
                'statut' => $dernierRappel->statut,
                'date' => $dernierRappel->created_at?->toIso8601String(),
            ] : null,
        ];
    }

    private function eleveData(Eleve $eleve): array
    {
        return ['id' => $eleve->id, 'matricule' => $eleve->matricule, 'nom' => $eleve->nom, 'prenom' => $eleve->prenom, 'photo' => PhotoProfil::url($eleve->photo)];
    }

    /** État des rappels automatiques pour le mois affiché. */
    private function etatRappels(string $mois): array
    {
        $jour = (int) config('paiements.rappel.jour');
        $dernier = RappelPaiement::where('mois', $mois)->latest('id')->first();

        return [
            'pilote' => $this->rappels->pilote(),
            'jour' => $jour,
            'heure' => config('paiements.rappel.heure'),
            // Date à partir de laquelle l'envoi automatique a lieu pour ce mois
            'date_envoi_auto' => $mois.'-'.str_pad((string) $jour, 2, '0', STR_PAD_LEFT),
            'envoyes' => RappelPaiement::where('mois', $mois)->whereIn('statut', ['envoye', 'simule'])->count(),
            'echecs' => RappelPaiement::where('mois', $mois)->where('statut', 'echec')->count(),
            'dernier_envoi' => $dernier?->created_at?->toIso8601String(),
        ];
    }
}
