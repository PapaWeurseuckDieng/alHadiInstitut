<?php

namespace Database\Seeders;

use App\Enums\TypeDiplome;
use App\Models\AuditEvent;
use App\Models\ClasseAcademique;
use App\Models\Depense;
use App\Models\Diplome;
use App\Models\Eleve;
use App\Models\FicheHebdomadaire;
use App\Models\Inscription;
use App\Models\Note;
use App\Models\Oustaz;
use App\Models\Paiement;
use App\Models\Planning;
use App\Models\RappelPaiement;
use App\Models\Sourate;
use App\Models\Tuteur;
use App\Models\User;
use App\Support\AnneeScolaire;
use App\Support\Mensualites;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Données de démonstration réalistes pour essayer toute l'application :
 * comptes, classes, élèves et tuteurs (dont des homonymes), frais d'inscription fixés par classe,
 * mensualités et reçus, rappels WhatsApp, dépenses, planning, appels, fiches hebdomadaires
 * (dont une demande de modification), exemplarité et diplômes.
 *
 * Lancement :  docker compose exec -u www-data app php artisan db:seed --class=DemoSeeder
 *
 * - Additif : n'efface ni ne modifie rien d'existant (numéros 78 1xx xx xx / 78 2xx xx xx).
 * - Une seule fois : s'arrête si les comptes de démonstration existent déjà.
 * - Dates calculées à partir d'aujourd'hui (année scolaire courante).
 * - Mot de passe de tous les comptes de démonstration : demo1234 (déjà « changé » : accès direct).
 */
class DemoSeeder extends Seeder
{
    private const MOT_DE_PASSE = 'demo1234';

    private const PRENOMS_M = ['Moussa', 'Ibrahima', 'Abdoulaye', 'Cheikh', 'Mamadou', 'Ousmane', 'Serigne', 'Modou', 'Aliou', 'Babacar', 'Pape', 'Lamine', 'Saliou', 'Fallou', 'Omar', 'Assane', 'Malick', 'Bamba', 'Idrissa', 'Souleymane'];

    private const PRENOMS_F = ['Awa', 'Fatou', 'Aminata', 'Mariama', 'Khady', 'Ndeye', 'Aïssatou', 'Bineta', 'Coumba', 'Sokhna', 'Astou', 'Rokhaya', 'Mame Diarra', 'Adama', 'Fatimata', 'Seynabou', 'Khadija', 'Maïmouna', 'Dieynaba', 'Oumou'];

    private const NOMS = ['Diop', 'Ndiaye', 'Fall', 'Sow', 'Ba', 'Sarr', 'Gueye', 'Diallo', 'Mbaye', 'Seck', 'Faye', 'Cissé', 'Kane', 'Thiam', 'Niang', 'Sy', 'Dieng', 'Mbow', 'Ka', 'Diouf'];

    private const VILLES = ['Dakar, Médina', 'Dakar, Grand Yoff', 'Pikine', 'Guédiawaye', 'Rufisque', 'Thiès', 'Keur Massar', 'Dakar, Parcelles Assainies'];

    private const PROFESSIONS = ['Commerçant(e)', 'Enseignant(e)', 'Chauffeur', 'Couturière', 'Infirmier(ère)', 'Agent administratif', 'Mécanicien', 'Ménagère', 'Comptable', 'Pêcheur'];

    private int $sequence = 0;

    private User $secretariat;

    public function run(): void
    {
        if (User::where('telephone', '+221781000001')->exists()) {
            $this->command?->warn('Les données de démonstration sont déjà présentes : rien à faire.');

            return;
        }
        mt_srand(2026);

        DB::transaction(function () {
            $annee = AnneeScolaire::courante();
            $debutAnnee = CarbonImmutable::create((int) substr($annee, 0, 4), 10, 1);
            $aujourdhui = CarbonImmutable::today(config('app.timezone'));

            $this->secretariat = $this->compte('Sow', 'Khady', 'F', '781000001', 'admin');
            $oustazs = $this->oustazs();
            $classes = $this->classes($annee, $oustazs);
            [$eleves, $inscriptions] = $this->familles($annee, $debutAnnee, $classes);
            $this->paiements($inscriptions, $aujourdhui);
            $this->rappels($aujourdhui);
            $this->depenses($debutAnnee, $aujourdhui);
            $plannings = $this->plannings($classes);
            $this->appels($plannings, $inscriptions, $debutAnnee, $aujourdhui);
            $this->fiches($inscriptions, $debutAnnee, $aujourdhui);
            $this->exemplarite($inscriptions, $debutAnnee, $aujourdhui);
            $this->diplomes($inscriptions, $aujourdhui);
            $this->archives($annee);
            $this->activite($eleves, $classes);
        });

        $this->command?->info('Données de démonstration créées. Comptes (mot de passe '.self::MOT_DE_PASSE.') :');
        $this->command?->table(['Rôle', 'Téléphone'], [
            ['Admin (secrétariat)', '78 100 00 01'],
            ['Oustaz', '78 100 00 11 à 78 100 00 14'],
            ['Tuteur', '78 200 00 01 à 78 200 00 30'],
        ]);
    }

    /* ------------------------------------------------------------------ */

    private function compte(string $nom, string $prenom, string $sexe, string $telephone, string $role, array $extra = []): User
    {
        static $hash = null;
        $hash ??= Hash::make(self::MOT_DE_PASSE);

        $user = new User;
        $user->forceFill([
            'matricule' => 'DEMO-'.Str::upper(Str::random(8)),
            'nom' => $nom,
            'prenom' => $prenom,
            'sexe' => $sexe,
            'telephone' => $telephone,
            'adresse' => self::VILLES[array_rand(self::VILLES)],
            'password' => $hash,
            'role' => $role,
            'statut' => 'actif',
            'must_change_password' => false,
            ...$extra,
        ]);
        // Le mot de passe est déjà haché : on évite un second hachage par le cast « hashed »
        $user->setRawAttributes([...$user->getAttributes(), 'password' => $hash]);
        $user->save();

        return $user;
    }

    /** @return Collection<int, Oustaz> */
    private function oustazs(): Collection
    {
        $specialites = ['Hifz', 'Tajwid', 'Tafsir', 'Hifz et révision'];

        return collect([['Diop', 'Serigne', 'M'], ['Ndiaye', 'Oumar', 'M'], ['Ba', 'Ibrahima', 'M'], ['Sy', 'Aïssatou', 'F']])
            ->map(fn (array $o, int $i) => Oustaz::create([
                'user_id' => $this->compte($o[0], $o[1], $o[2], '7810000'.(11 + $i), 'oustaz')->id,
                'specialite' => $specialites[$i],
            ]));
    }

    /** @return Collection<int, ClasseAcademique> */
    private function classes(string $annee, Collection $oustazs): Collection
    {
        // [nom, niveau, mensualité, frais d'inscription] ; null = montant par défaut
        $definitions = [
            ['Halaqa Al-Fatiha', 'Débutant', 8000, 5000], ['Halaqa Al-Ikhlas', 'Débutant', 8000, 5000],
            ['Halaqa An-Naba', 'Intermédiaire', 10000, 7500], ['Halaqa Al-Mulk', 'Intermédiaire', null, null],
            ['Halaqa Ya-Sin', 'Avancé', 12000, 10000], ['Halaqa Al-Kahf', 'Avancé', 12000, 10000],
        ];

        return collect($definitions)->map(fn (array $c, int $i) => ClasseAcademique::create([
            'nom' => $c[0],
            'niveau' => $c[1],
            'mensualite' => $c[2],
            'frais_inscription' => $c[3],
            'annee_scolaire' => $annee,
            'oustaz_id' => $oustazs[$i % $oustazs->count()]->id,
            'statut' => 'active',
        ]));
    }

    /**
     * 30 familles : un ou deux tuteurs (père / mère), 1 à 3 enfants inscrits.
     *
     * @return array{0: Collection<int, Eleve>, 1: Collection<int, Inscription>}
     */
    private function familles(string $annee, CarbonImmutable $debutAnnee, Collection $classes): array
    {
        $eleves = collect();
        $inscriptions = collect();
        $sansClasse = 0;

        for ($f = 1; $f <= 30; $f++) {
            $nom = self::NOMS[($f - 1) % count(self::NOMS)];
            $pere = Tuteur::create([
                'user_id' => $this->compte($nom, self::PRENOMS_M[($f + 3) % 20], 'M', sprintf('782%06d', $f), 'tuteur')->id,
                'profession' => self::PROFESSIONS[$f % count(self::PROFESSIONS)],
            ]);
            // Une famille sur trois a aussi la mère comme tutrice (payeuse)
            $mere = $f % 3 === 0 ? Tuteur::create([
                'user_id' => $this->compte($nom, self::PRENOMS_F[($f + 7) % 20], 'F', sprintf('782%06d', 100 + $f), 'tuteur')->id,
                'profession' => self::PROFESSIONS[($f + 4) % count(self::PROFESSIONS)],
            ]) : null;

            $enfants = 1 + mt_rand(0, 2);
            for ($e = 0; $e < $enfants; $e++) {
                $sexe = mt_rand(0, 1) ? 'M' : 'F';
                $eleve = new Eleve([
                    'matricule' => $this->matricule((int) substr($annee, 0, 4)),
                    'nom' => $nom,
                    'prenom' => ($sexe === 'M' ? self::PRENOMS_M : self::PRENOMS_F)[mt_rand(0, 19)],
                    'date_naissance' => CarbonImmutable::create(mt_rand(2012, 2019), mt_rand(1, 12), mt_rand(1, 28))->toDateString(),
                    'sexe' => $sexe,
                    'adresse' => self::VILLES[$f % count(self::VILLES)],
                    'statut' => 'actif',
                ]);
                $eleve->save();
                $eleve->tuteurs()->attach($pere->id, ['lien_parente' => 'Père', 'est_responsable_legal' => true, 'est_payeur' => $mere === null]);
                if ($mere) {
                    $eleve->tuteurs()->attach($mere->id, ['lien_parente' => 'Mère', 'est_responsable_legal' => true, 'est_payeur' => true]);
                }

                // Trois inscriptions restent « sans classe » (à affecter depuis la fiche élève)
                $classe = ($sansClasse < 3 && $f % 10 === 0) ? null : $classes[mt_rand(0, $classes->count() - 1)];
                $sansClasse += $classe ? 0 : 1;
                $inscription = Inscription::create([
                    'eleve_id' => $eleve->id,
                    'classe_academique_id' => $classe?->id,
                    'annee_scolaire' => $annee,
                    'date_inscription' => $debutAnnee->addDays(mt_rand(0, 9))->toDateString(),
                    'statut' => 'active',
                    'created_by' => $this->secretariat->id,
                ]);
                // Trois élèves sur quatre ont réglé les frais d'inscription (montant de la classe, reçu INS-…)
                if ($classe && mt_rand(0, 3) > 0) {
                    $inscription->forceFill([
                        'montant_inscription' => $classe->fraisInscriptionAppliques(),
                        'mode_paiement' => ['especes', 'wave', 'orange_money'][mt_rand(0, 2)],
                        'date_paiement_inscription' => $inscription->date_inscription,
                        'frais_encaisse_par' => $this->secretariat->id,
                        'numero_recu_inscription' => sprintf('INS-%s-%06d', $inscription->date_inscription->format('Y'), $inscription->id),
                    ])->save();
                }
                $inscriptions->push($inscription);
                $eleves->push($eleve);
            }
        }

        // Homonyme d'un père existant (autre numéro) : la recherche de tuteur les distingue par le téléphone
        $homonyme = User::where('telephone', '+221782000001')->first();
        Tuteur::create(['user_id' => $this->compte($homonyme->nom, $homonyme->prenom, 'M', '782000200', 'tuteur')->id, 'profession' => 'Tailleur']);

        return [$eleves, $inscriptions->each->load('classeAcademique')];
    }

    /** Matricule suivant de l'année, en respectant le compteur existant (pas de doublon). */
    private function matricule(int $annee): string
    {
        DB::table('sequences_matricules')->insertOrIgnore(['annee' => $annee, 'dernier_numero' => 0]);
        DB::table('sequences_matricules')->where('annee', $annee)->increment('dernier_numero');
        $numero = DB::table('sequences_matricules')->where('annee', $annee)->value('dernier_numero');

        return sprintf('ELV-%d-%06d', $annee, $numero);
    }

    /** Mensualités des mois écoulés : ~65 % payées, ~20 % partielles, ~15 % impayées. */
    private function paiements(Collection $inscriptions, CarbonImmutable $aujourdhui): void
    {
        $moisCourant = $aujourdhui->format('Y-m');
        foreach ($inscriptions as $inscription) {
            $debut = CarbonImmutable::parse($inscription->date_inscription)->format('Y-m');
            foreach (Mensualites::moisDeLAnnee($inscription->annee_scolaire) as $mois) {
                if ($mois < $debut || $mois > $moisCourant) {
                    continue;
                }
                $du = Mensualites::montantDu($inscription);
                $tirage = mt_rand(1, 100);
                $montant = $tirage <= 65 ? $du : ($tirage <= 85 ? round($du / 2) : 0);
                if ($montant <= 0) {
                    continue;
                }
                $jour = min((int) $aujourdhui->format('d'), mt_rand(1, 12));
                $paiement = Paiement::create([
                    'eleve_id' => $inscription->eleve_id,
                    'inscription_id' => $inscription->id,
                    'annee_scolaire' => $inscription->annee_scolaire,
                    'mois' => $mois,
                    'montant_du' => $du,
                    'montant' => $montant,
                    'mode_paiement' => ['especes', 'especes', 'wave', 'orange_money'][mt_rand(0, 3)],
                    'date_paiement' => CarbonImmutable::createFromFormat('!Y-m', $mois)->day($jour)->toDateString(),
                    'encaisse_par' => $this->secretariat->id,
                ]);
                $paiement->update(['numero_recu' => sprintf('REC-%s-%06d', now()->format('Y'), $paiement->id)]);
            }
        }
    }

    /** Journal des rappels du mois : envois automatiques simulés, un manuel et un échec. */
    private function rappels(CarbonImmutable $aujourdhui): void
    {
        $mois = Mensualites::moisParDefaut();
        $tuteurs = Tuteur::with('user')->whereHas('user', fn ($q) => $q->where('telephone', 'like', '+22178%'))->take(8)->get();
        foreach ($tuteurs as $index => $tuteur) {
            RappelPaiement::create([
                'tuteur_id' => $tuteur->id,
                'mois' => $mois,
                'canal' => 'whatsapp',
                'telephone' => ltrim($tuteur->user->telephone, '+'),
                'statut' => $index === 7 ? 'echec' : 'simule',
                'automatique' => $index < 6,
                'message' => "Assalamou alaykoum {$tuteur->user->prenom} {$tuteur->user->nom},\nL'Institut Al-Hadi vous rappelle que la mensualité de ".Mensualites::libelleMois($mois)." n'est pas encore réglée.",
                'erreur' => $index === 7 ? 'Numéro non joignable sur WhatsApp (démonstration).' : null,
                'envoye_par' => $index < 6 ? null : $this->secretariat->id,
            ]);
        }
    }

    /** Dépenses de l'année : validées, en attente et une rejetée. */
    private function depenses(CarbonImmutable $debutAnnee, CarbonImmutable $aujourdhui): void
    {
        $lignes = [
            ['salaires', 'Indemnités des oustazs', 180000, 'virement', 'Équipe pédagogique', 'validee'],
            ['loyer', 'Loyer des locaux', 150000, 'virement', 'Propriétaire', 'validee'],
            ['eau_electricite', 'Facture Senelec', 32500, 'wave', 'Senelec', 'validee'],
            ['eau_electricite', 'Facture SEN’EAU', 12800, 'wave', 'SEN’EAU', 'validee'],
            ['fournitures', 'Corans, ardoises et cahiers', 45000, 'especes', 'Librairie Al-Maarif', 'validee'],
            ['entretien', 'Nettoyage des salles', 15000, 'especes', 'Prestataire', 'validee'],
            ['alimentation', 'Goûter du vendredi', 20000, 'especes', null, 'en_attente'],
            ['transport', 'Sortie pédagogique', 25000, 'orange_money', 'Transporteur', 'en_attente'],
            ['evenements', 'Cérémonie de remise des diplômes', 60000, 'especes', null, 'en_attente'],
            ['fournitures', 'Marqueurs (saisie en double)', 8000, 'especes', 'Librairie Al-Maarif', 'rejetee'],
        ];
        foreach ($lignes as $index => [$categorie, $description, $montant, $mode, $beneficiaire, $statut]) {
            $date = $debutAnnee->addDays(min($index, max(0, $aujourdhui->diffInDays($debutAnnee, true))));
            Depense::create([
                'categorie' => $categorie,
                'description' => $description,
                'montant' => $montant,
                'mode_paiement' => $mode,
                'beneficiaire' => $beneficiaire,
                'date_depense' => $date->toDateString(),
                'annee_scolaire' => AnneeScolaire::courante($date),
                'statut' => $statut,
                'created_by' => $this->secretariat->id,
                'traite_par' => $statut === 'en_attente' ? null : $this->secretariat->id,
                'traite_at' => $statut === 'en_attente' ? null : now(),
                'motif_rejet' => $statut === 'rejetee' ? 'Facture déjà saisie' : null,
            ]);
        }
    }

    /** Planning : 4 séances par classe sur la semaine (samedi → mercredi). */
    private function plannings(Collection $classes): Collection
    {
        $jours = ['samedi', 'dimanche', 'lundi', 'mardi', 'mercredi'];
        $creneaux = [['08:00', '10:00', 'Hifz'], ['10:30', '12:00', 'Révision'], ['15:00', '17:00', 'Tajwid']];
        $plannings = collect();
        foreach ($classes as $index => $classe) {
            foreach (array_slice(array_merge(array_slice($jours, $index % 2), $jours), 0, 4) as $n => $jour) {
                [$debut, $fin, $activite] = $creneaux[($index + $n) % count($creneaux)];
                $plannings->push(Planning::create([
                    'classe_academique_id' => $classe->id,
                    'jour_semaine' => $jour,
                    'date' => now()->toDateString(),
                    'heure_debut' => $debut,
                    'heure_fin' => $fin,
                    'activite' => $activite,
                ]));
            }
        }

        return $plannings;
    }

    /** Appels de toutes les séances passées depuis la rentrée (≈ 85 % présents). */
    private function appels(Collection $plannings, Collection $inscriptions, CarbonImmutable $debut, CarbonImmutable $aujourdhui): void
    {
        $numeros = ['dimanche' => 0, 'lundi' => 1, 'mardi' => 2, 'mercredi' => 3, 'samedi' => 6];
        $lignes = [];
        foreach ($plannings as $planning) {
            $oustazUser = Oustaz::find(ClasseAcademique::find($planning->classe_academique_id)->oustaz_id)->user_id;
            $elevesClasse = $inscriptions->where('classe_academique_id', $planning->classe_academique_id)->pluck('eleve_id');
            for ($date = $debut; $date->lessThan($aujourdhui); $date = $date->addDay()) {
                if ($date->dayOfWeek !== $numeros[$planning->jour_semaine]) {
                    continue;
                }
                foreach ($elevesClasse as $eleveId) {
                    $tirage = mt_rand(1, 100);
                    $lignes[] = [
                        'planning_id' => $planning->id,
                        'eleve_id' => $eleveId,
                        'date_cours' => $date->toDateString(),
                        'statut' => $tirage <= 85 ? 'present' : ($tirage <= 92 ? 'absent' : ($tirage <= 97 ? 'retard' : 'excuse')),
                        'saisi_par' => $oustazUser,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ];
                }
            }
        }
        foreach (array_chunk($lignes, 500) as $paquet) {
            DB::table('presences')->insert($paquet);
        }
    }

    /**
     * Fiches hebdomadaires depuis la rentrée : semaines passées validées par l'oustaz, semaine en
     * cours en brouillon ; une fiche validée fait l'objet d'une demande de modification.
     * Objectif dans une sourate de Juz ʿAmma.
     */
    private function fiches(Collection $inscriptions, CarbonImmutable $debutAnnee, CarbonImmutable $aujourdhui): void
    {
        $sourates = Sourate::whereBetween('numero', [78, 114])->get()->keyBy('numero');
        // Premier samedi de la rentrée, puis samedi de la semaine en cours (jeudi/vendredi : semaine écoulée)
        $samedi = $debutAnnee->addDays((6 - $debutAnnee->dayOfWeek + 7) % 7);
        $samediCourant = $aujourdhui->subDays(($aujourdhui->dayOfWeek + 1) % 7);
        $jours = ['samedi', 'dimanche', 'lundi', 'mardi', 'mercredi'];
        $demande = false;

        foreach ($inscriptions->filter(fn ($i) => $i->classe_academique_id) as $inscription) {
            $oustazUser = Oustaz::find($inscription->classeAcademique->oustaz_id)->user_id;
            $numero = mt_rand(78, 100);
            for ($debut = $samedi; $debut->lessThanOrEqualTo($samediCourant); $debut = $debut->addWeek()) {
                $sourate = $sourates[$numero];
                $cible = min($sourate->nombre_versets, mt_rand(8, 15));
                $courante = $debut->equalTo($samediCourant);
                $fiche = FicheHebdomadaire::create([
                    'eleve_id' => $inscription->eleve_id,
                    'enseignant_id' => $oustazUser,
                    'date_debut' => $debut->toDateString(),
                    'date_fin' => $debut->addDays(4)->toDateString(),
                    'sourate_debut' => $sourate->nom,
                    'verset_debut' => 1,
                    'sourate_fin' => $sourate->nom,
                    'verset_fin' => $cible,
                    'statut' => $courante ? 'brouillon' : 'validee',
                    'valide_par' => $courante ? null : $oustazUser,
                    'valide_at' => $courante ? null : $debut->addDays(4)->setTime(18, 0),
                ]);
                // Dernière semaine écoulée du premier élève : l'oustaz demande à corriger sa fiche
                if (! $demande && ! $courante && $debut->addWeek()->equalTo($samediCourant)) {
                    $fiche->update(['modification_demandee_at' => now(), 'motif_demande_modification' => 'Erreur sur le verset de fin de mardi']);
                    $demande = true;
                }

                // Un jour = un morceau de l'objectif (D), une révision récente (J) et ancienne (M)
                $morceau = (int) ceil($cible / 5);
                foreach ($jours as $n => $jour) {
                    $date = $debut->addDays($n);
                    if ($date->greaterThanOrEqualTo($aujourdhui)) {
                        break;
                    }
                    $de = $n * $morceau + 1;
                    if ($de > $cible) {
                        break;
                    }
                    $precedente = $sourates[min(114, $numero + 1)];
                    Note::create([
                        'fiche_hebdomadaire_id' => $fiche->id,
                        'jour' => $jour,
                        'd_sourate_debut' => $numero, 'd_verset_debut' => $de,
                        'd_sourate_fin' => $numero, 'd_verset_fin' => min($cible, $de + $morceau - 1),
                        'j_sourate_debut' => $numero, 'j_verset_debut' => 1,
                        'j_sourate_fin' => $numero, 'j_verset_fin' => max(1, $de - 1),
                        'm_sourate_debut' => $precedente->numero, 'm_verset_debut' => 1,
                        'm_sourate_fin' => $precedente->numero, 'm_verset_fin' => $precedente->nombre_versets,
                        'qualite_recitation' => [2, 3, 3, 4, 4, 1][mt_rand(0, 5)],
                    ]);
                }
                $numero = min(114, $numero + 1);
            }
        }
    }

    /** Exemplarité de chaque mois écoulé (≈ 90 % des élèves évalués le mois en cours). */
    private function exemplarite(Collection $inscriptions, CarbonImmutable $debutAnnee, CarbonImmutable $aujourdhui): void
    {
        $lignes = [];
        foreach ($inscriptions->filter(fn ($i) => $i->classe_academique_id) as $inscription) {
            $oustazUser = Oustaz::find($inscription->classeAcademique->oustaz_id)->user_id;
            for ($mois = $debutAnnee; $mois->format('Y-m') <= $aujourdhui->format('Y-m'); $mois = $mois->addMonth()) {
                if ($mois->format('Y-m') === $aujourdhui->format('Y-m') && mt_rand(1, 10) === 1) {
                    continue;
                }
                $note = fn () => [2, 3, 3, 4, 4][mt_rand(0, 4)];
                $lignes[] = [
                    'eleve_id' => $inscription->eleve_id,
                    'mois' => $mois->format('Y-m'),
                    'assiduite_ponctualite' => $note(),
                    'discipline_comportement' => $note(),
                    'proprete_hygiene' => $note(),
                    'camaraderie_respect' => $note(),
                    'prieres_devotion' => $note(),
                    'evalue_par' => $oustazUser,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }
        }
        DB::table('evaluations_exemplarite')->insert($lignes);
    }

    /** Quelques diplômes délivrés (dont un annulé) pour la rubrique Diplômes et l'espace tuteur. */
    private function diplomes(Collection $inscriptions, CarbonImmutable $aujourdhui): void
    {
        $types = [['hifz_complet', 'excellent'], ['hifz_partiel', 'tres_bien'], ['tajwid', 'bien'], ['fin_cycle', 'assez_bien'], ['hifz_partiel', 'bien']];
        foreach ($inscriptions->filter(fn ($i) => $i->classeAcademique?->niveau === 'Avancé')->take(count($types))->values() as $n => $inscription) {
            [$type, $mention] = $types[$n];
            $obtention = $aujourdhui->subDays(3 + $n * 2);
            $diplome = Diplome::create([
                'eleve_id' => $inscription->eleve_id,
                'type' => $type,
                'intitule' => TypeDiplome::from($type)->intituleParDefaut(),
                'mention' => $mention,
                'date_obtention' => $obtention->toDateString(),
                'annee_scolaire' => AnneeScolaire::courante($obtention),
                'classe' => $inscription->classeAcademique->nom,
                'delivre_par' => $this->secretariat->id,
            ]);
            $diplome->update(['numero' => sprintf('DIP-%s-%06d', $obtention->format('Y'), $diplome->id)]);
            if ($n === count($types) - 1) {
                $diplome->update(['annule_at' => now(), 'annule_par' => $this->secretariat->id, 'motif_annulation' => 'Délivré par erreur (doublon)']);
            }
        }
    }

    /** Un élève et un compte archivés, pour essayer « Afficher les archivés ». */
    private function archives(string $annee): void
    {
        $eleve = Eleve::where('matricule', 'like', 'ELV-'.substr($annee, 0, 4).'-%')->latest('id')->first();
        $eleve?->forceFill(['is_archived' => true, 'archived_at' => now(), 'statut' => 'inactif'])->save();
        $this->compte('Faye', 'Daouda', 'M', '781000099', 'tuteur', ['is_archived' => true, 'archived_at' => now(), 'statut' => 'inactif']);
    }

    /** Journal d'activité du tableau de bord. */
    private function activite(Collection $eleves, Collection $classes): void
    {
        foreach ($classes->take(2) as $classe) {
            AuditEvent::create(['actor_user_id' => $this->secretariat->id, 'action' => 'classe.created', 'entity_type' => 'classe', 'entity_id' => $classe->id, 'metadata' => [], 'created_at' => now()->subDays(10)]);
        }
        foreach ($eleves->take(-4) as $eleve) {
            AuditEvent::create(['actor_user_id' => $this->secretariat->id, 'action' => 'eleve.enrolled', 'entity_type' => 'eleve', 'entity_id' => $eleve->id, 'metadata' => [], 'created_at' => now()->subDays(mt_rand(0, 5))]);
        }
    }
}
