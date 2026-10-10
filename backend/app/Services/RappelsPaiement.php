<?php

namespace App\Services;

use App\Enums\StatutPaiement;
use App\Models\RappelPaiement;
use App\Models\Tuteur;
use App\Models\User;
use App\Services\WhatsApp\WhatsAppSender;
use App\Support\Mensualites;
use Illuminate\Support\Collection;

/**
 * Rappels de mensualité aux parents, par WhatsApp.
 *
 * - Seuls les parents dont au moins un enfant n'est pas à jour pour le mois sont prévenus.
 * - Un seul message par parent, qui regroupe ses enfants concernés.
 * - Envoi automatique : une seule fois par parent et par mois (voir la commande paiements:rappels).
 * - Envoi manuel (bouton de l'administration) : renvoie à tous les parents concernés.
 */
class RappelsPaiement
{
    public function __construct(private readonly WhatsAppSender $sender) {}

    /** Nom du pilote d'envoi (« log » = simulation, « meta » = envoi réel). */
    public function pilote(): string
    {
        return $this->sender->pilote();
    }

    /**
     * Parents à prévenir pour un mois, avec leurs enfants non à jour.
     *
     * @return Collection<int, array{tuteur: Tuteur, lignes: Collection<int, array>, reste: float}>
     */
    public function aPrevenir(string $mois): Collection
    {
        $parTuteur = [];

        foreach (Mensualites::situation($mois) as $ligne) {
            if ($ligne['statut'] === StatutPaiement::Paye) {
                continue;
            }
            foreach (Mensualites::tuteursAPrevenir($ligne['eleve']) as $tuteur) {
                $parTuteur[$tuteur->id] ??= ['tuteur' => $tuteur, 'lignes' => collect(), 'reste' => 0.0];
                $parTuteur[$tuteur->id]['lignes']->push($ligne);
                $parTuteur[$tuteur->id]['reste'] += $ligne['reste'];
            }
        }

        return collect(array_values($parTuteur));
    }

    /**
     * Paramètres du message, dans l'ordre du modèle WhatsApp : parent, mois, enfant(s), montant.
     *
     * @param  Collection<int, array>  $lignes
     * @return list<string>
     */
    public function parametres(Tuteur $tuteur, Collection $lignes, string $mois, float $reste): array
    {
        $enfants = $lignes->map(fn (array $ligne) => $ligne['eleve']->prenom.' '.$ligne['eleve']->nom)->values();
        $listeEnfants = $enfants->count() > 1
            ? $enfants->slice(0, -1)->implode(', ').' et '.$enfants->last()
            : $enfants->first();

        return [
            trim($tuteur->user->prenom.' '.$tuteur->user->nom),
            Mensualites::libelleMois($mois),
            (string) $listeEnfants,
            Mensualites::formaterMontant($reste),
        ];
    }

    /** Texte complet du rappel (simulation, lien WhatsApp manuel). */
    public function message(array $parametres): string
    {
        [$parent, $mois, $enfants, $montant] = $parametres;

        return strtr(config('paiements.message_rappel'), [
            ':parent' => $parent,
            ':mois' => $mois,
            ':enfants' => $enfants,
            ':montant' => $montant,
        ]);
    }

    /**
     * Numéro au format international sans « + », comme l'attend WhatsApp.
     * Ex. « 77 123 45 67 » -> « 221771234567 », « +221 77… » -> « 22177… ».
     */
    public function numeroWhatsApp(string $telephone): string
    {
        $chiffres = preg_replace('/\D+/', '', $telephone);
        if (str_starts_with($chiffres, '00')) {
            $chiffres = substr($chiffres, 2);
        }
        // Numéro local sénégalais à 9 chiffres : on ajoute l'indicatif
        if (strlen($chiffres) === 9) {
            $chiffres = config('services.whatsapp.indicatif').$chiffres;
        }

        return $chiffres;
    }

    /**
     * Lien WhatsApp manuel pour un élève (bouton « WhatsApp » de l'administration) :
     * numéro du premier parent à prévenir + message pré-rempli.
     *
     * @return array{numero: string, message: string}|null
     */
    public function lienManuel(array $ligne, string $mois): ?array
    {
        $tuteur = Mensualites::tuteursAPrevenir($ligne['eleve'])->first();
        if (! $tuteur) {
            return null;
        }

        $parametres = $this->parametres($tuteur, collect([$ligne]), $mois, $ligne['reste']);

        return ['numero' => $this->numeroWhatsApp($tuteur->user->telephone), 'message' => $this->message($parametres)];
    }

    /**
     * Envoie les rappels du mois et les enregistre dans le journal.
     *
     * @param  bool  $automatique  true : envoi planifié (un seul par parent et par mois)
     * @return array{envoyes: int, simules: int, echecs: int, ignores: int}
     */
    public function envoyer(string $mois, bool $automatique, ?User $par = null): array
    {
        $bilan = ['envoyes' => 0, 'simules' => 0, 'echecs' => 0, 'ignores' => 0];

        foreach ($this->aPrevenir($mois) as $aPrevenir) {
            $tuteur = $aPrevenir['tuteur'];

            // Envoi automatique : on ne relance pas un parent déjà prévenu ce mois-ci
            if ($automatique && $this->dejaPrevenu($tuteur, $mois)) {
                $bilan['ignores']++;

                continue;
            }

            $parametres = $this->parametres($tuteur, $aPrevenir['lignes'], $mois, $aPrevenir['reste']);
            $message = $this->message($parametres);
            $numero = $this->numeroWhatsApp($tuteur->user->telephone);
            $resultat = $this->sender->envoyer($numero, $message, $parametres);

            RappelPaiement::create([
                'tuteur_id' => $tuteur->id,
                'mois' => $mois,
                'canal' => 'whatsapp',
                'telephone' => $numero,
                'statut' => $resultat->statut,
                'automatique' => $automatique,
                'message' => $message,
                'erreur' => $resultat->erreur,
                'envoye_par' => $par?->id,
            ]);

            $bilan[match ($resultat->statut) {
                'envoye' => 'envoyes',
                'simule' => 'simules',
                default => 'echecs',
            }]++;
        }

        return $bilan;
    }

    /** Un rappel automatique a-t-il déjà abouti pour ce parent ce mois-ci ? */
    private function dejaPrevenu(Tuteur $tuteur, string $mois): bool
    {
        return RappelPaiement::where('tuteur_id', $tuteur->id)
            ->where('mois', $mois)
            ->where('automatique', true)
            ->whereIn('statut', ['envoye', 'simule'])
            ->exists();
    }
}
