<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    /*
    | Rappels de paiement par WhatsApp.
    |  - driver « log »  : aucun envoi réel, le message est écrit dans les logs (par défaut, développement) ;
    |  - driver « meta » : WhatsApp Business Cloud API (compte Meta Business + modèle de message approuvé).
    */
    'whatsapp' => [
        'driver' => env('WHATSAPP_DRIVER', 'log'),
        'token' => env('WHATSAPP_TOKEN'),
        'phone_number_id' => env('WHATSAPP_PHONE_NUMBER_ID'),
        'template' => env('WHATSAPP_TEMPLATE', 'rappel_mensualite'),
        'template_language' => env('WHATSAPP_TEMPLATE_LANGUAGE', 'fr'),
        'api_version' => env('WHATSAPP_API_VERSION', 'v21.0'),
        // Indicatif ajouté aux numéros locaux (ex. 77 123 45 67 -> 221771234567)
        'indicatif' => env('WHATSAPP_INDICATIF', '221'),
    ],
];
