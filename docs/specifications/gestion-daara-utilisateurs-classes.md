# Spécification — Utilisateurs, inscription des élèves et classes (Halaqat)

> **Branche** : `feature/gestion-daara-users-halaqat`  
> **Statut** : proposition fonctionnelle et technique  
> **Périmètre** : étapes fonctionnelles 1 et 2 du Daara  
> **Date** : 2026-10-01

## Périmètre et contexte existant

Ce document spécifie la création des comptes, l'inscription officielle des élèves et la création des classes. Il complète l'authentification existante ; il ne spécifie pas les paiements, les évaluations, la gestion des séances ni la récupération de mot de passe.

Le backend est actuellement une application Laravel avec Sanctum. L'authentification existante utilise le téléphone et le mot de passe. Le modèle `User` inclut actuellement les élèves et contient un matricule ; `Role` expose les valeurs `admin`, `enseignant`, `eleve` et `parent`. La table `inscriptions` référence actuellement `users` et une classe obligatoire, tandis que `classes_academiques` ne possède pas encore de référence à un Oustaz.

La conception cible ci-dessous sépare le dossier métier de l'élève du compte utilisateur. La mise en œuvre devra donc migrer ces références et aligner les rôles existants (`parent` vers `tuteur`, `enseignant` vers `oustaz`) sans créer de compte aux élèves.

## PARTIE A — Spécifications fonctionnelles

### Acteurs et droits

| Acteur | Capacités dans ce périmètre |
|---|---|
| Administrateur | Créer les comptes Admin, Tuteur et Oustaz ; inscrire un élève ; rattacher un ou plusieurs tuteurs ; créer une Halaqa et y affecter un Oustaz et des élèves inscrits. |
| Tuteur | Se connecter avec son téléphone ; après changement obligatoire du mot de passe, consulter uniquement les élèves qui lui sont rattachés. Ne crée pas de comptes. |
| Oustaz | Se connecter avec son téléphone ; après changement obligatoire du mot de passe, consulter les classes auxquelles il est affecté. Ne crée pas de comptes. |
| Élève | Dossier métier inscrit au Daara ; aucun identifiant ni accès à la plateforme. |

### US-01 — Créer un compte utilisateur (Priorité P1)

**En tant qu'Administrateur**, je veux créer un compte pour un Admin, un Tuteur ou un Oustaz, afin de donner à la personne un accès à la plateforme avec les droits correspondant à son rôle.

**Pourquoi P1** : la création des comptes est le prérequis à l'accès aux fonctions du Daara.

**Test indépendant** : un Admin crée un compte avec un téléphone unique ; le nouveau titulaire peut se connecter avec ce téléphone et le mot de passe temporaire puis doit le remplacer avant tout accès normal.

**Critères d'acceptation**

1. **Étant donné** un utilisateur authentifié dont le rôle est Admin, **quand** il soumet les informations requises d'un compte et un rôle autorisé (`admin`, `tuteur` ou `oustaz`), **alors** le compte est créé et son mot de passe initial est `passer`.
2. **Étant donné** un utilisateur non Admin, **quand** il tente de créer un compte, **alors** le serveur refuse l'opération avec `403` et aucun compte n'est créé.
3. **Étant donné** un téléphone déjà utilisé par un compte, **quand** l'Admin soumet ce téléphone, **alors** la création est refusée avec une erreur de validation `422` et le compte existant reste inchangé.
4. **Étant donné** une demande contenant un rôle non autorisé ou un rôle envoyé par un utilisateur sans privilège Admin, **quand** le serveur la traite, **alors** il refuse la demande et n'accorde jamais de privilège à partir d'une valeur client non autorisée.
5. **Étant donné** un nouveau compte, **quand** il est créé, **alors** `must_change_password` vaut `true` et le mot de passe n'est jamais renvoyé dans la réponse ni enregistré en clair.

### US-02 — Inscrire un élève et le rattacher à un tuteur (Priorité P1)

**En tant qu'Administrateur**, je veux créer le dossier d'un élève et le rattacher à au moins un Tuteur, afin d'enregistrer officiellement son inscription au Daara et de permettre à son responsable légal de le suivre.

**Pourquoi P1** : l'inscription constitue la source métier des élèves pouvant ensuite être affectés aux Halaqat.

**Test indépendant** : l'Admin inscrit un élève avec un Tuteur existant ou en faisant créer son compte ; l'élève reçoit un matricule unique, est inscrit officiellement et n'a pas de compte.

**Critères d'acceptation**

1. **Étant donné** un Admin et un Tuteur existant, **quand** l'Admin crée un élève et fournit le Tuteur, **alors** le dossier élève, l'inscription officielle et le rattachement sont enregistrés dans une même transaction.
2. **Étant donné** un Admin et un nouveau responsable légal, **quand** l'Admin soumet le dossier de l'élève et les informations de compte du Tuteur, **alors** le système crée son compte Tuteur avec téléphone comme identifiant, mot de passe temporaire `passer`, `must_change_password=true`, et rattache l'élève au compte nouvellement créé.
3. **Étant donné** une demande d'inscription sans Tuteur, **quand** elle est soumise, **alors** elle est refusée avec `422` et ni le dossier ni l'inscription ne sont créés.
4. **Étant donné** un matricule généré lors de l'inscription, **quand** plusieurs inscriptions sont créées simultanément, **alors** chaque élève reçoit un matricule distinct et la transaction ne produit aucun doublon.
5. **Étant donné** un élève inscrit, **quand** ses informations de compte sont consultées, **alors** aucun compte utilisateur, téléphone de connexion ou mot de passe n'existe pour lui.
6. **Étant donné** un Tuteur déjà rattaché à un élève, **quand** l'Admin rattache un autre élève à ce même Tuteur, **alors** le même compte Tuteur est conservé et le nouveau lien est ajouté sans doublon.
7. **Étant donné** un téléphone de Tuteur déjà associé à un compte, **quand** l'Admin choisit la création d'un nouveau compte Tuteur avec ce téléphone, **alors** le système refuse la demande ; l'Admin doit rattacher le compte existant plutôt que créer un doublon.
8. **Étant donné** une erreur pendant la création ou le rattachement, **quand** la transaction échoue, **alors** aucune création partielle de compte, d'élève ou d'inscription n'est conservée.

### US-03 — Se connecter et remplacer le mot de passe initial (Priorité P1)

**En tant que titulaire d'un compte**, je veux me connecter avec mon téléphone et remplacer obligatoirement le mot de passe temporaire lors de ma première connexion, afin de protéger mon accès personnel.

**Pourquoi P1** : un compte avec un mot de passe partagé ne doit jamais ouvrir directement les fonctions normales.

**Test indépendant** : le titulaire saisit son téléphone et `passer`, reçoit uniquement un accès restreint au changement de mot de passe et ne peut consulter aucune autre ressource avant la réussite du changement.

**Critères d'acceptation**

1. **Étant donné** un compte actif avec `must_change_password=true` et le mot de passe initial `passer`, **quand** son titulaire soumet son téléphone et ce mot de passe, **alors** l'authentification réussit mais la réponse demande le changement de mot de passe et fournit uniquement un jeton à portée restreinte.
2. **Étant donné** une première connexion reconnue, **quand** le client traite la réponse, **alors** l'utilisateur est redirigé vers le formulaire de changement de mot de passe et ne peut pas accéder à l'accueil ni aux API métier.
3. **Étant donné** un jeton restreint de changement de mot de passe, **quand** son titulaire tente d'appeler une autre API protégée, **alors** le serveur répond `403` sans divulguer de données.
4. **Étant donné** un mot de passe nouveau valide et sa confirmation identique, **quand** l'utilisateur les soumet, **alors** le système stocke uniquement le hash, passe `must_change_password` à `false`, invalide le jeton temporaire et permet à l'utilisateur de se reconnecter normalement.
5. **Étant donné** un nouveau mot de passe invalide ou des confirmations différentes, **quand** l'utilisateur soumet le formulaire, **alors** la modification est refusée avec `422`, le mot de passe et le flag restent inchangés et l'accès demeure restreint.
6. **Étant donné** un compte inactif ou des identifiants incorrects, **quand** l'utilisateur tente de se connecter, **alors** aucune session normale ni aucun jeton d'accès métier n'est délivré.
7. **Étant donné** un compte dont le flag impose le changement, même si son mot de passe a été modifié par une opération d'administration, **quand** il se connecte, **alors** le flag prévaut et le changement reste obligatoire.

### US-04 — Créer une Halaqa et affecter ses élèves (Priorité P1)

**En tant qu'Administrateur**, je veux créer une Classe (Halaqa), lui affecter un Oustaz et y inscrire des élèves déjà inscrits au Daara, afin d'organiser leur enseignement.

**Pourquoi P1** : les classes matérialisent l'organisation pédagogique après l'inscription officielle.

**Test indépendant** : l'Admin crée une Halaqa avec un Oustaz actif et un ensemble d'élèves admissibles ; les inscriptions de ces élèves sont affectées à cette classe.

**Critères d'acceptation**

1. **Étant donné** un Admin et un Oustaz actif, **quand** l'Admin crée une classe avec les informations obligatoires et cet Oustaz, **alors** la classe est créée et l'affectation de l'Oustaz est persistée.
2. **Étant donné** un Oustaz absent, inactif ou ayant un autre rôle, **quand** l'Admin tente de l'affecter, **alors** la demande est refusée avec `422` et aucune classe partielle n'est créée.
3. **Étant donné** une liste d'élèves inscrits au Daara, **quand** l'Admin la soumet à la création de classe, **alors** leurs inscriptions actives sont affectées à la classe dans la même transaction.
4. **Étant donné** un identifiant d'élève inconnu, non inscrit ou une inscription incompatible avec l'année scolaire, **quand** l'Admin demande l'affectation, **alors** la demande est refusée, les détails des éléments invalides sont retournés et aucune affectation partielle n'est conservée.
5. **Étant donné** une inscription déjà affectée à une autre classe pendant la même année scolaire, **quand** l'Admin tente une seconde affectation, **alors** le conflit est signalé ; le transfert éventuel doit passer par une opération explicite de réaffectation auditée.
6. **Étant donné** une classe existante, **quand** un utilisateur non Admin tente de la créer ou d'en modifier les affectations, **alors** l'opération est refusée avec `403`.
7. **Étant donné** une liste d'élèves vide à la création, **quand** la classe est créée, **alors** elle est valide avec zéro élève ; les élèves pourront être affectés ensuite.

### Règles de gestion et validations

| ID | Règle |
|---|---|
| REQ-001 | Seul un compte authentifié de rôle Admin peut créer tout compte utilisateur, tout dossier élève, toute inscription ou classe, ou modifier les affectations de classe. L'autorisation est vérifiée côté serveur sur chaque endpoint. |
| REQ-002 | Les rôles de compte dans le périmètre sont `admin`, `tuteur` et `oustaz`. L'élève est une entité métier et ne constitue jamais un rôle ou un compte de connexion. |
| REQ-003 | Le téléphone est l'identifiant de connexion, obligatoire et unique après normalisation. La normalisation retire les séparateurs d'affichage ; les numéros sont persistés dans un format canonique international E.164 (par défaut sénégalais `+221` si le pays est omis). |
| REQ-004 | Tout compte créé reçoit le mot de passe temporaire `passer`, stocké uniquement sous forme de hash, avec `must_change_password=true`. Le secret temporaire ne figure ni dans les journaux ni dans les réponses API. |
| REQ-005 | Tout utilisateur dont `must_change_password=true` est restreint au parcours de remplacement ; les vérifications reposent sur le flag en base, et non uniquement sur la comparaison au texte `passer`. |
| REQ-006 | Un mot de passe choisi doit comporter au moins 12 caractères, au moins une minuscule, une majuscule, un chiffre et un caractère spécial ; il ne peut pas être égal au mot de passe temporaire. La confirmation doit être identique. |
| REQ-007 | Le matricule d'élève est généré par le serveur au moment de son inscription officielle, non fourni par le client, unique et non réutilisable. Format proposé : `ELV-AAAA-NNNNNN`, compteur séquentiel par année civile. |
| REQ-008 | Une inscription officielle est créée en même temps que le dossier élève. Elle doit référencer au moins un Tuteur. L'absence de Tuteur invalide l'ensemble de la transaction. |
| REQ-009 | La création d'un nouveau compte Tuteur depuis le flux d'inscription est une création de compte faite par l'Admin et suit toutes les règles de compte ; un Tuteur existant est sélectionné par identifiant et téléphone non modifiable dans ce flux. |
| REQ-010 | Une inscription active ne peut être affectée qu'à une seule classe pour une année scolaire donnée. La classe peut être absente au moment de l'inscription et attribuée ultérieurement. |
| REQ-011 | Une classe doit avoir un nom unique par année scolaire et un Oustaz actif. Chaque classe a un seul Oustaz responsable ; un Oustaz peut être responsable de plusieurs classes, sous réserve de règles ultérieures de capacité. |
| REQ-012 | Les créations composées (compte Tuteur, élève, inscription, liens) et (classe, affectations initiales) sont atomiques. Les erreurs de validation ne laissent aucune donnée partielle. |

### Cas limites à tester

- Deux demandes simultanées créent le compte avec le même numéro : une seule réussit grâce à la contrainte de base de données.
- Deux demandes simultanées génèrent le matricule suivant : chaque transaction obtient un identifiant unique.
- La demande contient à la fois un Tuteur existant et des données pour créer un nouveau Tuteur : rejeter la demande comme ambiguë.
- La classe reçoit une liste contenant le même élève deux fois : rejeter les doublons ou les dédupliquer de façon documentée ; recommandation : `422` pour rendre l'erreur explicite.
- Le compte se déconnecte ou perd son jeton pendant le changement obligatoire : il peut recommencer la connexion temporaire ; il ne peut pas appeler les API métier.
- Le Tuteur possède plusieurs élèves : il ne voit que les élèves liés par la table de rattachement.
- Un élève a plusieurs responsables légaux : tous les rattachements sont autorisés ; le rôle payeur/responsable légal peut être renseigné par lien.
- Une inscription ou un compte est désactivé : les références historiques sont conservées ; éviter les suppressions en cascade des données d'inscription.

### Hypothèses fonctionnelles

- Les rôles Oustaz et Tuteur correspondent aux rôles techniques existants `enseignant` et `parent` et seront renommés/migrés.
- L'année scolaire est représentée sous une forme explicite, par exemple `2026-2027`. Elle est distincte de l'année civile incluse dans le matricule.
- Une inscription est officielle dès la création du dossier. L'affectation à une classe peut être faite immédiatement ou ultérieurement.
- La réponse de première connexion peut délivrer un jeton temporaire restreint ; aucune session/jeton normal n'est autorisé avant changement du mot de passe.
- La première inscription d'un élève peut créer un nouveau compte Tuteur ou se rattacher à un compte Tuteur existant. La création d'un compte utilisateur reste toujours une action autorisée de l'Admin.

## PARTIE B — Architecture technique & backend

### Modèle relationnel SQL cible

Exemple PostgreSQL, avec contraintes structurantes. Les champs d'audit usuels `created_at` et `updated_at` sont omis uniquement lorsqu'ils ne sont pas pertinents pour la contrainte illustrée. Les suppressions fonctionnelles doivent préférer une désactivation ou un archivage aux suppressions physiques.

```sql
CREATE TABLE users (
    id                  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    nom                 VARCHAR(120) NOT NULL,
    prenom              VARCHAR(120) NOT NULL,
    telephone           VARCHAR(16) NOT NULL UNIQUE,
    adresse             VARCHAR(255),
    password            VARCHAR(255) NOT NULL, -- hash uniquement
    role                VARCHAR(16) NOT NULL
                            CHECK (role IN ('admin', 'tuteur', 'oustaz')),
    statut              VARCHAR(16) NOT NULL DEFAULT 'actif'
                            CHECK (statut IN ('actif', 'inactif')),
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tuteurs (
    id          BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id     BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
    profession  VARCHAR(120),
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE oustazs (
    id                  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id             BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
    specialite          VARCHAR(120),
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE eleves (
    id                  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    matricule           VARCHAR(24) NOT NULL UNIQUE,
    nom                 VARCHAR(120) NOT NULL,
    prenom              VARCHAR(120) NOT NULL,
    date_naissance      DATE,
    sexe                VARCHAR(16),
    adresse             VARCHAR(255),
    statut              VARCHAR(16) NOT NULL DEFAULT 'actif'
                            CHECK (statut IN ('actif', 'inactif', 'sorti')),
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE eleve_tuteur (
    eleve_id                BIGINT NOT NULL REFERENCES eleves(id) ON DELETE RESTRICT,
    tuteur_id               BIGINT NOT NULL REFERENCES tuteurs(id) ON DELETE RESTRICT,
    lien_parente            VARCHAR(40),
    est_responsable_legal   BOOLEAN NOT NULL DEFAULT FALSE,
    est_payeur              BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (eleve_id, tuteur_id)
);

CREATE TABLE classes (
    id          BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    nom         VARCHAR(120) NOT NULL,
    niveau      VARCHAR(80) NOT NULL,
    annee_scolaire VARCHAR(9) NOT NULL,
    oustaz_id   BIGINT NOT NULL REFERENCES oustazs(id) ON DELETE RESTRICT,
    statut      VARCHAR(16) NOT NULL DEFAULT 'active'
                    CHECK (statut IN ('active', 'inactive')),
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (nom, annee_scolaire)
);

CREATE TABLE inscriptions (
    id                  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    eleve_id            BIGINT NOT NULL REFERENCES eleves(id) ON DELETE RESTRICT,
    classe_id           BIGINT REFERENCES classes(id) ON DELETE RESTRICT,
    annee_scolaire      VARCHAR(9) NOT NULL,
    date_inscription    DATE NOT NULL,
    statut              VARCHAR(16) NOT NULL DEFAULT 'active'
                            CHECK (statut IN ('active', 'suspendue', 'terminee')),
    created_by          BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (eleve_id, annee_scolaire)
);

CREATE TABLE sequences_matricules (
    annee       SMALLINT PRIMARY KEY,
    dernier_numero BIGINT NOT NULL CHECK (dernier_numero >= 0)
);

CREATE TABLE audit_events (
    id              BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    actor_user_id   BIGINT REFERENCES users(id) ON DELETE RESTRICT,
    action          VARCHAR(80) NOT NULL,
    entity_type     VARCHAR(80) NOT NULL,
    entity_id       BIGINT NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Contraintes inter-tables à imposer dans le service transactionnel** : la table `users` ne peut avoir le rôle `tuteur` que si un profil `tuteurs` est créé, et `oustaz` que si un profil `oustazs` est créé ; `admin` n'a aucun de ces profils. De même, toute classe doit référencer le profil d'un Oustaz actif. Chaque inscription officielle doit avoir au moins un lien dans `eleve_tuteur`. Ces contraintes nécessitent des transactions de service et, si l'équipe souhaite les faire respecter au niveau SQL indépendamment de l'application, des triggers différés adaptés au moteur choisi.

**Matricule concurrentiel** : générer et incrémenter la ligne `sequences_matricules` de l'année à l'intérieur de la transaction, en verrouillant cette ligne (`SELECT ... FOR UPDATE`) ; former `ELV-{année}-{numéro sur 6 chiffres}` et s'appuyer sur `UNIQUE(matricule)` comme dernier garde-fou.

**Jetons d'accès** : la table Sanctum `personal_access_tokens` existante reste utilisable. Un jeton de première connexion reçoit seulement l'ability `password:change`, une durée de vie courte et aucune ability métier. Les middlewares d'API vérifient à la fois le rôle et `must_change_password`; les seules routes disponibles à ce stade sont logout et change-password.

### Contrats API REST

Préfixe commun : `/api/v1`. Les endpoints d'administration exigent `auth:sanctum`, rôle `admin` et, lorsque la session n'est pas encore confirmée, `must_change_password=false`.

| Méthode et route | Accès | Résultat |
|---|---|---|
| `POST /auth/login` | Public, limité en débit | Authentifie par téléphone et mot de passe ; renvoie une réponse normale ou le parcours restreint de première connexion. |
| `POST /auth/change-password` | Jeton limité `password:change` ou session authentifiée avec flag vrai | Valide et enregistre le nouveau mot de passe ; efface le flag et invalide les jetons temporaires. |
| `POST /admin/users` | Admin uniquement | Crée un compte `admin`, `tuteur` ou `oustaz` et son profil correspondant. |
| `POST /eleves` | Admin uniquement | Crée le dossier, génère son matricule, crée l'inscription officielle et lie au moins un compte Tuteur existant ou nouvellement créé dans la même transaction. |
| `GET /tuteur/me/eleves` | Tuteur authentifié, flag faux | Liste uniquement les élèves rattachés au compte courant. |
| `POST /classes` | Admin uniquement | Crée une classe avec Oustaz et, facultativement, des inscriptions d'élèves à affecter. |
| `PUT /classes/{classeId}/inscriptions` | Admin uniquement | Remplace ou met à jour les affectations d'inscriptions ; valide leur inscription et l'année scolaire ; transaction atomique. |
| `GET /oustaz/me/classes` | Oustaz authentifié, flag faux | Liste uniquement ses classes. |

**Codes de réponse communs**

- `201 Created` : compte, inscription ou classe créé.
- `200 OK` : connexion réussie ou changement réussi si réponse avec corps.
- `204 No Content` : changement de mot de passe achevé ; le client renvoie ensuite vers la connexion normale.
- `401 Unauthorized` : téléphone/mot de passe invalides ou absence de jeton.
- `403 Forbidden` : rôle insuffisant, compte inactif, ou appel métier alors que le mot de passe doit encore être changé.
- `409 Conflict` : conflit métier concurrentiel qui ne relève pas d'une erreur de champ (ex. affectation simultanée).
- `422 Unprocessable Entity` : validation de champ, rôle, téléphone, tuteur, classe ou élève invalide.

### Exemple 1 — Inscription d'un élève et création/rattachement d'un compte Tuteur

**Requête** — `POST /api/v1/eleves` avec jeton Admin normal :

```json
{
  "eleve": {
    "nom": "DIOP",
    "prenom": "Aminata",
    "date_naissance": "2017-04-12",
    "sexe": "F",
    "adresse": "Dakar"
  },
  "inscription": {
    "annee_scolaire": "2026-2027",
    "date_inscription": "2026-10-01"
  },
  "tuteurs": [
    {
      "mode": "creer",
      "lien_parente": "mere",
      "est_responsable_legal": true,
      "est_payeur": true,
      "compte": {
        "nom": "DIOP",
        "prenom": "Fatou",
        "telephone": "+221771234567",
        "adresse": "Dakar"
      }
    }
  ]
}
```

Pour un Tuteur existant, remplacer l'objet par `{"mode":"existant","tuteur_id":42,"lien_parente":"pere","est_responsable_legal":true,"est_payeur":false}`. Le corps n'accepte pas de rôle ni de mot de passe fournis par le client.

**Réponse** — `201 Created` :

```json
{
  "message": "Inscription de l’élève créée.",
  "data": {
    "eleve": {
      "id": 518,
      "matricule": "ELV-2026-000518",
      "nom": "DIOP",
      "prenom": "Aminata",
      "statut": "actif",
      "a_un_compte": false
    },
    "inscription": {
      "id": 902,
      "annee_scolaire": "2026-2027",
      "date_inscription": "2026-10-01",
      "statut": "active",
      "classe_id": null
    },
    "tuteurs": [
      {
        "id": 42,
        "user_id": 311,
        "nom": "DIOP",
        "prenom": "Fatou",
        "telephone": "+221771234567",
        "compte_cree": true,
        "must_change_password": true,
        "lien_parente": "mere",
        "est_responsable_legal": true,
        "est_payeur": true
      }
    ]
  }
}
```

La réponse ne contient jamais le mot de passe initial. L'Admin le communique au titulaire par un canal contrôlé, en dehors des journaux et de la réponse API.

### Exemple 2 — Première authentification avec `passer`

**Requête** — `POST /api/v1/auth/login` :

```json
{
  "telephone": "+221771234567",
  "password": "passer"
}
```

**Réponse** — `200 OK`, jeton limité utilisable uniquement pour le changement de mot de passe :

```json
{
  "message": "Changement de mot de passe obligatoire.",
  "token": "temporary-sanctum-token",
  "token_type": "Bearer",
  "must_change_password": true,
  "next_action": "change_password",
  "user": {
    "id": 311,
    "nom": "DIOP",
    "prenom": "Fatou",
    "telephone": "+221771234567",
    "role": "tuteur"
  }
}
```

Le token de démonstration ci-dessus est fictif. En production, la réponse n'inclut aucun token métier à portée complète.

**Changement** — `POST /api/v1/auth/change-password` avec `Authorization: Bearer <token-temporaire>` :

```json
{
  "new_password": "Daara!Secure2026",
  "new_password_confirmation": "Daara!Secure2026"
}
```

**Réponse** — `204 No Content`. Le token temporaire est révoqué, `must_change_password` devient `false` et le client ramène l'utilisateur au formulaire de connexion normale.

### Exemple 3 — Création d'une Classe avec affectation d'élèves inscrits

**Requête** — `POST /api/v1/classes` avec jeton Admin normal :

```json
{
  "nom": "Halaqa Al-Falah",
  "niveau": "Intermédiaire",
  "annee_scolaire": "2026-2027",
  "oustaz_id": 27,
  "inscription_ids": [902, 903, 904]
}
```

**Réponse** — `201 Created` :

```json
{
  "message": "Classe créée et élèves affectés.",
  "data": {
    "id": 73,
    "nom": "Halaqa Al-Falah",
    "niveau": "Intermédiaire",
    "annee_scolaire": "2026-2027",
    "oustaz": {
      "id": 27,
      "nom": "NDIAYE",
      "prenom": "Moussa",
      "telephone": "+221781234567"
    },
    "effectif": 3,
    "eleves": [
      {"inscription_id": 902, "eleve_id": 518, "matricule": "ELV-2026-000518", "nom_complet": "Aminata DIOP"},
      {"inscription_id": 903, "eleve_id": 519, "matricule": "ELV-2026-000519", "nom_complet": "Ibrahima SARR"},
      {"inscription_id": 904, "eleve_id": 520, "matricule": "ELV-2026-000520", "nom_complet": "Mariama BA"}
    ]
  }
}
```

Si une seule inscription fournie est invalide, l'API répond `422` et la classe ainsi que les affectations de la demande sont annulées.

### Sécurité et intégrité

- Appliquer l'autorisation Admin côté serveur à chaque route ; masquer les boutons côté client n'est pas une protection.
- Ajouter un middleware `must_change_password` qui refuse toutes les routes métier avant le changement ; n'autoriser que le changement de mot de passe et la déconnexion avec le jeton temporaire.
- Appliquer un throttling au login et journaliser les événements de création, rattachement, affectation, échec d'autorisation et changement de mot de passe sans jamais journaliser de secrets.
- Les réponses publiques ne révèlent ni le hash, ni le mot de passe temporaire, ni un token d'accès normal en cas de première connexion.
- Valider les ressources liées dans le périmètre du Daara et appliquer une transaction aux opérations composées.
- Les contrôles d'unicité applicatifs doivent être doublés de contraintes uniques en base pour prévenir les courses concurrentes.
- Utiliser des messages de validation français cohérents ; ne pas différencier publiquement un téléphone inexistant d'un mot de passe incorrect à l'authentification.

### Impacts de migration sur le backend actuel

1. Remplacer les rôles métier `parent` / `enseignant` / `eleve` par les valeurs cibles `tuteur` / `oustaz` ; conserver `admin`. Migrer les données existantes et traiter les comptes Élève existants comme des dossiers `eleves`, sans leur conserver un compte de connexion.
2. Ajouter `must_change_password` à `users` et activer sa valeur pour tout compte provisionné avec `passer`. Les comptes déjà existants ne doivent pas être bloqués sans décision de migration explicite.
3. Déplacer les données de dossier actuellement contenues dans `users` (dont le matricule et les informations personnelles) vers `eleves` ; conserver les données d'accès uniquement pour les rôles autorisés.
4. Ajouter les profils `tuteurs` et `oustazs`, la relation many-to-many `eleve_tuteur`, le lien Oustaz sur les classes, l'année scolaire, les séquences de matricules et le rattachement de classe à `inscriptions`.
5. Modifier `inscriptions.eleve_id`, actuellement une référence à `users`, pour référencer `eleves`; rendre `classe_id` nullable à la création officielle et prévoir une unicité d'inscription par élève et année scolaire.
6. Retirer `effectif` comme source de vérité si cette valeur est stockée dans `classes_academiques` : l'effectif se calcule à partir des inscriptions actives afin d'éviter les écarts. Une valeur calculée ou un cache devra rester non canonique.
7. Adapter ressources, factories, seeders, policies, tests et contrat Postman à la séparation des entités et au verrou de première connexion.

### Critères de succès mesurables

- **SC-001** : 100 % des tentatives de création de compte par un non-Admin sont rejetées sans persistance.
- **SC-002** : 100 % des élèves inscrits ont au moins un Tuteur lié et un matricule unique ; 0 élève dispose d'un compte de connexion.
- **SC-003** : 100 % des comptes créés exigent le remplacement du mot de passe avant tout accès aux fonctions métier.
- **SC-004** : 100 % des inscriptions affectées à une Halaqa appartiennent à l'année scolaire de cette classe et ne sont affectées qu'à une seule classe active.
- **SC-005** : Toute opération composée échouée ne laisse aucune création partielle ; ce comportement est vérifié par tests d'intégration sur les échecs de validation et de persistance.

## Liste de contrôle qualité

- [x] Les deux étapes fonctionnelles demandées sont délimitées.
- [x] Les user stories suivent le format « En tant que… je veux… afin de… » et sont priorisées.
- [x] Les critères d'acceptation utilisent Given / When / Then (Étant donné / quand / alors).
- [x] Les permissions, règles métier, validations, relations, unicités et réponses API sont testables.
- [x] Le modèle distingue le compte du Tuteur du dossier de l'Élève.
- [x] Le flux de première connexion ne délivre qu'un jeton à portée restreinte.
- [x] Les exemples de requête et réponse couvrent les trois scénarios demandés.
- [x] Les écarts avec l'authentification et les tables actuellement présentes sont consignés.
