<?php

namespace App\Http\Resources;

use App\Models\User;
use App\Services\PhotoProfil;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin User
 */
class UserResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'matricule' => $this->matricule,
            'nom' => $this->nom,
            'prenom' => $this->prenom,
            'sexe' => $this->sexe,
            'photo' => PhotoProfil::url($this->photo),
            'date_naissance' => $this->date_naissance?->toDateString(),
            'telephone' => $this->telephone,
            'adresse' => $this->adresse,
            'role' => $this->role->value,
            'statut' => $this->statut->value,
            'is_active' => $this->estActif(),
            'is_archived' => $this->is_archived,
            'archived_at' => $this->archived_at?->toIso8601String(),
            'must_change_password' => $this->must_change_password,
            // Profil Tuteur / Oustaz, présents seulement si le profil a été chargé (détail d'un compte)
            'profession' => $this->whenLoaded('tuteur', fn () => $this->tuteur?->profession),
            'specialite' => $this->whenLoaded('oustaz', fn () => $this->oustaz?->specialite),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
