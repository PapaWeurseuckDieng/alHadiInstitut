<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditEvent;
use App\Models\Eleve;
use App\Models\Inscription;
use App\Models\Tuteur;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class EleveController extends Controller
{
    public function store(Request $request): JsonResponse
    {
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
            'eleve.sexe' => ['nullable', 'string', 'max:16'],
            'eleve.adresse' => ['nullable', 'string', 'max:255'],
            'inscription' => ['required', 'array'],
            'inscription.annee_scolaire' => ['required', 'regex:/^\d{4}-\d{4}$/'],
            'inscription.date_inscription' => ['required', 'date'],
            'tuteurs' => ['required', 'array', 'min:1'],
            'tuteurs.*.mode' => ['required', 'in:existant,creer'],
            'tuteurs.*.tuteur_id' => ['required_if:tuteurs.*.mode,existant', 'prohibited_unless:tuteurs.*.mode,existant', 'integer', 'exists:tuteurs,id'],
            'tuteurs.*.compte' => ['required_if:tuteurs.*.mode,creer', 'prohibited_unless:tuteurs.*.mode,creer', 'array'],
            'tuteurs.*.compte.nom' => ['required_if:tuteurs.*.mode,creer', 'string', 'max:120'],
            'tuteurs.*.compte.prenom' => ['required_if:tuteurs.*.mode,creer', 'string', 'max:120'],
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

        $result = DB::transaction(function () use ($data, $request): array {
            $year = (int) date('Y', strtotime($data['inscription']['date_inscription']));
            DB::table('sequences_matricules')->insertOrIgnore([
                'annee' => $year,
                'dernier_numero' => 0,
            ]);
            $sequence = DB::table('sequences_matricules')->where('annee', $year)->lockForUpdate()->first();
            $number = $sequence->dernier_numero + 1;
            DB::table('sequences_matricules')->where('annee', $year)->update(['dernier_numero' => $number]);

            $eleve = Eleve::create([
                ...$data['eleve'],
                'matricule' => sprintf('ELV-%d-%06d', $year, $number),
                'statut' => 'actif',
            ]);

            $inscription = Inscription::create([
                'eleve_id' => $eleve->id,
                'annee_scolaire' => $data['inscription']['annee_scolaire'],
                'date_inscription' => $data['inscription']['date_inscription'],
                'statut' => 'active',
                'created_by' => $request->user()->id,
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
                        'tuteurs' => ['Chaque compte lié doit être un Tuteur actif.'],
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
                    'tuteur_ids' => array_column($createdTuteurs, 'id'),
                ],
                'created_at' => now(),
            ]);

            return compact('eleve', 'inscription', 'createdTuteurs');
        });

        return response()->json([
            'message' => 'Inscription de l’élève créée.',
            'data' => [
                'eleve' => [
                    'id' => $result['eleve']->id,
                    'matricule' => $result['eleve']->matricule,
                    'nom' => $result['eleve']->nom,
                    'prenom' => $result['eleve']->prenom,
                    'statut' => $result['eleve']->statut,
                    'a_un_compte' => false,
                ],
                'inscription' => [
                    'id' => $result['inscription']->id,
                    'annee_scolaire' => $result['inscription']->annee_scolaire,
                    'date_inscription' => $result['inscription']->date_inscription->toDateString(),
                    'statut' => $result['inscription']->statut,
                    'classe_id' => null,
                ],
                'tuteurs' => $result['createdTuteurs'],
            ],
        ], 201);
    }

    public function mine(Request $request): JsonResponse
    {
        $tuteur = Tuteur::with('eleves.inscriptions')
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
                ]),
            ]),
        ]);
    }
}
