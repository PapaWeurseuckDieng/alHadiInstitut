# Conception backend - gestion d'un Daara

## Stack et conventions

Le dépôt utilise Laravel 12 / PHP 8.2+, Laravel Sanctum et MySQL 8 dans `docker-compose.yml`. Le contrat ci-dessous cible cette stack et fournit un DDL MySQL 8 autonome. L'API est versionnée sous `/api/v1`; les erreurs renvoient toujours un objet JSON dont `message` est en français.

Cette spécification décrit le comportement cible demandé. Elle ne prétend pas que les contrôleurs et migrations actuels implémentent déjà l'ensemble de ces routes et contraintes.

## 1. Schéma relationnel SQL

Les suppressions physiques sont interdites pour les comptes et les élèves. Les références utilisent `RESTRICT` afin que les données historiques ne puissent pas être supprimées par cascade. `is_archived` masque les enregistrements archivés par défaut; `archived_at` conserve la date d'archivage.

```sql
CREATE TABLE roles (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code VARCHAR(20) NOT NULL,
    libelle VARCHAR(80) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_roles_code UNIQUE (code),
    CONSTRAINT chk_roles_code CHECK (code IN ('admin', 'tuteur', 'oustaz'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO roles (code, libelle) VALUES
    ('admin', 'Administrateur'),
    ('tuteur', 'Tuteur'),
    ('oustaz', 'Oustaz');

CREATE TABLE users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    role_id BIGINT UNSIGNED NOT NULL,
    matricule VARCHAR(32) NOT NULL,
    nom VARCHAR(120) NOT NULL,
    prenom VARCHAR(120) NOT NULL,
    telephone VARCHAR(20) NOT NULL,
    sexe CHAR(1) NOT NULL,
    adresse VARCHAR(255) NULL,
    date_naissance DATE NULL,
    password VARCHAR(255) NOT NULL,
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uq_users_matricule UNIQUE (matricule),
    CONSTRAINT uq_users_telephone UNIQUE (telephone),
    CONSTRAINT chk_users_sexe CHECK (sexe IN ('M', 'F')),
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE RESTRICT,
    INDEX idx_users_role_archive (role_id, is_archived),
    INDEX idx_users_active_archive (is_active, is_archived)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tuteurs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    profession VARCHAR(120) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uq_tuteurs_user UNIQUE (user_id),
    CONSTRAINT fk_tuteurs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE oustazs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    specialite VARCHAR(120) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uq_oustazs_user UNIQUE (user_id),
    CONSTRAINT fk_oustazs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE eleves (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tuteur_id BIGINT UNSIGNED NOT NULL,
    matricule VARCHAR(32) NOT NULL,
    nom VARCHAR(120) NOT NULL,
    prenom VARCHAR(120) NOT NULL,
    date_naissance DATE NULL,
    sexe CHAR(1) NOT NULL,
    adresse VARCHAR(255) NULL,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uq_eleves_matricule UNIQUE (matricule),
    CONSTRAINT chk_eleves_sexe CHECK (sexe IN ('M', 'F')),
    CONSTRAINT fk_eleves_tuteur FOREIGN KEY (tuteur_id) REFERENCES tuteurs (id) ON DELETE RESTRICT,
    INDEX idx_eleves_tuteur_archive (tuteur_id, is_archived),
    INDEX idx_eleves_nom_prenom (nom, prenom)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE classes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    oustaz_id BIGINT UNSIGNED NOT NULL,
    nom VARCHAR(120) NOT NULL,
    niveau VARCHAR(80) NOT NULL,
    annee_scolaire CHAR(9) NOT NULL,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uq_classes_nom_annee UNIQUE (nom, annee_scolaire),
    CONSTRAINT fk_classes_oustaz FOREIGN KEY (oustaz_id) REFERENCES oustazs (id) ON DELETE RESTRICT,
    INDEX idx_classes_annee_archive (annee_scolaire, is_archived),
    INDEX idx_classes_oustaz_annee (oustaz_id, annee_scolaire)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inscriptions_annuelles (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    eleve_id BIGINT UNSIGNED NOT NULL,
    classe_id BIGINT UNSIGNED NOT NULL,
    annee_scolaire CHAR(9) NOT NULL,
    date_inscription DATE NOT NULL,
    statut VARCHAR(16) NOT NULL DEFAULT 'active',
    created_by BIGINT UNSIGNED NULL,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT uq_inscriptions_eleve_annee UNIQUE (eleve_id, annee_scolaire),
    CONSTRAINT chk_inscriptions_statut CHECK (statut IN ('active', 'annulee')),
    CONSTRAINT fk_inscriptions_eleve FOREIGN KEY (eleve_id) REFERENCES eleves (id) ON DELETE RESTRICT,
    CONSTRAINT fk_inscriptions_classe FOREIGN KEY (classe_id) REFERENCES classes (id) ON DELETE RESTRICT,
    CONSTRAINT fk_inscriptions_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    INDEX idx_inscriptions_classe_annee (classe_id, annee_scolaire),
    INDEX idx_inscriptions_annee_statut (annee_scolaire, statut, is_archived)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sequences_matricules (
    annee SMALLINT UNSIGNED NOT NULL,
    dernier_numero BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (annee)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Règles relationnelles complémentaires

- Le compte d'un tuteur ou d'un Oustaz est dans `users`; `tuteurs` et `oustazs` sont des profils à correspondance un-à-un. Les élèves n'ont pas de ligne `users`.
- `eleves.tuteur_id NOT NULL` rend impossible la création SQL d'un élève sans tuteur.
- Le contrôleur d'inscription vérifie dans une transaction que le tuteur et l'Oustaz sont actifs et non archivés, que la classe appartient à l'année calculée, et que l'élève n'a pas déjà d'inscription pour cette année.
- La création de l'élève crée atomiquement l'inscription annuelle. La contrainte unique `(eleve_id, annee_scolaire)` protège aussi contre les requêtes concurrentes.
- Le matricule d'élève est alloué dans une transaction via `sequences_matricules` et un verrou `SELECT ... FOR UPDATE`. Exemple de format : `ELV-2026-000001`. La contrainte `UNIQUE` reste le dernier garde-fou.
- `users.sexe` couvre les profils Admin, Tuteur et Oustaz; `eleves.sexe` couvre l'élève. Les contraintes `CHECK` limitent les valeurs à `M` ou `F`.
- Les recherches de listes appliquent `is_archived = FALSE` par défaut. Seul un Admin peut demander `include_archived=true`.
- Aucun endpoint `DELETE` n'est exposé. Les clés étrangères refusent également les suppressions par cascade.

## 2. Calcul automatique de l'année scolaire

Le fuseau est celui du serveur (`APP_TIMEZONE`, à configurer, par exemple `Africa/Dakar`). L'année du corps de requête n'est jamais acceptée en création. Le middleware/service met la valeur calculée dans le contexte de requête; les services de création la recopient dans `classes.annee_scolaire` ou `inscriptions_annuelles.annee_scolaire`. Pour les lectures, l'année courante est le filtre par défaut; un Admin peut demander explicitement une année historique.

```php
use Carbon\CarbonImmutable;

final class AnneeScolaire
{
    public static function courante(?CarbonImmutable $dateServeur = null): string
    {
        $date = $dateServeur ?? CarbonImmutable::now(config('app.timezone'));
        $annee = (int) $date->format('Y');

        if ((int) $date->format('n') >= 10) {
            return sprintf('%04d-%04d', $annee, $annee + 1);
        }

        return sprintf('%04d-%04d', $annee - 1, $annee);
    }
}
```

Exemples de frontière à tester :

| Date serveur | Année scolaire |
|---|---|
| 30/09/2026 | `2025-2026` |
| 01/10/2026 | `2026-2027` |
| 07/10/2026 | `2026-2027` |

Un middleware peut ajouter `request->attributes->set('annee_scolaire', AnneeScolaire::courante())`. Les validateurs de création interdisent le champ `annee_scolaire` fourni par le client; une tentative de surcharge renvoie `422`.

## 3. Endpoints REST

Base URL : `/api/v1`. Les identifiants `{userId}`, `{eleveId}`, `{classeId}` et `{inscriptionId}` sont des entiers positifs.

| Méthode et route | Rôle | Résumé |
|---|---|---|
| `POST /auth/login` | Public | Connexion par téléphone; remet un jeton limité si le mot de passe doit changer |
| `POST /auth/change-password` | Jeton de changement uniquement | Change le mot de passe initial et renouvelle l'accès |
| `POST /auth/logout` | Connecté | Révoque le jeton courant |
| `GET /admin/users` | Admin | Liste paginée; `include_archived=true` est Admin uniquement |
| `POST /admin/users` | Admin | Crée un compte Admin, Tuteur ou Oustaz avec `must_change_password=true` |
| `GET /admin/users/{userId}` | Admin | Détail d'un compte |
| `PATCH /admin/users/{userId}` | Admin | Modifie les champs du compte et son profil |
| `POST /admin/users/{userId}/archive` | Admin | Archive sans supprimer |
| `GET /eleves` | Admin | Liste paginée des élèves non archivés par défaut |
| `POST /eleves` | Admin | Inscrit officiellement un élève; crée sa première inscription annuelle |
| `GET /eleves/{eleveId}` | Admin | Détail de l'élève et de ses inscriptions |
| `PATCH /eleves/{eleveId}` | Admin | Modifie la fiche élève |
| `POST /eleves/{eleveId}/archive` | Admin | Archive l'élève sans supprimer ses données historiques |
| `GET /inscriptions-annuelles` | Admin | Liste les inscriptions; année courante par défaut |
| `POST /inscriptions-annuelles` | Admin | Réinscrit un élève existant pour l'année courante |
| `POST /classes` | Admin | Crée une classe de l'année courante et affecte un Oustaz |
| `GET /classes` | Admin, Oustaz | Liste les classes de l'année courante par défaut |
| `PATCH /classes/{classeId}` | Admin | Modifie la classe ou affecte un autre Oustaz |
| `GET /classes/{classeId}/eleves` | Admin, Oustaz affecté | Liste les élèves inscrits dans cette classe |
| `GET /tuteur/enfants/{eleveId}/synthese` | Tuteur rattaché | Synthèse de progression; vérifie le rattachement avant toute lecture |

Le document OpenAPI complet, avec schémas, validations, exemples de requête, de succès et d'erreur pour chaque opération, est [openapi.yaml](../../backend/openapi.yaml).

## 4. Exemples JSON

### Connexion et changement du mot de passe initial

```http
POST /api/v1/auth/login
Content-Type: application/json
```

```json
{
  "telephone": "+221771234567",
  "password": "passer"
}
```

```json
{
  "message": "Changement de mot de passe obligatoire.",
  "token": "1|jeton-temporaire",
  "token_type": "Bearer",
  "must_change_password": true,
  "next_action": "change_password"
}
```

Le jeton temporaire ne permet qu'un appel à `POST /api/v1/auth/change-password`. Le nouveau mot de passe doit avoir au moins six caractères; aucune règle supplémentaire de complexité n'est imposée.

```http
POST /api/v1/auth/change-password
Authorization: Bearer 1|jeton-temporaire
Content-Type: application/json
```

```json
{
  "new_password": "monSecret6",
  "new_password_confirmation": "monSecret6"
}
```

```json
{
  "message": "Mot de passe modifié. Vous pouvez vous connecter."
}
```

### Création d'un utilisateur (Admin)

```http
POST /api/v1/admin/users
Authorization: Bearer <jeton-admin>
Content-Type: application/json
```

```json
{
  "nom": "Ndiaye",
  "prenom": "Aminata",
  "telephone": "+221771234567",
  "sexe": "F",
  "role": "tuteur",
  "adresse": "Dakar",
  "profession": "Commerçante"
}
```

```json
{
  "message": "Compte créé. Le mot de passe initial doit être changé.",
  "data": {
    "id": 24,
    "nom": "Ndiaye",
    "prenom": "Aminata",
    "telephone": "+221771234567",
    "sexe": "F",
    "role": "tuteur",
    "must_change_password": true,
    "is_archived": false
  }
}
```

Le serveur stocke un hash de `passer`, jamais le mot de passe en clair.

### Inscription officielle d'un élève

```http
POST /api/v1/eleves
Authorization: Bearer <jeton-admin>
Content-Type: application/json
```

```json
{
  "nom": "Diop",
  "prenom": "Moussa",
  "date_naissance": "2015-03-12",
  "sexe": "M",
  "adresse": "Thiès",
  "tuteur_id": 24,
  "classe_id": 7
}
```

```json
{
  "message": "Élève inscrit pour l'année scolaire 2026-2027.",
  "data": {
    "id": 81,
    "matricule": "ELV-2026-000001",
    "nom": "Diop",
    "prenom": "Moussa",
    "sexe": "M",
    "tuteur_id": 24,
    "inscription": {
      "id": 102,
      "annee_scolaire": "2026-2027",
      "classe_id": 7,
      "statut": "active"
    }
  }
}
```

`annee_scolaire` est calculée par le serveur et n'apparaît donc pas dans le payload d'entrée.

### Création d'une classe avec affectation d'Oustaz

```http
POST /api/v1/classes
Authorization: Bearer <jeton-admin>
Content-Type: application/json
```

```json
{
  "nom": "Classe A",
  "niveau": "Débutant",
  "oustaz_id": 5
}
```

```json
{
  "message": "Classe créée.",
  "data": {
    "id": 7,
    "nom": "Classe A",
    "niveau": "Débutant",
    "annee_scolaire": "2026-2027",
    "oustaz_id": 5,
    "effectif": 0
  }
}
```

### Synthèse d'un enfant par son tuteur

```http
GET /api/v1/tuteur/enfants/81/synthese
Authorization: Bearer <jeton-tuteur>
```

```json
{
  "data": {
    "eleve": {
      "id": 81,
      "matricule": "ELV-2026-000001",
      "nom_complet": "Moussa Diop"
    },
    "annee_scolaire": "2026-2027",
    "classe": {
      "id": 7,
      "nom": "Classe A"
    },
    "progression": {
      "moyenne_periode": 15.5,
      "moyenne_periode_precedente": 14.0,
      "tendance": "en_hausse",
      "dernieres_evaluations": [
        {
          "matiere": "Lecture",
          "note": 16.0,
          "sur": 20,
          "date": "2026-10-05"
        }
      ]
    },
    "mise_a_jour": "2026-10-07T20:00:00+00:00"
  }
}
```

### Erreurs normalisées

Les erreurs de validation renvoient `422`; authentification invalide `401`; rôle insuffisant ou accès à l'enfant d'un autre tuteur `403`; ressource absente `404`; conflit métier (par exemple inscription annuelle déjà créée) `409`; erreur inattendue `500`.

```json
{
  "message": "Le numéro de téléphone existe déjà."
}
```

```json
{
  "message": "Les données fournies sont invalides.",
  "errors": {
    "sexe": [
      "Le sexe doit être M ou F."
    ]
  }
}
```
