<?php

namespace App\Services;

use App\Models\AuditEvent;
use App\Models\Inscription;
use App\Models\Paiement;
use App\Models\User;
use App\Support\Mensualites;
use Carbon\CarbonImmutable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Encaissement d'une mensualité et données du reçu.
 * Utilisé par POST /v1/paiements et par l'inscription d'un élève (paiement saisi
 * dans le même formulaire), pour que les deux appliquent exactement les mêmes règles.
 */
class EncaissementMensualite
{
    /**
     * Enregistre un paiement pour le mois donné et lui attribue un numéro de reçu.
     * Erreurs de validation (clés « mois » ou « montant ») si le mois n'est pas dû
     * par cette inscription, déjà réglé, ou si le montant dépasse le reste.
     *
     * @param  array{mois: string, montant: float|int|string, mode_paiement: string, date_paiement?: string|null, note?: string|null}  $data
     */
    public function encaisser(Inscription $inscription, array $data, User $caissier): Paiement
    {
        $mois = $data['mois'];
        if (! Mensualites::estMoisFacture($mois)) {
            throw ValidationException::withMessages(['mois' => 'Ce mois ne fait pas partie des mois facturés.']);
        }
        $debutInscription = CarbonImmutable::parse($inscription->date_inscription)->format('Y-m');
        if (Mensualites::anneeDuMois($mois) !== $inscription->annee_scolaire || $mois < $debutInscription) {
            throw ValidationException::withMessages(['mois' => 'Cet élève ne doit pas la mensualité de ce mois.']);
        }

        return DB::transaction(function () use ($inscription, $data, $mois, $caissier) {
            $inscription->loadMissing('classeAcademique');

            // Verrouille les paiements du mois de cet élève pour éviter un double encaissement simultané
            $dejaPayes = Paiement::valides()->where('eleve_id', $inscription->eleve_id)->where('mois', $mois)
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
                'mois' => $mois,
                'montant_du' => $ligne['montant_du'],
                'montant' => $data['montant'],
                'mode_paiement' => $data['mode_paiement'],
                'date_paiement' => $data['date_paiement'] ?? Carbon::today()->toDateString(),
                'note' => $data['note'] ?? null,
                'encaisse_par' => $caissier->id,
            ]);
            // Numéro de reçu unique et croissant, ex. REC-2026-000042
            $paiement->update(['numero_recu' => sprintf('REC-%s-%06d', now()->format('Y'), $paiement->id)]);

            AuditEvent::create([
                'actor_user_id' => $caissier->id,
                'action' => 'paiement.encaisse',
                'entity_type' => 'paiement',
                'entity_id' => $paiement->id,
                'metadata' => ['eleve_id' => $paiement->eleve_id, 'mois' => $paiement->mois, 'montant' => (float) $paiement->montant],
                'created_at' => now(),
            ]);

            return $paiement;
        });
    }

    /** Données d'un reçu (impression). */
    public function donneesRecu(Paiement $paiement): array
    {
        $paiement->loadMissing(['eleve.tuteurs.user', 'inscription.classeAcademique', 'caissier', 'annulePar']);
        // Total réglé pour ce mois (paiements valides) et reste après ce paiement
        $totalMois = (float) Paiement::valides()->where('eleve_id', $paiement->eleve_id)->where('mois', $paiement->mois)->sum('montant');
        $payeur = $paiement->eleve ? Mensualites::tuteursAPrevenir($paiement->eleve)->first() : null;

        return [
            'type' => 'mensualite',
            'id' => $paiement->id,
            'numero_recu' => $paiement->numero_recu,
            'date_paiement' => $paiement->date_paiement->toDateString(),
            'mois' => $paiement->mois,
            'mois_libelle' => Mensualites::libelleMois($paiement->mois),
            'libelle' => 'Mensualité de '.Mensualites::libelleMois($paiement->mois),
            'annee_scolaire' => $paiement->annee_scolaire,
            'eleve' => $paiement->eleve ? [
                'id' => $paiement->eleve->id,
                'matricule' => $paiement->eleve->matricule,
                'nom' => $paiement->eleve->nom,
                'prenom' => $paiement->eleve->prenom,
            ] : null,
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
}
