<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Photos de profil (élèves et comptes) sur le disque « public ».
 * Le nom de fichier est aléatoire : l'URL n'est pas devinable à partir de l'identifiant.
 * URL servie : {hôte de la requête}/storage/… (nécessite `php artisan storage:link`).
 */
class PhotoProfil
{
    /** Règles de validation communes à tous les envois de photo (2 Mo max). */
    public const REGLES = ['image', 'mimes:jpg,jpeg,png,webp', 'max:2048'];

    public const MESSAGES = [
        'image' => 'La photo doit être une image.',
        'mimes' => 'La photo doit être au format JPG, PNG ou WEBP.',
        'max' => 'La photo ne doit pas dépasser 2 Mo.',
    ];

    /** Enregistre la photo dans photos/{dossier}/ et renvoie son chemin relatif. */
    public function enregistrer(UploadedFile $fichier, string $dossier): string
    {
        $extension = $fichier->extension() ?: 'jpg';

        return $fichier->storeAs('photos/'.$dossier, Str::random(40).'.'.$extension, 'public');
    }

    public function supprimer(?string $chemin): void
    {
        if ($chemin) {
            Storage::disk('public')->delete($chemin);
        }
    }

    /**
     * URL publique de la photo, construite sur l'adresse de la requête (ex. http://localhost:8090) :
     * elle reste juste même si APP_URL n'a pas le bon port dans l'environnement du conteneur.
     */
    public static function url(?string $chemin): ?string
    {
        return $chemin ? url('storage/'.ltrim($chemin, '/')) : null;
    }

    /** Messages de validation préfixés par le nom du champ (ex. « photo.max »). */
    public static function messages(string $champ = 'photo'): array
    {
        return collect(self::MESSAGES)->mapWithKeys(fn (string $message, string $regle) => [$champ.'.'.$regle => $message])->all();
    }
}
