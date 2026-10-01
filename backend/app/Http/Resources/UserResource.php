<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

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
            'photo' => $this->photo ? Storage::url($this->photo) : null,
            'date_naissance' => $this->date_naissance?->toDateString(),
            'telephone' => $this->telephone,
            'adresse' => $this->adresse,
            'role' => $this->role->value,
            'statut' => $this->statut->value,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
