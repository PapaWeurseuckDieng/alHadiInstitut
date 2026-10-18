<?php

namespace App\Services;

use App\Models\AuditEvent;
use App\Models\Inscription;
use App\Models\User;
use App\Support\Mensualites;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Frais d'inscription : montant fixé par classe (jamais saisi à la main),
 * encaissé une fois par inscription annuelle, avec un reçu numéroté INS-AAAA-NNNNNN.
 */
class FraisInscription
{
    /**
     * Encaisse les frais de l'inscription au montant de sa classe et émet le reçu.
     * Erreur de validation (clé « frais_inscription ») si déjà réglés, sans classe ou sans montant.
     */
    public function encaisser(Inscription $inscription, string $modePaiement, ?string $datePaiement, User $caissier): Inscription
    {
        return DB::transaction(function () use ($inscription, $modePaiement, $datePaiement, $caissier) {
            $inscription = Inscription::with('classeAcademique')->lockForUpdate()->findOrFail($inscription->id);
            if ($inscription->fraisPayes()) {
                throw ValidationException::withMessages(['frais_inscription' => 'Les frais d’inscription de cette année sont déjà réglés.']);
            }
            if (! $inscription->classeAcademique) {
                throw ValidationException::withMessages(['frais_inscription' => 'Affectez d’abord l’élève à une classe : le montant des frais dépend de la classe.']);
            }
            $montant = $inscription->classeAcademique->fraisInscriptionAppliques();
            if ($montant <= 0) {
                throw ValidationException::withMessages(['frais_inscription' => 'Aucun frais d’inscription n’est fixé pour cette classe.']);
            }

            $inscription->forceFill([
                'montant_inscription' => $montant,
                'mode_paiement' => $modePaiement,
                'date_paiement_inscription' => $datePaiement ?? Carbon::today()->toDateString(),
                'frais_encaisse_par' => $caissier->id,
                'numero_recu_inscription' => sprintf('INS-%s-%06d', now()->format('Y'), $inscription->id),
            ])->save();

            AuditEvent::create([
                'actor_user_id' => $caissier->id,
                'action' => 'inscription.frais_encaisses',
                'entity_type' => 'inscription',
                'entity_id' => $inscription->id,
                'metadata' => ['eleve_id' => $inscription->eleve_id, 'montant' => $montant],
                'created_at' => now(),
            ]);

            return $inscription;
        });
    }

    /** Données du reçu des frais d'inscription (même forme que le reçu d'une mensualité). */
    public function donneesRecu(Inscription $inscription): array
    {
        $inscription->loadMissing(['eleve.tuteurs.user', 'classeAcademique', 'caissierFrais']);
        $payeur = $inscription->eleve ? Mensualites::tuteursAPrevenir($inscription->eleve)->first() : null;
        $montant = (float) $inscription->montant_inscription;

        return [
            'type' => 'inscription',
            'id' => $inscription->id,
            'numero_recu' => $inscription->numero_recu_inscription,
            'date_paiement' => $inscription->date_paiement_inscription?->toDateString(),
            'mois' => null,
            'libelle' => 'Frais d’inscription '.$inscription->annee_scolaire,
            'annee_scolaire' => $inscription->annee_scolaire,
            'eleve' => $inscription->eleve ? [
                'id' => $inscription->eleve->id,
                'matricule' => $inscription->eleve->matricule,
                'nom' => $inscription->eleve->nom,
                'prenom' => $inscription->eleve->prenom,
            ] : null,
            'classe' => $inscription->classeAcademique?->nom,
            'tuteur' => $payeur ? trim($payeur->user->prenom.' '.$payeur->user->nom) : null,
            'montant' => $montant,
            'montant_du' => $montant,
            'total_paye_mois' => $montant,
            'reste' => 0,
            'mode_paiement' => $inscription->mode_paiement?->value,
            'note' => null,
            'encaisse_par' => $inscription->caissierFrais ? trim($inscription->caissierFrais->prenom.' '.$inscription->caissierFrais->nom) : null,
            'devise' => config('paiements.devise'),
            'annule' => false,
            'annule_at' => null,
            'motif_annulation' => null,
            'created_at' => $inscription->updated_at?->toIso8601String(),
        ];
    }
}
