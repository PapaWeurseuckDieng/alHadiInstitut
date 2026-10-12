<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Sourate extends Model
{
    protected $table = 'sourates';

    protected $primaryKey = 'numero';

    public $incrementing = false;

    public $timestamps = false;

    protected $keyType = 'int';

    protected $fillable = ['numero', 'nom', 'nom_arabe', 'nombre_versets'];

    protected function casts(): array
    {
        return [
            'numero' => 'integer',
            'nombre_versets' => 'integer',
        ];
    }
}
