<?php

namespace App\Enums;

/**
 * Jours de cours de l'institut (samedi → mercredi).
 */
enum Jour: string
{
    case Samedi = 'samedi';
    case Dimanche = 'dimanche';
    case Lundi = 'lundi';
    case Mardi = 'mardi';
    case Mercredi = 'mercredi';
}
