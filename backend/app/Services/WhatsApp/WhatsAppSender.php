<?php

namespace App\Services\WhatsApp;

/**
 * Envoi d'un message WhatsApp à un numéro.
 * Le pilote est choisi par WHATSAPP_DRIVER (voir config/services.php) :
 *  - « log »  : simulation, rien n'est envoyé (développement, tests) ;
 *  - « meta » : WhatsApp Business Cloud API.
 */
interface WhatsAppSender
{
    /**
     * @param  string  $numero  Numéro international sans « + » (ex. 221771234567)
     * @param  string  $message  Texte complet (pilote log, lien manuel)
     * @param  list<string>  $parametres  Paramètres du modèle approuvé (pilote meta) : parent, mois, enfants, montant
     */
    public function envoyer(string $numero, string $message, array $parametres): ResultatEnvoi;

    /** Nom du pilote (« log » ou « meta »), affiché dans l'interface. */
    public function pilote(): string;
}
