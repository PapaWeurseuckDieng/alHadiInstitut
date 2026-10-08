<?php

namespace App\Enums;

/**
 * Jours de cours de l'institut (samedi → vendredi).
 */
enum Jour: string
{
    case Samedi = 'samedi';
    case Dimanche = 'dimanche';
    case Lundi = 'lundi';
    case Mardi = 'mardi';
    case Mercredi = 'mercredi';
    case Jeudi = 'jeudi';
    case Vendredi = 'vendredi';
}
