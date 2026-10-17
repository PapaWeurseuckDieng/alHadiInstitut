<?php

namespace App\Enums;

/**
 * Catégories de dépenses de l'institut. Une liste fermée permet des totaux
 * fiables par catégorie ; « autre » + description couvre les cas imprévus.
 */
enum CategorieDepense: string
{
    case Salaires = 'salaires';
    case Loyer = 'loyer';
    case EauElectricite = 'eau_electricite';
    case Fournitures = 'fournitures';
    case Entretien = 'entretien';
    case Alimentation = 'alimentation';
    case Transport = 'transport';
    case Evenements = 'evenements';
    case Autre = 'autre';
}
