# Institut Al-Hadi — guide du projet

Plateforme de gestion d'un daara (école coranique). L'**administration** gère élèves, classes, comptes, paiements, dépenses et diplômes. Les **oustaz** (enseignants) tiennent l'appel, le planning, les fiches de mémorisation et l'exemplarité. Les **tuteurs** (parents) suivent la progression, les paiements, les reçus et les diplômes de leurs enfants. Les élèves n'ont pas de compte.

## Technologies

| Partie | Outils |
|---|---|
| Backend | Laravel 12, PHP 8.3, Sanctum (jeton Bearer), MySQL 8, PHPUnit, Pint |
| Frontend | React 19, Vite, React Router 7, CSS maison, i18n français / arabe (RTL), Playwright (e2e) |
| Outils | Docker Compose (php-fpm, nginx :8090, MySQL :3310, phpMyAdmin :8091, planificateur), GitHub Actions, Postman, OpenAPI 3.1 |

**Démarrage** : `docker compose up -d`, puis `docker compose exec app php artisan migrate`, et dans `frontend/` : `npm install` et `npm run dev`. Le contrat de l'API est dans `backend/openapi.yaml` (préfixe `/api/v1`, importable dans Postman).
**Données de démonstration** : `docker compose exec -u www-data app php artisan db:seed --class=DemoSeeder`. Tous les comptes ont le mot de passe `demo1234` : admin `781000001`, oustaz `781000011` à `014`, tuteurs `782000001` à `030`.
**Tests** : `php artisan test` (backend), `npm run lint`, `npm run build` et `npm run test:e2e` (frontend, avec une API jetable).

## Règles communes

- **Année scolaire** : du 1er octobre au 30 septembre, toujours calculée par le serveur.
- **Rien n'est supprimé** : élèves et comptes sont archivés ; reçus et diplômes sont annulés avec un motif ; dépenses rejetées. Chaque action sensible est tracée dans `audit_events`.
- **Téléphones** : format E.164 (+221…). Le mot de passe temporaire `passer` doit être changé à la première connexion (6 caractères minimum).
- **Montants** : mensualité et frais d'inscription sont fixés par classe (montants par défaut dans `config/paiements.php`) et ne sont jamais saisis à l'inscription.

## Fonctionnalités, dans l'ordre de mise en place

| # | Fonctionnalité | Backend (API) | Frontend |
|---|---|---|---|
| 1 | **Socle** | Squelette Laravel, Docker, CI (tests + Pint) | Squelette React/Vite, CI (lint + build) |
| 2 | **Connexion** | Connexion par téléphone + mot de passe (Sanctum). Jeton restreint pour changer le mot de passe temporaire. Déconnexion. | Page de connexion responsive, changement de mot de passe imposé |
| 3 | **Comptes, élèves, classes** | Comptes admin / oustaz / tuteur ; inscription officielle (matricule `ELV-AAAA-NNNNNN`, un ou plusieurs tuteurs) ; classes (halaqat) avec un oustaz | Formulaires de création, listes paginées avec recherche |
| 4 | **Tableau de bord** | `GET admin/dashboard` : indicateurs, listes, options des formulaires, journal d'activité | Menu latéral par rôle, indicateurs, raccourcis, filtre par année |
| 5 | **Règles du daara** | Archivage, réinscription annuelle, contrôle des années, audit, accès limité par rôle | Affichage des archivés, messages d'erreur traduits |
| 6 | **Pédagogie** | Planning (samedi → mercredi), appel par séance, fiches hebdomadaires (objectif, repères D/J/M, récitation 0–4), exemplarité (5 critères notés 0–4), Élève du mois (50 % exemplarité, 30 % objectifs, 20 % récitation) | Espace oustaz : appel, planning, fiches, exemplarité |
| 7 | **Mensualités et bilingue** | Paiements d'octobre à juillet, reçus `REC-…`, annulation motivée, tarifs, rappels WhatsApp (automatiques et manuels) | Rubrique Paiements, reçu imprimable A5, interface français / arabe |
| 8 | **Dépenses** | Saisie, correction tant qu'en attente, validation ou rejet motivé ; recettes, solde, répartition par catégorie | Rubrique Dépenses avec indicateurs |
| 9 | **Photos et mots de passe** | Photo d'un élève ou d'un compte (2 Mo, URL calculée sur l'adresse de la requête) ; réinitialisation du mot de passe par l'admin | Prise de photo (appareil ou webcam), réduction automatique |
| 10 | **Paiement à l'inscription** | Frais et mensualités encaissés dans la même transaction ; un reçu par encaissement | Étape « reçus à imprimer » après l'inscription |
| 11 | **Dossiers complets** | Détail, modification et archivage (élève, compte, classe) ; synthèse de progression pour le tuteur | Fiches de détail, synthèse dans l'espace tuteur |
| 12 | **Tuteurs et transferts** | Rattacher, modifier ou retirer un tuteur ; changement de classe en cours d'année ; journal détaillé des rappels | Actions depuis la fiche élève ; journal des rappels |
| 13 | **Menu simplifié et démo** | `DemoSeeder` : données réalistes sur toutes les fonctionnalités | 6 rubriques : Tableau de bord, Élèves, Classes, Finances, Pédagogie, Comptes |
| 14 | **Frais d'inscription fixés et reçus du tuteur** | Montant par classe (`Tarifs`). Reçu `INS-…` émis à l'inscription ou plus tard (`inscriptions-annuelles/{id}/frais-inscription`). Le tuteur lit tous ses reçus (`tuteur/me/recus`) et leur détail. | Montant affiché, non modifiable ; colonne « Frais d'inscription » dans les tarifs ; liste « Mes reçus » dans l'espace tuteur |
| 15 | **Recherche de tuteurs** | `GET admin/tuteurs?q=` par prénom, nom ou téléphone, homonymes signalés | Champ de recherche avec suggestions (téléphone et enfants affichés) |
| 16 | **Fiches validées par l'oustaz** | Seul l'oustaz crée, remplit et valide une fiche. Il peut demander une réouverture ; seul l'admin l'autorise. | Admin en lecture seule, panneau « Demandes de modification » |
| 17 | **Élève du mois par classe** | Classement par classe, moyennes des scores, meilleur des meilleurs, classe exemplaire | Cartes lauréat et classe exemplaire, barres de score, vue par classe ou générale |
| 18 | **Diplômes** | Délivrance (`DIP-…`), correction, annulation motivée ; consultation par le tuteur | Onglet Diplômes, délivrance depuis la fiche élève, diplôme imprimable A4 |
| 19 | **Ergonomie** | — | Menus « ⋮ » d'actions, fenêtres de confirmation pour les actions sensibles, fiche classe → fiche élève en un clic, exemplarité colorée avec moyennes |

## Organisation du code

- `backend/app/Http/Controllers/Api` : un contrôleur par domaine (Auth, AdminUser, Eleve, Inscription, Classe, Planning, SuiviCoranique, Paiement, Depense, Diplome, Dashboard).
- `backend/app/Services` : encaissement des mensualités, frais d'inscription, rappels WhatsApp, photos.
- `backend/tests/Feature` : tests de l'API (base SQLite en mémoire). `backend/database/seeders/DemoSeeder.php` : données de démonstration.
- `frontend/src/pages` : connexion, tableau de bord (rubriques dans des sous-dossiers), reçu, diplôme. `frontend/src/services` : appels à l'API.
- `frontend/src/components` : composants partagés (avatar, photo, menu d'actions, confirmations, recherche de tuteur). `frontend/src/i18n` : textes français / arabe.
- `frontend/tests/e2e` : parcours Playwright. `postman/` : collections Postman.

## Points d'attention

- Changer un élève de classe applique le tarif de la nouvelle classe aux mois non soldés ; les reçus déjà émis ne changent pas.
- Une fiche rouverte ne compte plus pour l'Élève du mois jusqu'à sa nouvelle validation par l'oustaz.
- Les rappels WhatsApp réels nécessitent la configuration Meta (`WHATSAPP_DRIVER=meta`). Sinon, ils sont simulés et enregistrés dans le journal.
- Après un `git pull` : `docker compose exec app php artisan migrate`.
