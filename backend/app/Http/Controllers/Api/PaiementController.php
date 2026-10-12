<?php

namespace App\Http\Controllers\Api;

use App\Enums\ModePaiement;
use App\Enums\StatutPaiement;
use App\Http\Controllers\Controller;
use App\Models\AuditEvent;
use App\Models\ClasseAcademique;
use App\Models\Eleve;
use App\Models\Inscription;
use App\Models\Paiement;
use App\Models\RappelPaiement;
use App\Models\Tuteur;
use App\Services\RappelsPaiement;
use App\Support\AnneeScolaire;
use App\Support\Mensualites;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
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

    public function __construct(private readonly RappelsPaiement $rappels) {}

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

        $paiement = DB::transaction(function () use ($data, $request) {
            $inscription = Mensualites::inscriptionsConcernees($data['mois'])->firstWhere('eleve_id', (int) $data['eleve_id']);
            if (! $inscription) {
                throw ValidationException::withMessages(['eleve_id' => 'Cet élève n’a pas d’inscription active pour ce mois.']);
            }

            // Verrouille les paiements du mois de cet élève pour éviter un double encaissement simultané
            $dejaPayes = Paiement::valides()->where('eleve_id', $inscription->eleve_id)->where('mois', $data['mois'])
                ->lockForUpdate()->get();
            $ligne = Mensualites::ligne($inscription, $dejaPayes);

            if ($ligne['reste'] <= 0) {
                throw ValidationException::withMessages(['mois' => 'Cette mensualité est déjà entièrement réglée.']);
            }
            if ((float) $data['montant'] > $ligne['reste']) {
                throw ValidationException::withMessages([
                    'montant' => 'Le montant dépasse le reste à payer ('.Mensualites::formaterMontant($ligne['reste']).').',
                ]);
            }

            $paiement = Paiement::create([
                'eleve_id' => $inscription->eleve_id,
                'inscription_id' => $inscription->id,
                'annee_scolaire' => $inscription->annee_scolaire,
                'mois' => $data['mois'],
                'montant_du' => $ligne['montant_du'],
                'montant' => $data['montant'],
                'mode_paiement' => $data['mode_paiement'],
                'date_paiement' => $data['date_paiement'] ?? Carbon::today()->toDateString(),
                'note' => $data['note'] ?? null,
                'encaisse_par' => $request->user()->id,
            ]);
            // Numéro de reçu unique et croissant, ex. REC-2026-000042
            $paiement->update(['numero_recu' => sprintf('REC-%s-%06d', now()->format('Y'), $paiement->id)]);

            AuditEvent::create([
                'actor_user_id' => $request->user()->id,
                'action' => 'paiement.encaisse',
                'entity_type' => 'paiement',
                'entity_id' => $paiement->id,
                'metadata' => ['eleve_id' => $paiement->eleve_id, 'mois' => $paiement->mois, 'montant' => (float) $paiement->montant],
                'created_at' => now(),
            ]);

            return $paiement;
        });

        return response()->json([
            'message' => 'Paiement enregistré.',
            'data' => $this->recuData($paiement->fresh()),
        ], 201);
    }

    /**
     * GET /v1/paiements/{id}/recu : données du reçu à imprimer.
     */
    public function recu(int $paiementId): JsonResponse
    {
        return response()->json(['data' => $this->recuData(Paiement::findOrFail($paiementId))]);
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

        return response()->json(['message' => 'Reçu annulé.', 'data' => $this->recuData($paiement->fresh())]);
    }

    /**
     * GET /v1/paiements/tarifs : mensualité de chaque classe de l'année en cours.
     */
    public function tarifs(): JsonResponse
    {
        $defaut = (float) config('paiements.mensualite_par_defaut');

        return response()->json(['data' => [
            'annee_scolaire' => AnneeScolaire::courante(),
            'defaut' => $defaut,
            'devise' => config('paiements.devise'),
            'classes' => ClasseAcademique::where('annee_scolaire', AnneeScolaire::courante())
                ->where('is_archived', false)->orderBy('nom')->get()
                ->map(fn (ClasseAcademique $classe) => [
                    'id' => $classe->id,
                    'nom' => $classe->nom,
                    'niveau' => $classe->niveau,
                    'mensualite' => $classe->mensualite !== null ? (float) $classe->mensualite : null,
                    'mensualite_appliquee' => (float) ($classe->mensualite ?? $defaut),
                ]),
        ]]);
    }

    /**
     * PUT /v1/paiements/tarifs : modifie la mensualité des classes (vide = tarif par défaut).
     * N'affecte pas les reçus déjà émis.
     */
    public function updateTarifs(Request $request): JsonResponse
    {
        $data = $request->validate([
            'tarifs' => ['required', 'array', 'min:1'],
            'tarifs.*.classe_id' => ['required', 'integer', Rule::exists('classes_academiques', 'id')],
            'tarifs.*.mensualite' => ['nullable', 'numeric', 'min:0', 'max:100000000'],
        ]);

        DB::transaction(function () use ($data, $request) {
            foreach ($data['tarifs'] as $tarif) {
                ClasseAcademique::whereKey($tarif['classe_id'])->update(['mensualite' => $tarif['mensualite'] ?? null]);
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
        $mois = $request->validate(['mois' => ['sometimes', 'regex:'.Mensualites::REGEX_MOIS]])['mois'] ?? Mensualites::moisParDefaut();

        return response()->json(['data' => RappelPaiement::with('tuteur.user')->where('mois', $mois)->orderByDesc('id')->limit(200)->get()
            ->map(fn (RappelPaiement $rappel) => [
                'id' => $rappel->id,
                'tuteur' => trim(($rappel->tuteur?->user?->prenom ?? '').' '.($rappel->tuteur?->user?->nom ?? '')),
                'telephone' => $rappel->telephone,
                'statut' => $rappel->statut,
                'automatique' => $rappel->automatique,
                'erreur' => $rappel->erreur,
                'created_at' => $rappel->created_at?->toIso8601String(),
            ])]);
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

    /** Données d'un reçu (impression). */
    private function recuData(Paiement $paiement): array
    {
        $paiement->loadMissing(['eleve.tuteurs.user', 'inscription.classeAcademique', 'caissier', 'annulePar']);
        // Total réglé pour ce mois (paiements valides) et reste après ce paiement
        $totalMois = (float) Paiement::valides()->where('eleve_id', $paiement->eleve_id)->where('mois', $paiement->mois)->sum('montant');
        $payeur = $paiement->eleve ? Mensualites::tuteursAPrevenir($paiement->eleve)->first() : null;

        return [
            'id' => $paiement->id,
            'numero_recu' => $paiement->numero_recu,
            'date_paiement' => $paiement->date_paiement->toDateString(),
            'mois' => $paiement->mois,
            'mois_libelle' => Mensualites::libelleMois($paiement->mois),
            'annee_scolaire' => $paiement->annee_scolaire,
            'eleve' => $paiement->eleve ? $this->eleveData($paiement->eleve) : null,
            'classe' => $paiement->inscription?->classeAcademique?->nom,
            'tuteur' => $payeur ? trim($payeur->user->prenom.' '.$payeur->user->nom) : null,
            'montant' => (float) $paiement->montant,
            'montant_du' => (float) $paiement->montant_du,
            'total_paye_mois' => $totalMois,
            'reste' => max(0, (float) $paiement->montant_du - $totalMois),
            'mode_paiement' => $paiement->mode_paiement->value,
            'note' => $paiement->note,
            'encaisse_par' => $paiement->caissier ? trim($paiement->caissier->prenom.' '.$paiement->caissier->nom) : null,
            'devise' => config('paiements.devise'),
            'annule' => $paiement->estAnnule(),
            'annule_at' => $paiement->annule_at?->toIso8601String(),
            'motif_annulation' => $paiement->motif_annulation,
            'created_at' => $paiement->created_at?->toIso8601String(),
        ];
    }

    private function eleveData(Eleve $eleve): array
    {
        return ['id' => $eleve->id, 'matricule' => $eleve->matricule, 'nom' => $eleve->nom, 'prenom' => $eleve->prenom];
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
