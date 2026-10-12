<?php

namespace App\Console\Commands;

use App\Services\RappelsPaiement;
use App\Support\Mensualites;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;

/**
 * Rappel WhatsApp automatique des mensualités non réglées.
 *
 * Planifiée chaque jour (routes/console.php) : elle n'envoie rien avant le jour
 * configuré (le 10 par défaut), puis prévient une seule fois par mois chaque parent
 * dont un enfant n'est pas à jour. Lancée chaque jour, elle rattrape aussi un envoi
 * manqué (serveur arrêté le 10, nouvel impayé après le 10...).
 */
class EnvoyerRappelsPaiement extends Command
{
    protected $signature = 'paiements:rappels
        {--mois= : Mois concerné (AAAA-MM), par défaut le mois en cours}
        {--force : Envoyer même avant le jour prévu}';

    protected $description = 'Envoie par WhatsApp le rappel de mensualité aux parents des élèves non à jour';

    public function handle(RappelsPaiement $rappels): int
    {
        $mois = $this->option('mois') ?: Mensualites::moisCourant();

        if (! preg_match(Mensualites::REGEX_MOIS, $mois) || ! Mensualites::estMoisFacture($mois)) {
            $this->info("{$mois} n'est pas un mois facturé : aucun rappel.");

            return self::SUCCESS;
        }

        $jour = (int) config('paiements.rappel.jour');
        if (! $this->option('force') && $mois === Mensualites::moisCourant() && CarbonImmutable::now(config('app.timezone'))->day < $jour) {
            $this->info("Les rappels commencent le {$jour} du mois : rien à envoyer aujourd'hui.");

            return self::SUCCESS;
        }

        $bilan = $rappels->envoyer($mois, true);

        $this->info(sprintf(
            'Rappels %s (%s) : %d envoyé(s), %d simulé(s), %d échec(s), %d déjà prévenu(s).',
            Mensualites::libelleMois($mois),
            $rappels->pilote(),
            $bilan['envoyes'],
            $bilan['simules'],
            $bilan['echecs'],
            $bilan['ignores'],
        ));

        return $bilan['echecs'] > 0 ? self::FAILURE : self::SUCCESS;
    }
}
