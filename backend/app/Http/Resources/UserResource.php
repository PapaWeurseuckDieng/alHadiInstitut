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
            'sexe' => $this->sexe,
            'photo' => $this->photo ? Storage::url($this->photo) : null,
            'date_naissance' => $this->date_naissance?->toDateString(),
            'telephone' => $this->telephone,
            'adresse' => $this->adresse,
            'role' => $this->role->value,
            'statut' => $this->statut->value,
            'is_active' => $this->estActif(),
            'is_archived' => $this->is_archived,
            'archived_at' => $this->archived_at?->toIso8601String(),
            'must_change_password' => $this->must_change_password,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
