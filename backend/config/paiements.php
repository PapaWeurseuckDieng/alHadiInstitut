<?php

/*
|--------------------------------------------------------------------------
| Mensualités (frais de scolarité)
|--------------------------------------------------------------------------
|
| Les parents paient au secrétariat (espèces le plus souvent) : la plateforme
| enregistre les paiements reçus, calcule qui est à jour et envoie les rappels.
|
*/

return [

    // Mensualité appliquée quand la classe n'a pas de tarif propre (en FCFA).
    'mensualite_par_defaut' => (int) env('PAIEMENT_MENSUALITE_DEFAUT', 10000),

    'devise' => 'FCFA',

    // Mois facturés : à partir d'octobre, 10 mois -> octobre à juillet.
    // premier_mois doit rester aligné sur App\Support\AnneeScolaire (l'année scolaire commence en octobre).
    'premier_mois' => 10,
    'nombre_mois' => (int) env('PAIEMENT_NOMBRE_MOIS', 10),

    // Rappel WhatsApp automatique : à partir de ce jour du mois, une fois par parent et par mois.
    'rappel' => [
        'jour' => (int) env('PAIEMENT_RAPPEL_JOUR', 10),
        'heure' => env('PAIEMENT_RAPPEL_HEURE', '09:00'),
    ],

    // Texte du rappel (pilote « log » et lien WhatsApp manuel). Avec le pilote « meta »,
    // c'est le modèle approuvé chez Meta qui est utilisé (mêmes 4 paramètres, dans cet ordre).
    'message_rappel' => "Assalamou alaykoum :parent,\n"
        ."L'Institut Al-Hadi vous rappelle que la mensualité de :mois pour :enfants n'est pas encore réglée "
        ."(reste à payer : :montant).\n"
        .'Merci de passer au secrétariat. Si vous avez déjà payé, merci de ne pas tenir compte de ce message.',

];
