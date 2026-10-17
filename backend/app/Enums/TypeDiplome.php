<?php

namespace App\Enums;

/** Types de diplômes délivrés par l'institut. */
enum TypeDiplome: string
{
    case HifzComplet = 'hifz_complet';
    case HifzPartiel = 'hifz_partiel';
    case FinCycle = 'fin_cycle';
    case Tajwid = 'tajwid';
    case Autre = 'autre';

    /** Intitulé proposé quand l'administration n'en saisit pas. */
    public function intituleParDefaut(): string
    {
        return match ($this) {
            self::HifzComplet => 'Diplôme de mémorisation complète du Saint Coran',
            self::HifzPartiel => 'Attestation de mémorisation partielle du Coran',
            self::FinCycle => 'Diplôme de fin de cycle',
            self::Tajwid => 'Diplôme de Tajwid',
            self::Autre => 'Diplôme',
        };
    }
}
