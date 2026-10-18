<?php

namespace App\Http\Controllers\Api;

use App\Enums\MentionDiplome;
use App\Enums\Role;
use App\Enums\TypeDiplome;
use App\Http\Controllers\Controller;
use App\Models\AuditEvent;
use App\Models\Diplome;
use App\Models\Eleve;
use App\Models\Tuteur;
use App\Services\PhotoProfil;
use App\Support\AnneeScolaire;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Diplômes des élèves, gérés par l'administration : délivrance, correction, annulation motivée.
 * Le tuteur consulte et imprime les diplômes de ses enfants.
 */
class DiplomeController extends Controller
{
    /** GET /v1/diplomes : liste (recherche élève / numéro, année, statut) et indicateurs. */
    public function index(Request $request): JsonResponse
    {
        $filtres = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'annee_scolaire' => ['nullable', 'regex:/^\d{4}-\d{4}$/'],
            'statut' => ['nullable', Rule::in(['delivre', 'annule'])],
            'eleve_id' => ['nullable', 'integer'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ]);
        $recherche = trim($filtres['q'] ?? '');
        $like = '%'.addcslashes($recherche, '%_\\').'%';

        $page = Diplome::with('eleve')
            ->when($filtres['annee_scolaire'] ?? null, fn ($query, $annee) => $query->where('annee_scolaire', $annee))
            ->when(($filtres['statut'] ?? null) === 'delivre', fn ($query) => $query->whereNull('annule_at'))
            ->when(($filtres['statut'] ?? null) === 'annule', fn ($query) => $query->whereNotNull('annule_at'))
            ->when($filtres['eleve_id'] ?? null, fn ($query, $eleveId) => $query->where('eleve_id', $eleveId))
            ->when($recherche !== '', fn ($query) => $query->where(fn ($sous) => $sous
                ->where('numero', 'like', $like)
                ->orWhere('intitule', 'like', $like)
                ->orWhereHas('eleve', fn ($eleves) => $eleves->where('nom', 'like', $like)->orWhere('prenom', 'like', $like)->orWhere('matricule', 'like', $like))))
            ->orderByDesc('date_obtention')->orderByDesc('id')
            ->paginate(20);

        return response()->json(['data' => [
            'items' => $page->getCollection()->map(fn (Diplome $diplome) => self::resume($diplome) + [
                'eleve' => $this->eleveData($diplome->eleve),
            ]),
            'pagination' => ['page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
            'stats' => [
                'delivres' => Diplome::whereNull('annule_at')->count(),
                'annee_courante' => Diplome::whereNull('annule_at')->where('annee_scolaire', AnneeScolaire::courante())->count(),
                'annules' => Diplome::whereNotNull('annule_at')->count(),
            ],
            'types' => collect(TypeDiplome::cases())->map(fn (TypeDiplome $type) => ['value' => $type->value, 'intitule' => $type->intituleParDefaut()]),
            'mentions' => collect(MentionDiplome::cases())->map->value,
        ]]);
    }

    /** POST /v1/eleves/{eleveId}/diplomes : délivre un diplôme (numéro DIP-AAAA-NNNNNN). */
    public function store(Request $request, int $eleveId): JsonResponse
    {
        $eleve = Eleve::with(['inscriptions' => fn ($query) => $query->where('statut', 'active')->where('is_archived', false)->with('classeAcademique')->orderByDesc('id')])
            ->findOrFail($eleveId);
        $data = $request->validate($this->regles(), $this->messages());
        $type = TypeDiplome::from($data['type']);
        $obtention = CarbonImmutable::parse($data['date_obtention']);

        $diplome = DB::transaction(function () use ($data, $eleve, $type, $obtention, $request): Diplome {
            $diplome = Diplome::create([
                'eleve_id' => $eleve->id,
                'type' => $type,
                'intitule' => trim($data['intitule'] ?? '') ?: $type->intituleParDefaut(),
                'mention' => $data['mention'] ?? null,
                'date_obtention' => $obtention->toDateString(),
                'annee_scolaire' => AnneeScolaire::courante($obtention),
                'classe' => $eleve->inscriptions->first()?->classeAcademique?->nom,
                'observations' => $data['observations'] ?? null,
                'delivre_par' => $request->user()->id,
            ]);
            $diplome->update(['numero' => sprintf('DIP-%s-%06d', $obtention->format('Y'), $diplome->id)]);
            $this->audit($request, $diplome, 'diplome.delivre', ['eleve_id' => $eleve->id, 'type' => $type->value]);

            return $diplome;
        });

        return response()->json(['message' => 'Diplôme délivré.', 'data' => $this->donnees($diplome->fresh())], 201);
    }

    /** GET /v1/diplomes/{diplomeId} : diplôme à imprimer (Admin, ou tuteur de l'élève). */
    public function show(Request $request, int $diplomeId): JsonResponse
    {
        $diplome = Diplome::findOrFail($diplomeId);
        if ($request->user()->role === Role::Tuteur) {
            $tuteur = Tuteur::where('user_id', $request->user()->id)->first();
            $rattache = $tuteur && $tuteur->eleves()->whereKey($diplome->eleve_id)->exists();
            if (! $rattache || $diplome->estAnnule()) {
                return response()->json(['message' => 'Ce diplôme ne concerne pas vos enfants.'], 403);
            }
        }

        return response()->json(['data' => $this->donnees($diplome)]);
    }

    /** PATCH /v1/diplomes/{diplomeId} : corrige un diplôme non annulé (le numéro ne change pas). */
    public function update(Request $request, int $diplomeId): JsonResponse
    {
        $diplome = Diplome::findOrFail($diplomeId);
        if ($diplome->estAnnule()) {
            throw ValidationException::withMessages(['diplome' => 'Un diplôme annulé ne peut plus être modifié.']);
        }
        $regles = collect($this->regles())->map(fn (array $liste) => ['sometimes', ...$liste])->all();
        $data = $request->validate($regles, $this->messages());
        if (array_key_exists('date_obtention', $data)) {
            $data['annee_scolaire'] = AnneeScolaire::courante(CarbonImmutable::parse($data['date_obtention']));
        }
        if (array_key_exists('intitule', $data)) {
            $type = TypeDiplome::from($data['type'] ?? $diplome->type->value);
            $data['intitule'] = trim($data['intitule'] ?? '') ?: $type->intituleParDefaut();
        }
        $diplome->update($data);
        $this->audit($request, $diplome, 'diplome.modifie', ['champs' => array_keys($data)]);

        return response()->json(['message' => 'Diplôme modifié.', 'data' => $this->donnees($diplome->fresh())]);
    }

    /** POST /v1/diplomes/{diplomeId}/annuler : annule un diplôme erroné (motif obligatoire). */
    public function annuler(Request $request, int $diplomeId): JsonResponse
    {
        $data = $request->validate(['motif' => ['required', 'string', 'min:3', 'max:255']], [
            'motif.required' => 'Indiquez le motif de l’annulation.',
        ]);
        $diplome = Diplome::findOrFail($diplomeId);
        if ($diplome->estAnnule()) {
            throw ValidationException::withMessages(['motif' => 'Ce diplôme est déjà annulé.']);
        }
        $diplome->update(['annule_at' => now(), 'annule_par' => $request->user()->id, 'motif_annulation' => $data['motif']]);
        $this->audit($request, $diplome, 'diplome.annule', ['motif' => $data['motif']]);

        return response()->json(['message' => 'Diplôme annulé.', 'data' => $this->donnees($diplome->fresh())]);
    }

    /** Résumé d'un diplôme (listes, fiche élève, espace tuteur). */
    public static function resume(Diplome $diplome): array
    {
        return [
            'id' => $diplome->id,
            'numero' => $diplome->numero,
            'type' => $diplome->type->value,
            'intitule' => $diplome->intitule,
            'mention' => $diplome->mention?->value,
            'date_obtention' => $diplome->date_obtention->toDateString(),
            'annee_scolaire' => $diplome->annee_scolaire,
            'classe' => $diplome->classe,
            'observations' => $diplome->observations,
            'annule' => $diplome->estAnnule(),
        ];
    }

    /** Toutes les données du diplôme (impression). */
    private function donnees(Diplome $diplome): array
    {
        $diplome->loadMissing(['eleve', 'signataire', 'annulePar']);

        return self::resume($diplome) + [
            'eleve' => $this->eleveData($diplome->eleve) + [
                'date_naissance' => $diplome->eleve?->date_naissance?->toDateString(),
                'sexe' => $diplome->eleve?->sexe,
            ],
            'delivre_par' => $diplome->signataire ? trim($diplome->signataire->prenom.' '.$diplome->signataire->nom) : null,
            'annule_at' => $diplome->annule_at?->toIso8601String(),
            'annule_par' => $diplome->annulePar ? trim($diplome->annulePar->prenom.' '.$diplome->annulePar->nom) : null,
            'motif_annulation' => $diplome->motif_annulation,
            'created_at' => $diplome->created_at?->toIso8601String(),
        ];
    }

    private function eleveData(?Eleve $eleve): array
    {
        return $eleve ? [
            'id' => $eleve->id,
            'matricule' => $eleve->matricule,
            'nom' => $eleve->nom,
            'prenom' => $eleve->prenom,
            'photo' => PhotoProfil::url($eleve->photo),
        ] : [];
    }

    private function regles(): array
    {
        return [
            'type' => ['required', Rule::enum(TypeDiplome::class)],
            'intitule' => ['nullable', 'string', 'max:160'],
            'mention' => ['nullable', Rule::enum(MentionDiplome::class)],
            'date_obtention' => ['required', 'date', 'before_or_equal:today'],
            'observations' => ['nullable', 'string', 'max:1000'],
        ];
    }

    private function messages(): array
    {
        return [
            'type.required' => 'Choisissez le type de diplôme.',
            'date_obtention.required' => 'Indiquez la date d’obtention.',
            'date_obtention.before_or_equal' => 'La date d’obtention ne peut pas être dans le futur.',
        ];
    }

    private function audit(Request $request, Diplome $diplome, string $action, array $metadata): void
    {
        AuditEvent::create([
            'actor_user_id' => $request->user()->id,
            'action' => $action,
            'entity_type' => 'diplome',
            'entity_id' => $diplome->id,
            'metadata' => $metadata,
            'created_at' => now(),
        ]);
    }
}
