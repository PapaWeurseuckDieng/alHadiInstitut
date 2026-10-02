<?php

namespace App\Enums;

enum Role: string
{
    case Admin = 'admin';
    case Oustaz = 'oustaz';
    case Tuteur = 'tuteur';
    case Eleve = 'eleve';
}
