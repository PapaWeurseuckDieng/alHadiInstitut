<?php

namespace App\Http\Controllers\Api;

use App\Enums\CategorieDepense;
use App\Enums\ModePaiement;
use App\Enums\StatutDepense;
use App\Http\Controllers\Controller;
use App\Models\AuditEvent;
use App\Models\Depense;
use App\Models\Inscription;
use App\Models\Paiement;
use App\Models\User;
use App\Support\AnneeScolaire;
use App\Support\Mensualites;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Dépenses de l'institut (Admin uniquement).
 * Cycle : en_attente → validee ou rejetee. Une dépense en attente peut être corrigée ;
 * une dépense traitée ne change plus. Aucune suppression : une erreur se « rejette ».
 * Seules les dépenses validées comptent dans les totaux et le solde.
 */
class DepenseController extends Controller
{
    private const PAR_PAGE = 20;

    /**
     * GET /v1/depenses : liste filtrée + indicateurs de la période.
     * Période : ?mois=AAAA-MM, sinon ?annee_scolaire=AAAA-AAAA, sinon l'année scolaire courante.
     */
    public function index(Request $request): JsonResponse
    {
        $filtres = $request->validate([
            'mois' => ['sometimes', 'nullable', 'regex:'.Mensualites::REGEX_MOIS],
            'annee_scolaire' => ['sometimes', 'nullable', 'regex:/^\d{4}-\d{4}$/'],
            'categorie' => ['sometimes', 'nullable', Rule::enum(CategorieDepense::class)],
            'statut' => ['sometimes', 'nullable', Rule::enum(StatutDepense::class)],
            'q' => ['sometimes', 'nullable', 'string', 'max:120'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ], [
            'mois.regex' => 'Le mois doit être au format AAAA-MM.',
            'annee_scolaire.regex' => 'L’année scolaire doit être au format AAAA-AAAA.',
        ]);

        [$debut, $fin, $periode] = $this->periode($filtres);

        $base = Depense::whereBetween('date_depense', [$debut, $fin]);
        $liste = (clone $base)
            ->with(['auteur', 'traiteePar'])
            ->when($filtres['categorie'] ?? null, fn ($query, $categorie) => $query->where('categorie', $categorie))
            ->when($filtres['statut'] ?? null, fn ($query, $statut) => $query->where('statut', $statut))
            ->when($filtres['q'] ?? null, fn ($query, $recherche) => $query->where(fn ($depenses) => $depenses
                ->where('description', 'like', '%'.$recherche.'%')
                ->orWhere('beneficiaire', 'like', '%'.$recherche.'%')))
            ->orderByDesc('date_depense')
            ->orderByDesc('id')
            ->paginate(self::PAR_PAGE);

        // Indicateurs de toute la période (avant filtres catégorie/statut/recherche)
        $totalValide = (float) (clone $base)->validees()->sum('montant');
        $recettes = $this->recettes($debut, $fin);

        return response()->json(['data' => [
            'periode' => $periode,
            'devise' => config('paiements.devise'),
            'stats' => [
                'total_valide' => $totalValide,
                'total_en_attente' => (float) (clone $base)->where('statut', StatutDepense::EnAttente->value)->sum('montant'),
                'nombre_en_attente' => (clone $base)->where('statut', StatutDepense::EnAttente->value)->count(),
                'par_categorie' => (clone $base)->validees()
                    ->select('categorie', DB::raw('SUM(montant) as total'))
                    ->groupBy('categorie')
                    ->orderByDesc('total')
                    ->get()
                    ->map(fn ($ligne) => [
                        'categorie' => $ligne->categorie instanceof CategorieDepense ? $ligne->categorie->value : $ligne->categorie,
                        'total' => (float) $ligne->total,
                    ]),
                // Recettes encaissées sur la période (mensualités + frais d'inscription)
                'recettes' => $recettes,
                'solde' => $recettes['total'] - $totalValide,
            ],
            'items' => $liste->getCollection()->map(fn (Depense $depense) => $this->depenseData($depense)),
            'pagination' => [
                'page' => $liste->currentPage(),
                'last_page' => $liste->lastPage(),
                'total' => $liste->total(),
            ],
            // Listes de valeurs pour les filtres et le formulaire
            'categories' => collect(CategorieDepense::cases())->map->value,
            'modes' => collect(ModePaiement::cases())->map->value,
            'statuts' => collect(StatutDepense::cases())->map->value,
        ]]);
    }

    /** POST /v1/depenses : enregistre une dépense (statut en_attente). */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->regles(creation: true), $this->messages());

        $depense = DB::transaction(function () use ($data, $request): Depense {
            $dateDepense = $data['date_depense'] ?? Carbon::today()->toDateString();
            $depense = Depense::create([
                ...$data,
                'date_depense' => $dateDepense,
                'annee_scolaire' => AnneeScolaire::courante(CarbonImmutable::parse($dateDepense)),
                'statut' => StatutDepense::EnAttente,
                'created_by' => $request->user()->id,
            ]);
            $this->audit($request->user(), 'depense.created', $depense, ['montant' => (float) $depense->montant]);

            return $depense;
        });

        return response()->json([
            'message' => 'Dépense enregistrée. Elle doit être validée pour compter dans les totaux.',
            'data' => $this->depenseData($depense->fresh(['auteur', 'traiteePar'])),
        ], 201);
    }

    /** GET /v1/depenses/{depenseId} */
    public function show(int $depenseId): JsonResponse
    {
        return response()->json(['data' => $this->depenseData(Depense::with(['auteur', 'traiteePar'])->findOrFail($depenseId))]);
    }

    /** PATCH /v1/depenses/{depenseId} : corrige une dépense encore en attente. */
    public function update(Request $request, int $depenseId): JsonResponse
    {
        $depense = Depense::findOrFail($depenseId);
        if (! $depense->estEnAttente()) {
            return $this->conflit('Seule une dépense en attente peut être modifiée.');
        }
        $data = $request->validate($this->regles(creation: false), $this->messages());

        DB::transaction(function () use ($depense, $data, $request): void {
            $depense->fill($data);
            if (array_key_exists('date_depense', $data)) {
                $depense->annee_scolaire = AnneeScolaire::courante(CarbonImmutable::parse($data['date_depense']));
            }
            $depense->save();
            $this->audit($request->user(), 'depense.updated', $depense, ['champs' => array_keys($data)]);
        });

        return response()->json([
            'message' => 'Dépense modifiée.',
            'data' => $this->depenseData($depense->fresh(['auteur', 'traiteePar'])),
        ]);
    }

    /** POST /v1/depenses/{depenseId}/valider */
    public function valider(Request $request, int $depenseId): JsonResponse
    {
        return $this->traiter($request, $depenseId, StatutDepense::Validee, null, 'Dépense validée.');
    }

    /** POST /v1/depenses/{depenseId}/rejeter : motif obligatoire. */
    public function rejeter(Request $request, int $depenseId): JsonResponse
    {
        $data = $request->validate(['motif' => ['required', 'string', 'min:3', 'max:255']], [
            'motif.required' => 'Indiquez le motif du rejet.',
            'motif.min' => 'Le motif doit contenir au moins 3 caractères.',
        ]);

        return $this->traiter($request, $depenseId, StatutDepense::Rejetee, $data['motif'], 'Dépense rejetée.');
    }

    /* ------------------------------------------------------------------ */

    private function traiter(Request $request, int $depenseId, StatutDepense $statut, ?string $motif, string $message): JsonResponse
    {
        $depense = DB::transaction(function () use ($request, $depenseId, $statut, $motif): ?Depense {
            $depense = Depense::lockForUpdate()->findOrFail($depenseId);
            if (! $depense->estEnAttente()) {
                return null;
            }
            $depense->update([
                'statut' => $statut,
                'traite_par' => $request->user()->id,
                'traite_at' => now(),
                'motif_rejet' => $motif,
            ]);
            $this->audit($request->user(), 'depense.'.$statut->value, $depense, $motif ? ['motif' => $motif] : []);

            return $depense;
        });

        if (! $depense) {
            return $this->conflit('Cette dépense a déjà été traitée.');
        }

        return response()->json([
            'message' => $message,
            'data' => $this->depenseData($depense->fresh(['auteur', 'traiteePar'])),
        ]);
    }

    /** Règles communes : en création les champs principaux sont obligatoires, en modification facultatifs. */
    private function regles(bool $creation): array
    {
        $obligatoire = $creation ? 'required' : 'sometimes';

        return [
            'categorie' => [$obligatoire, Rule::enum(CategorieDepense::class)],
            'description' => [$creation ? 'required_if:categorie,autre' : 'sometimes', 'nullable', 'string', 'max:1000'],
            'montant' => [$obligatoire, 'numeric', 'min:1', 'max:100000000'],
            'mode_paiement' => ['sometimes', 'nullable', Rule::enum(ModePaiement::class)],
            'beneficiaire' => ['sometimes', 'nullable', 'string', 'max:120'],
            'date_depense' => ['sometimes', 'date', 'before_or_equal:today'],
            // Gérés par le serveur uniquement
            'statut' => ['prohibited'],
            'annee_scolaire' => ['prohibited'],
        ];
    }

    private function messages(): array
    {
        return [
            'categorie.required' => 'Choisissez une catégorie.',
            'categorie.enum' => 'Catégorie inconnue.',
            'description.required_if' => 'Décrivez la dépense lorsque la catégorie est « autre ».',
            'montant.required' => 'Indiquez le montant.',
            'montant.min' => 'Le montant doit être supérieur à zéro.',
            'date_depense.before_or_equal' => 'La date de la dépense ne peut pas être dans le futur.',
            'statut.prohibited' => 'Le statut se change avec les actions valider ou rejeter.',
            'annee_scolaire.prohibited' => 'L’année scolaire est calculée à partir de la date de la dépense.',
        ];
    }

    /**
     * Bornes de la période demandée.
     *
     * @return array{0: string, 1: string, 2: array{type: string, valeur: string}}
     */
    private function periode(array $filtres): array
    {
        if (! empty($filtres['mois'])) {
            $mois = CarbonImmutable::createFromFormat('!Y-m', $filtres['mois']);

            return [$mois->startOfMonth()->toDateString(), $mois->endOfMonth()->toDateString(), ['type' => 'mois', 'valeur' => $filtres['mois']]];
        }

        $annee = $filtres['annee_scolaire'] ?? AnneeScolaire::courante();
        $debut = (int) substr($annee, 0, 4);

        // Année scolaire : du 1er octobre au 30 septembre (voir AnneeScolaire)
        return [sprintf('%04d-10-01', $debut), sprintf('%04d-09-30', $debut + 1), ['type' => 'annee_scolaire', 'valeur' => $annee]];
    }

    /** Recettes encaissées entre deux dates : mensualités (reçus non annulés) et frais d'inscription. */
    private function recettes(string $debut, string $fin): array
    {
        $mensualites = (float) Paiement::valides()->whereBetween('date_paiement', [$debut, $fin])->sum('montant');
        $inscriptions = (float) Inscription::where('statut', 'active')
            ->whereBetween('date_inscription', [$debut, $fin])
            ->sum('montant_inscription');

        return [
            'mensualites' => $mensualites,
            'frais_inscription' => $inscriptions,
            'total' => $mensualites + $inscriptions,
        ];
    }

    private function depenseData(Depense $depense): array
    {
        return [
            'id' => $depense->id,
            'categorie' => $depense->categorie->value,
            'description' => $depense->description,
            'montant' => (float) $depense->montant,
            'mode_paiement' => $depense->mode_paiement?->value,
            'beneficiaire' => $depense->beneficiaire,
            'date_depense' => $depense->date_depense->toDateString(),
            'annee_scolaire' => $depense->annee_scolaire,
            'statut' => $depense->statut->value,
            'enregistree_par' => $depense->auteur ? trim($depense->auteur->prenom.' '.$depense->auteur->nom) : null,
            'traitee_par' => $depense->traiteePar ? trim($depense->traiteePar->prenom.' '.$depense->traiteePar->nom) : null,
            'traitee_at' => $depense->traite_at?->toIso8601String(),
            'motif_rejet' => $depense->motif_rejet,
            'created_at' => $depense->created_at?->toIso8601String(),
        ];
    }

    private function audit(User $acteur, string $action, Depense $depense, array $metadata): void
    {
        AuditEvent::create([
            'actor_user_id' => $acteur->id,
            'action' => $action,
            'entity_type' => 'depense',
            'entity_id' => $depense->id,
            'metadata' => $metadata,
            'created_at' => now(),
        ]);
    }

    /** 409 avec un message précis (le gestionnaire global remplacerait le message d'un abort(409)). */
    private function conflit(string $message): JsonResponse
    {
        return response()->json(['message' => $message], 409);
    }
}
