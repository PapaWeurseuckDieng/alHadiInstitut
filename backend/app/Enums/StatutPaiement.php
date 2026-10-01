<?php

namespace App\Enums;

enum StatutPaiement: string
{
    case Paye = 'paye';
    case Partiel = 'partiel';
    case Impaye = 'impaye';
}
