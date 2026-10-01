<?php

namespace App\Enums;

enum Role: string
{
    case Admin = 'admin';
    case Enseignant = 'enseignant';
    case Eleve = 'eleve';
    case Parent = 'parent';
}
