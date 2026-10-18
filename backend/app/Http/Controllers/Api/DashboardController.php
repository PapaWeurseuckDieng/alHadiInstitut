<?php

namespace App\Http\Controllers\Api;

use App\Enums\ModePaiement;
use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\AuditEvent;
use App\Models\ClasseAcademique;
use App\Models\Eleve;
use App\Models\Inscription;
use App\Models\Oustaz;
use App\Models\User;
use App\Services\PhotoProfil;
use App\Support\AnneeScolaire;
use App\Support\Mensualites;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Read-only presentation of existing records; creation rules stay in their controllers. */
class DashboardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'section' => ['sometimes', Rule::in(['eleves', 'classes', 'users'])],
            'q' => ['nullable', 'string', 'max:120'],
            'annee' => ['nullable', 'regex:/^\d{4}-\d{4}$/'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'include_archived' => ['sometimes', 'boolean'],
        ]);
        $year = $filters['annee'] ?? null;
        $section = $filters['section'] ?? 'eleves';
        $search = trim($filters['q'] ?? '');
        // Escape LIKE wildcards so a search for '%' does not match every record.
        $like = '%'.addcslashes($search, '%_\\').'%';
        $inscriptions = Inscription::query()->when($year, fn ($q) => $q->where('annee_scolaire', $year));
        $includeArchived = $request->boolean('include_archived');
        $classes = ClasseAcademique::query()
            ->when(! $includeArchived, fn ($q) => $q->where('is_archived', false))
            ->when($year, fn ($q) => $q->where('annee_scolaire', $year));
        $eleves = Eleve::query()
            ->when(! $includeArchived, fn ($q) => $q->where('is_archived', false))
            ->when($year, fn ($q) => $q->whereHas('inscriptions', fn ($i) => $i
                ->where('annee_scolaire', $year)
                ->where('is_archived', false)));
        $inscriptions->when(! $includeArchived, fn ($q) => $q->where('is_archived', false));

        if ($section === 'users') {
            $query = User::with(['tuteur', 'oustaz'])
                ->whereIn('role', ['admin', 'tuteur', 'oustaz'])
                ->when(! $includeArchived, fn ($q) => $q->where('is_archived', false));
            $query->when($search !== '', fn ($q) => $q->where(fn ($s) => $s->where('nom', 'like', $like)->orWhere('prenom', 'like', $like)->orWhere('telephone', 'like', $like)));
        } elseif ($section === 'classes') {
            $query = (clone $classes)->with('oustaz.user')->withCount('inscriptions');
            $query->when($search !== '', fn ($q) => $q->where(fn ($s) => $s->where('nom', 'like', $like)->orWhere('niveau', 'like', $like)));
        } else {
            $query = (clone $eleves)->with([
                'inscriptions' => fn ($q) => $q
                    ->where('is_archived', false)
                    ->when($year, fn ($i) => $i->where('annee_scolaire', $year))
                    ->with('classeAcademique')
                    ->orderByDesc('id'),
                'tuteurs.user',
            ]);
            $query->when($search !== '', fn ($q) => $q->where(fn ($s) => $s->where('nom', 'like', $like)->orWhere('prenom', 'like', $like)->orWhere('matricule', 'like', $like)));
        }
        $page = $query->orderByDesc('id')->paginate(10);
        $items = $page->getCollection()->map(function ($record) use ($section, $request) {
            if ($section === 'users') {
                return [...(new UserResource($record))->resolve($request), 'profil_id' => $record->tuteur?->id ?? $record->oustaz?->id];
            }
            if ($section === 'classes') {
                return [
                    'id' => $record->id, 'nom' => $record->nom, 'niveau' => $record->niveau,
                    'annee_scolaire' => $record->annee_scolaire, 'statut' => $record->statut,
                    'is_archived' => $record->is_archived,
                    'effectif' => $record->inscriptions_count,
                    'oustaz_id' => $record->oustaz_id,
                    'mensualite' => $record->mensualiteAppliquee(),
                    'frais_inscription' => $record->fraisInscriptionAppliques(),
                    'mensualite_propre' => $record->mensualite !== null,
                    'frais_inscription_propres' => $record->frais_inscription !== null,
                    'oustaz' => trim(($record->oustaz?->user?->prenom ?? '').' '.($record->oustaz?->user?->nom ?? '')),
                ];
            }

            return [
                'id' => $record->id, 'matricule' => $record->matricule,
                'nom' => $record->nom, 'prenom' => $record->prenom, 'statut' => $record->statut,
                'photo' => PhotoProfil::url($record->photo),
                'is_archived' => $record->is_archived,
                'inscriptions' => $record->inscriptions->map(fn ($i) => [
                    'id' => $i->id, 'annee_scolaire' => $i->annee_scolaire,
                    'statut' => $i->statut, 'classe' => $i->classeAcademique?->nom,
                ]),
                'tuteurs' => $record->tuteurs->map(fn ($t) => trim(($t->user?->prenom ?? '').' '.($t->user?->nom ?? ''))),
            ];
        });

        $profileOptions = fn ($profile) => [
            'id' => $profile->id, 'label' => $profile->user->prenom.' '.$profile->user->nom,
            'telephone' => $profile->user->telephone,
        ];

        return response()->json(['data' => [
            'stats' => [
                'eleves' => (clone $eleves)->count(),
                'classes' => (clone $classes)->count(),
                'a_affecter' => (clone $inscriptions)->where('statut', 'active')->whereNull('classe_academique_id')->count(),
                'comptes_actifs' => User::where('statut', 'actif')
                    ->where('is_archived', false)
                    ->whereIn('role', ['admin', 'tuteur', 'oustaz'])->count(),
            ],
            'annee_scolaire_courante' => AnneeScolaire::courante(),
            'annees' => Inscription::where('is_archived', false)->select('annee_scolaire')
                ->union(ClasseAcademique::where('is_archived', false)->select('annee_scolaire'))
                ->orderByDesc('annee_scolaire')->pluck('annee_scolaire'),
            'items' => $items,
            'pagination' => ['page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
            'options' => [
                'oustazs' => Oustaz::with('user')->whereHas('user', fn ($q) => $q
                    ->where('statut', 'actif')->where('is_archived', false)->where('role', 'oustaz'))
                    ->get()->map($profileOptions),
                // Montants appliqués (ceux de la classe, sinon les montants par défaut) : affichés, jamais saisis
                'classes' => ClasseAcademique::where('annee_scolaire', AnneeScolaire::courante())
                    ->where('statut', 'active')->where('is_archived', false)->orderBy('nom')
                    ->get(['id', 'nom', 'niveau', 'annee_scolaire', 'mensualite', 'frais_inscription'])
                    ->map(fn (ClasseAcademique $classe) => [
                        'id' => $classe->id, 'nom' => $classe->nom, 'niveau' => $classe->niveau,
                        'annee_scolaire' => $classe->annee_scolaire,
                        'mensualite' => $classe->mensualiteAppliquee(),
                        'frais_inscription' => $classe->fraisInscriptionAppliques(),
                    ]),
                // Paiement saisi dans le formulaire d'inscription : modes et mois encore dus cette année
                'paiement' => [
                    'modes' => collect(ModePaiement::cases())->map->value,
                    'mois' => collect(Mensualites::moisDeLAnnee(AnneeScolaire::courante()))
                        ->filter(fn (string $mois) => $mois >= Mensualites::moisCourant())->values(),
                    'devise' => config('paiements.devise'),
                ],
                'inscriptions' => Inscription::with('eleve')->where('statut', 'active')->where('is_archived', false)
                    ->whereNull('classe_academique_id')->whereHas('eleve', fn ($q) => $q->where('is_archived', false))->get()->map(fn ($i) => [
                        'id' => $i->id, 'annee_scolaire' => $i->annee_scolaire,
                        'label' => $i->eleve->prenom.' '.$i->eleve->nom, 'matricule' => $i->eleve->matricule,
                    ]),
            ],
            'activites' => AuditEvent::whereIn('action', ['user.created', 'eleve.enrolled', 'classe.created'])->orderByDesc('id')->limit(6)->get(['id', 'action', 'entity_id', 'created_at']),
        ]]);
    }
}
