<?php

namespace App\Enums;

enum MentionDiplome: string
{
    case Passable = 'passable';
    case AssezBien = 'assez_bien';
    case Bien = 'bien';
    case TresBien = 'tres_bien';
    case Excellent = 'excellent';
}
