<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
| Rappel WhatsApp des mensualités : vérifié chaque jour, envoyé à partir du 10
| (config/paiements.php), une seule fois par parent et par mois.
| Nécessite le planificateur Laravel : service « scheduler » du docker-compose
| (php artisan schedule:work) ou, sur un serveur, la tâche cron « php artisan schedule:run ».
*/
Schedule::command('paiements:rappels')
    ->dailyAt(config('paiements.rappel.heure'))
    ->timezone(config('app.timezone'))
    ->withoutOverlapping();
