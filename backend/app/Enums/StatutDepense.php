<?php

namespace App\Enums;

enum StatutDepense: string
{
    case EnAttente = 'en_attente';
    case Validee = 'validee';
    case Rejetee = 'rejetee';
}
