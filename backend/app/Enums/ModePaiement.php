<?php

namespace App\Enums;

enum ModePaiement: string
{
    case Especes = 'especes';
    case Wave = 'wave';
    case OrangeMoney = 'orange_money';
    case Virement = 'virement';
    case Cheque = 'cheque';
}
