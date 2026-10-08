<?php

namespace App\Support;

use Carbon\CarbonImmutable;

final class AnneeScolaire
{
    public static function courante(?CarbonImmutable $date = null): string
    {
        $date ??= CarbonImmutable::now(config('app.timezone'));
        $annee = (int) $date->format('Y');

        if ((int) $date->format('n') >= 10) {
            return sprintf('%04d-%04d', $annee, $annee + 1);
        }

        return sprintf('%04d-%04d', $annee - 1, $annee);
    }

    public static function debut(?CarbonImmutable $date = null): int
    {
        return (int) substr(self::courante($date), 0, 4);
    }
}
