<?php

namespace App\Support;

use App\Enums\StatutPaiement;
use App\Models\Eleve;
use App\Models\Inscription;
use App\Models\Paiement;
use App\Models\Tuteur;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Règles des mensualités (frais de scolarité payés au secrétariat).
 *
 * - Un élève doit une mensualité pour chaque mois facturé (octobre à juillet par défaut)
 *   de l'année scolaire, à partir du mois de son inscription.
 * - Le montant dû est le tarif de sa classe, ou le tarif par défaut (config/paiements.php).
 * - Le statut se calcule à partir des paiements non annulés du mois :
 *   payé (tout réglé), partiel (une partie), impayé (rien).
 */
final class Mensualites
{
    /** Format attendu pour un mois : AAAA-MM (ex. 2026-10). */
    public const REGEX_MOIS = '/^\d{4}-(0[1-9]|1[0-2])$/';

    /**
     * Mois facturés d'une année scolaire, dans l'ordre.
     *
     * @return list<string> ex. ['2026-10', '2026-11', ..., '2027-07']
     */
    public static function moisDeLAnnee(string $annee): array
    {
        $debut = CarbonImmutable::create((int) substr($annee, 0, 4), (int) config('paiements.premier_mois'), 1);

        return collect(range(0, (int) config('paiements.nombre_mois') - 1))
            ->map(fn (int $decalage) => $debut->addMonths($decalage)->format('Y-m'))
            ->all();
    }

    /** Année scolaire à laquelle appartient un mois (ex. 2027-03 -> 2026-2027). */
    public static function anneeDuMois(string $mois): string
    {
        return AnneeScolaire::courante(CarbonImmutable::createFromFormat('!Y-m', $mois));
    }

    /** Le mois fait-il partie des mois facturés de son année scolaire ? */
    public static function estMoisFacture(string $mois): bool
    {
        return in_array($mois, self::moisDeLAnnee(self::anneeDuMois($mois)), true);
    }

    /** Mois en cours, au format AAAA-MM. */
    public static function moisCourant(): string
    {
        return CarbonImmutable::now(config('app.timezone'))->format('Y-m');
    }

    /**
     * Mois affiché par défaut : le mois en cours s'il est facturé,
     * sinon le dernier mois facturé de l'année scolaire (vacances).
     */
    public static function moisParDefaut(): string
    {
        $courant = self::moisCourant();
        if (self::estMoisFacture($courant)) {
            return $courant;
        }

        $mois = self::moisDeLAnnee(AnneeScolaire::courante());

        return $courant < $mois[0] ? $mois[0] : end($mois);
    }

    /** Libellé du mois en français, ex. « octobre 2026 ». */
    public static function libelleMois(string $mois): string
    {
        return CarbonImmutable::createFromFormat('!Y-m', $mois)->locale('fr')->translatedFormat('F Y');
    }

    /** Montant affiché, ex. « 10 000 FCFA ». */
    public static function formaterMontant(float $montant): string
    {
        return number_format($montant, 0, ',', ' ').' '.config('paiements.devise');
    }

    /** Mensualité due pour une inscription : tarif de la classe, sinon tarif par défaut. */
    public static function montantDu(Inscription $inscription): float
    {
        $tarif = $inscription->classeAcademique?->mensualite;

        return (float) ($tarif ?? config('paiements.mensualite_par_defaut'));
    }

    /** Statut d'une mensualité selon ce qui est dû et ce qui est payé. */
    public static function statut(float $du, float $paye): StatutPaiement
    {
        if ($paye <= 0) {
            return StatutPaiement::Impaye;
        }

        return $paye >= $du ? StatutPaiement::Paye : StatutPaiement::Partiel;
    }

    /**
     * Inscriptions qui doivent la mensualité du mois : élèves non archivés,
     * inscription active de l'année scolaire du mois, inscrits au plus tard ce mois-là.
     *
     * @return Collection<int, Inscription> une inscription par élève
     */
    public static function inscriptionsConcernees(string $mois): Collection
    {
        $finDuMois = CarbonImmutable::createFromFormat('!Y-m', $mois)->endOfMonth()->toDateString();

        return Inscription::with(['eleve.tuteurs.user', 'classeAcademique'])
            ->where('annee_scolaire', self::anneeDuMois($mois))
            ->where('statut', 'active')
            ->where('is_archived', false)
            ->whereHas('eleve', fn ($eleves) => $eleves->where('is_archived', false))
            ->whereDate('date_inscription', '<=', $finDuMois)
            ->orderByDesc('id')
            ->get()
            ->unique('eleve_id')
            ->values();
    }

    /**
     * Situation de chaque élève pour un mois.
     *
     * @return Collection<int, array{inscription: Inscription, eleve: Eleve, montant_du: float, montant_paye: float, reste: float, statut: StatutPaiement, paiements: Collection}>
     */
    public static function situation(string $mois): Collection
    {
        $inscriptions = self::inscriptionsConcernees($mois);

        // Paiements valides du mois, regroupés par élève
        $paiements = Paiement::valides()
            ->where('mois', $mois)
            ->whereIn('eleve_id', $inscriptions->pluck('eleve_id'))
            ->orderBy('date_paiement')
            ->get()
            ->groupBy('eleve_id');

        return $inscriptions
            ->map(fn (Inscription $inscription) => self::ligne($inscription, $paiements->get($inscription->eleve_id, collect())))
            ->sortBy(fn (array $ligne) => mb_strtolower($ligne['eleve']->nom.' '.$ligne['eleve']->prenom))
            ->values();
    }

    /**
     * Situation d'un élève pour un mois, à partir de ses paiements valides de ce mois.
     *
     * @param  Collection<int, Paiement>  $paiements
     */
    public static function ligne(Inscription $inscription, Collection $paiements): array
    {
        $du = self::montantDu($inscription);
        $paye = (float) $paiements->sum('montant');

        return [
            'inscription' => $inscription,
            'eleve' => $inscription->eleve,
            'montant_du' => $du,
            'montant_paye' => $paye,
            'reste' => max(0, $du - $paye),
            'statut' => self::statut($du, $paye),
            'paiements' => $paiements->values(),
        ];
    }

    /**
     * Tuteurs à prévenir pour un élève : ceux marqués « payeur » ;
     * à défaut les responsables légaux ; à défaut tous. Comptes actifs avec téléphone uniquement.
     *
     * @return Collection<int, Tuteur>
     */
    public static function tuteursAPrevenir(Eleve $eleve): Collection
    {
        $tuteurs = $eleve->tuteurs->filter(fn (Tuteur $tuteur) => $tuteur->user?->estActif() && filled($tuteur->user->telephone));

        $payeurs = $tuteurs->filter(fn (Tuteur $tuteur) => (bool) $tuteur->pivot->est_payeur);
        if ($payeurs->isNotEmpty()) {
            return $payeurs->values();
        }

        $responsables = $tuteurs->filter(fn (Tuteur $tuteur) => (bool) $tuteur->pivot->est_responsable_legal);

        return ($responsables->isNotEmpty() ? $responsables : $tuteurs)->values();
    }
}
