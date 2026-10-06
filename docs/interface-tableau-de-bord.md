# Interface du tableau de bord Al-Hadi

L’interface reprend le vert profond, les touches dorées, la navigation latérale et les cartes de la maquette. Les données affichées proviennent de Laravel. Aucun indicateur financier, d’internat ou de suivi coranique n’est simulé.

## Parcours disponibles

- **Direction** : indicateurs calculés sur les dossiers existants, recherche et pagination des élèves, classes et comptes ; filtre par année scolaire ; dernières créations enregistrées dans le journal d’audit.
- **Inscription** : dossier élève, inscription, rattachement à un ou plusieurs tuteurs actifs ou création des comptes tuteurs dans la transaction existante.
- **Classe** : choix d’un oustaz actif et des inscriptions actives, sans classe et de la même année ; création sans élève possible.
- **Compte** : administrateur, oustaz ou tuteur ; mot de passe temporaire et changement obligatoire à la première connexion.
- **Tuteur** : uniquement ses élèves et leurs inscriptions.
- **Oustaz** : uniquement ses classes et les élèves affectés.

Le compte et le jeton sont vérifiés auprès de l’API. La déconnexion révoque le jeton. Après un changement de mot de passe, l’utilisateur se reconnecte conformément au contrat backend.

## API

Les formulaires utilisent les endpoints existants : `POST /api/v1/admin/users`, `POST /api/v1/eleves`, `POST /api/v1/classes` et les routes `/api/v1/auth/*`.

`GET /api/v1/admin/dashboard` ajoute seulement une lecture des modèles existants. Il est protégé par `auth:sanctum`, `password.changed` et `role:admin`. Paramètres : `section=eleves|classes|users`, `q`, `annee=2026-2027`, `page`. Les listes affichent dix résultats par page. Les mots de passe et les jetons ne sont jamais renvoyés.

Le filtre annuel s’applique aux élèves, inscriptions et classes ; le nombre de comptes actifs reste global et porte ce libellé dans l’interface. Les activités récentes sont globales.

## Utilisation locale

Depuis la racine :

```powershell
docker compose up -d
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Ouvrir `http://localhost:5173`. Le fichier `frontend/.env` doit contenir `VITE_API_URL=http://localhost:8090/api`. L’origine `http://localhost:5173` est autorisée par la configuration CORS existante. Pour une autre origine, adapter `CORS_ALLOWED_ORIGINS` côté Laravel.

## Vérifications

```powershell
# À la racine : SQLite en mémoire, pas la base MySQL.
docker compose exec -T app php artisan test

# Dans frontend :
npm run lint
npm run build
npm run test:e2e
```

Les tests navigateur nécessitent Docker Desktop, l’image `app` du Compose et Microsoft Edge. Ils démarrent automatiquement une API temporaire sur **8092** et Vite sur **5174** ; ces ports doivent être libres. Le backend est monté en lecture seule. Les comptes et dossiers de démonstration restent dans une base SQLite du conteneur temporaire, supprimée avec celui-ci après les tests. La base MySQL du projet n’est pas modifiée.

Les parcours couvrent la connexion, les créations réelles via l’API, les validations 422, la recherche, la pagination, les droits par rôle, le changement de mot de passe, le menu et les formulaires mobiles, ainsi que la reprise après une erreur réseau. Les captures et traces sont enregistrées dans `frontend/test-results`, ignoré par Git.

Les tests backend du tableau de bord contrôlent également l’accès refusé aux comptes non administrateurs, le changement obligatoire du mot de passe, les comptes inactifs exclus des sélections, les compteurs par année et l’absence de secrets dans les réponses.
