<?php

namespace App\Http\Controllers\Api;

use App\Enums\Role;
use App\Http\Controllers\Controller;
use App\Models\ClasseAcademique;
use App\Models\Eleve;
use App\Models\Inscription;
use App\Models\Planning;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PlanningController extends Controller
{
    private const JOURS = ['samedi', 'dimanche', 'lundi', 'mardi', 'mercredi'];

    public function index(Request $request, int $classeId): JsonResponse
    {
        $classe = $this->findAccessibleClass($request, $classeId);
        $dayOrder = array_flip(self::JOURS);
        $plannings = Planning::where('classe_academique_id', $classe->id)
            ->orderBy('heure_debut')
            ->get()
            ->sortBy(fn (Planning $planning) => $dayOrder[$planning->jour_semaine] ?? 7);

        $byDay = collect(self::JOURS)->mapWithKeys(fn (string $day) => [
            $day => $plannings->where('jour_semaine', $day)->map(fn (Planning $planning) => $this->planningData($planning))->values(),
        ]);

        return response()->json(['data' => ['classe_id' => $classe->id, 'semaine' => $byDay]]);
    }

    public function store(Request $request, int $classeId): JsonResponse
    {
        $classe = $this->findAccessibleClass($request, $classeId);
        $data = $request->validate([
            'jour' => ['required', Rule::in(self::JOURS)],
            'heure_debut' => ['required', 'date_format:H:i'],
            'heure_fin' => ['required', 'date_format:H:i', 'after:heure_debut'],
            'activite' => ['required', 'string', 'max:120'],
        ]);
        $dayNumbers = ['dimanche' => 0, 'lundi' => 1, 'mardi' => 2, 'mercredi' => 3, 'samedi' => 6];
        $date = Carbon::today(config('app.timezone'));
        $date->addDays(($dayNumbers[$data['jour']] - $date->dayOfWeek + 7) % 7);
        $planning = Planning::create([
            'classe_academique_id' => $classe->id,
            'jour_semaine' => $data['jour'],
            'date' => $date->toDateString(),
            'heure_debut' => $data['heure_debut'],
            'heure_fin' => $data['heure_fin'],
            'activite' => $data['activite'],
        ]);

        return response()->json([
            'message' => 'Séance ajoutée au planning hebdomadaire.',
            'data' => $this->planningData($planning),
        ], 201);
    }

    public function update(Request $request, int $planningId): JsonResponse
    {
        $planning = Planning::findOrFail($planningId);
        $this->findAccessibleClass($request, $planning->classe_academique_id);
        $data = $request->validate([
            'jour' => ['sometimes', 'required', Rule::in(self::JOURS)],
            'heure_debut' => ['sometimes', 'required', 'date_format:H:i'],
            'heure_fin' => ['sometimes', 'required', 'date_format:H:i'],
            'activite' => ['sometimes', 'required', 'string', 'max:120'],
        ]);
        $start = $data['heure_debut'] ?? substr((string) $planning->heure_debut, 0, 5);
        $end = $data['heure_fin'] ?? substr((string) $planning->heure_fin, 0, 5);
        if ($end <= $start) {
            throw ValidationException::withMessages(['heure_fin' => ['L’heure de fin doit être postérieure à l’heure de début.']]);
        }
        if (isset($data['jour'])) {
            $dayNumbers = ['dimanche' => 0, 'lundi' => 1, 'mardi' => 2, 'mercredi' => 3, 'samedi' => 6];
            $date = Carbon::today(config('app.timezone'));
            $date->addDays(($dayNumbers[$data['jour']] - $date->dayOfWeek + 7) % 7);
            $planning->date = $date->toDateString();
            $planning->jour_semaine = $data['jour'];
        }
        $planning->fill([
            'heure_debut' => $start,
            'heure_fin' => $end,
            'activite' => $data['activite'] ?? $planning->activite,
        ])->save();

        return response()->json(['message' => 'Séance mise à jour.', 'data' => $this->planningData($planning)]);
    }

    public function presences(Request $request, int $planningId): JsonResponse
    {
        $planning = Planning::with('classeAcademique')->findOrFail($planningId);
        $this->findAccessibleClass($request, $planning->classe_academique_id);
        $filters = $request->validate(['date_cours' => ['required', 'date_format:Y-m-d']]);
        if ($this->jourSemaine($filters['date_cours']) !== $planning->jour_semaine) {
            throw ValidationException::withMessages(['date_cours' => ['La date ne correspond pas au jour prévu pour cette séance.']]);
        }
        $eleves = Eleve::where('is_archived', false)
            ->whereHas('inscriptions', fn ($query) => $query
                ->where('classe_academique_id', $planning->classe_academique_id)
                ->where('statut', 'active')
                ->where('is_archived', false))
            ->orderBy('nom')
            ->orderBy('prenom')
            ->get();
        $presences = DB::table('presences')
            ->where('planning_id', $planning->id)
            ->where('date_cours', $filters['date_cours'])
            ->get()
            ->keyBy('eleve_id');

        return response()->json([
            'data' => [
                'planning_id' => $planning->id,
                'date_cours' => $filters['date_cours'],
                'eleves' => $eleves->map(fn (Eleve $eleve) => [
                    'eleve_id' => $eleve->id,
                    'matricule' => $eleve->matricule,
                    'nom' => $eleve->nom,
                    'prenom' => $eleve->prenom,
                    'statut' => $presences->get($eleve->id)?->statut,
                ]),
            ],
        ]);
    }

    public function savePresences(Request $request, int $planningId): JsonResponse
    {
        $planning = Planning::with('classeAcademique')->findOrFail($planningId);
        $this->findAccessibleClass($request, $planning->classe_academique_id);
        $data = $request->validate([
            'date_cours' => ['required', 'date_format:Y-m-d'],
            'presences' => ['required', 'array', 'min:1'],
            'presences.*.eleve_id' => ['required', 'integer', 'distinct', 'exists:eleves,id'],
            'presences.*.statut' => ['required', Rule::in(['present', 'absent', 'retard', 'excuse'])],
        ]);
        if ($this->jourSemaine($data['date_cours']) !== $planning->jour_semaine) {
            throw ValidationException::withMessages(['date_cours' => ['La date ne correspond pas au jour prévu pour cette séance.']]);
        }
        $studentIds = collect($data['presences'])->pluck('eleve_id');
        $enrolledIds = Inscription::where('classe_academique_id', $planning->classe_academique_id)
            ->where('statut', 'active')
            ->where('is_archived', false)
            ->whereIn('eleve_id', $studentIds)
            ->whereHas('eleve', fn ($query) => $query->where('is_archived', false))
            ->pluck('eleve_id');
        if ($enrolledIds->count() !== $studentIds->unique()->count()) {
            throw ValidationException::withMessages(['presences' => ['Chaque élève doit être actif et inscrit dans la classe de cette séance.']]);
        }

        DB::transaction(function () use ($data, $planning, $request): void {
            foreach ($data['presences'] as $entry) {
                DB::table('presences')->updateOrInsert(
                    [
                        'planning_id' => $planning->id,
                        'eleve_id' => $entry['eleve_id'],
                        'date_cours' => $data['date_cours'],
                    ],
                    [
                        'statut' => $entry['statut'],
                        'saisi_par' => $request->user()->id,
                        'updated_at' => now(),
                        'created_at' => now(),
                    ],
                );
            }
        });

        return response()->json([
            'message' => 'Présences enregistrées.',
            'data' => ['planning_id' => $planning->id, 'date_cours' => $data['date_cours'], 'nombre_eleves' => count($data['presences'])],
        ]);
    }

    private function findAccessibleClass(Request $request, ?int $classId): ClasseAcademique
    {
        abort_if($classId === null, 404, 'La classe de cette séance est introuvable.');
        $classe = ClasseAcademique::where('is_archived', false)->findOrFail($classId);
        if ($request->user()->role === Role::Oustaz && $classe->oustaz_id !== $request->user()->oustaz?->id) {
            abort(403, 'Cette classe ne vous est pas affectée.');
        }

        return $classe;
    }

    private function jourSemaine(string $date): string
    {
        return [
            0 => 'dimanche',
            1 => 'lundi',
            2 => 'mardi',
            3 => 'mercredi',
            6 => 'samedi',
        ][Carbon::parse($date)->dayOfWeek];
    }

    private function planningData(Planning $planning): array
    {
        $dayNumbers = ['dimanche' => 0, 'lundi' => 1, 'mardi' => 2, 'mercredi' => 3, 'samedi' => 6];
        $today = Carbon::today(config('app.timezone'));
        $nextSession = $planning->jour_semaine === null
            ? $planning->date
            : $today->copy()->addDays(($dayNumbers[$planning->jour_semaine] - $today->dayOfWeek + 7) % 7)->toDateString();

        return [
            'id' => $planning->id,
            'classe_id' => $planning->classe_academique_id,
            'jour' => $planning->jour_semaine,
            'date_prochaine_seance' => $nextSession,
            'heure_debut' => substr((string) $planning->heure_debut, 0, 5),
            'heure_fin' => substr((string) $planning->heure_fin, 0, 5),
            'activite' => $planning->activite,
        ];
    }
}
