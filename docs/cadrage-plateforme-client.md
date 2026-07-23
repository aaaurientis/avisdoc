# Cadrage — Plateforme client AvisDoc

> Statut : **brouillon à valider** · Version 0.1 · 2026-07-23
> Portée : `admin.avisdoc.fr` (backoffice, à construire), `client.avisdoc.fr` (espace client, à construire),
> backend Supabase commun, service de génération documentaire (Scaleway).
>
> Ce document fige les décisions avant tout développement. Il ne code rien.
> Les points encore ouverts sont regroupés en fin de document (§10).

---

## 1. Objectif

Industrialiser la mise à disposition des supports de campagne AvisDoc pour les entreprises clientes :

1. **Ouvrir un espace client automatiquement** dès qu'une affaire passe au statut CRM **« Signé »**.
2. **Générer automatiquement** les documents de la campagne **en y incrustant le logo du client**.
3. **Donner accès** aux collaborateurs du client (adresses `@domaine.fr` déclarées) via un **lien de connexion**.

Le tout en respectant strictement les contraintes médicales, juridiques et de charte du pack documentaire
(voir `BRIEF-CLAUDE-CODE.md` et `GUIDE-CLAUDE-CODE.md` fournis avec le pack).

---

## 2. Périmètre

### Dans le périmètre
- Backoffice **admin** : CRM (dont statut « Signé »), gestion des espaces clients, upload du logo, déclaration des domaines/utilisateurs.
- Espace **client** : bibliothèque filtrable, aperçu en ligne, e-mails copiables, téléchargement des documents logotés.
- **Backend Supabase commun** aux deux frontends (Auth, Postgres, Storage, RLS).
- **Service de génération** conteneurisé qui exécute le pack (`build.py`) et alimente le Storage.

### Hors périmètre (explicitement)
- Les documents de niveau **`hds`** (comptes-rendus de téléexpertise, lettres d'adressage). Ils **ne transitent jamais**
  par cette plateforme : ils vivent sur la plateforme de téléexpertise certifiée hébergeur de données de santé.
  Toute demande de les exposer ici doit être **refusée et remontée** (brief §4.1, §Livrable 2).
- La refonte du site vitrine existant (ce dépôt) — il reste tel quel ; la plateforme est un ajout.

---

## 3. Architecture cible

```
        admin.avisdoc.fr                    client.avisdoc.fr
        (React/Vite — à construire)         (React/Vite — à construire)
        CRM · espaces · upload logo         bibliothèque · aperçu · e-mails
                    \                              /
                     \                            /
                      ▼                          ▼
              ┌──────────────────────────────────────┐
              │              SUPABASE                  │
              │  Auth  — magic link restreint domaine  │
              │  Postgres — clients, espaces, docs,    │
              │             jobs, utilisateurs         │
              │  Storage — logos + documents générés   │
              │  RLS   — cloison public/client/hds     │
              └───────────────┬────────────────────────┘
                              │ job « générer » (statut CRM = Signé, ou logo mis à jour)
                              ▼
              ┌──────────────────────────────────────┐
              │   SERVICE DE GÉNÉRATION (Docker)       │
              │   Scaleway Serverless Containers (FR)  │
              │   Python (weasyprint, python-pptx,     │
              │   pdfplumber) + Node (pptxgenjs)       │
              │   + polices = le pack + build.py       │
              └──────────────────────────────────────┘
```

**Principe directeur :** un **backend unique**. Les deux frontends ne sont que des vues du même Postgres/Storage,
cloisonnées par RLS. Aucune synchronisation entre deux bases : il n'y en a qu'une.

---

## 4. Modèle de données (Postgres / Supabase)

Esquisse à affiner à l'implémentation. Les noms sont indicatifs.

### `clients`
L'entreprise cliente.

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `nom` | text | « ACME » — sert de suffixe à `build.py client` |
| `statut_crm` | text | `prospect` / `en_cours` / **`signe`** / `clos` |
| `signe_le` | timestamptz | horodatage du passage à « Signé » (déclencheur) |
| `logo_path` | text | chemin Storage du logo téléversé |
| `logo_sha256` | text | empreinte du logo → clé de cache de génération |
| `cree_le`, `maj_le` | timestamptz | |

### `domaines`
Les domaines e-mail autorisés pour un client (un client peut en avoir plusieurs).

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `client_id` | uuid FK → clients | |
| `domaine` | text | ex. `acme.fr` (sans `@`) |

### `utilisateurs_client`
Lien entre un compte Auth Supabase et un client. Alimenté à l'invitation.

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `client_id` | uuid FK → clients | |
| `auth_user_id` | uuid FK → auth.users | |
| `email` | text | doit correspondre à un `domaines.domaine` du client |
| `role` | text | `membre` / `referent` (à préciser §10) |
| `invite_le`, `premiere_connexion_le` | timestamptz | |

### `documents`
Une ligne par document **généré** pour un client (déclinaison logotée + millésime).

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `client_id` | uuid FK → clients | |
| `doc_catalogue_id` | text | `affiche-1`, `kit-collaborateur`… (= `id` du CATALOGUE `build.py`) |
| `acces` | text | `public` / `client` / `hds` (recopié du catalogue, jamais saisi à la main) |
| `logo_client` | bool | recopié du catalogue — **source de vérité, non éditable en UI** |
| `phase` | text | `cadrage`…`bilan` |
| `format` | text | `A2` / `A4` / `16:9` |
| `version` | text | millésime en pied de page (ex. `2026.1`) |
| `storage_path` | text | fichier généré dans Storage |
| `logo_sha256` | text | empreinte du logo ayant servi → cache |
| `genere_le` | timestamptz | |

> **Note `hds` :** on peut choisir de **ne jamais créer** de ligne `documents` de niveau `hds` sur cette base
> (option la plus sûre, cf. §7). À trancher §10.

### `generation_jobs`
File de travail du service de génération.

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `client_id` | uuid FK → clients | |
| `type` | text | `creation_espace` / `maj_logo` |
| `statut` | text | `en_attente` / `en_cours` / `termine` / `echec` |
| `logo_sha256` | text | pour l'idempotence / le cache |
| `erreur` | text | message si `echec` (ex. anomalie logo, cf. §6) |
| `cree_le`, `demarre_le`, `fini_le` | timestamptz | |

---

## 5. Flux fonctionnels

### 5.1 Création d'un espace (« Signé » → documents → liens)
1. Dans l'admin, le statut CRM d'un client passe à **« Signé »**.
2. Un **trigger Postgres** (ou webhook Supabase) crée un `generation_jobs` de type `creation_espace`.
3. Le **service de génération** prend le job : récupère le logo depuis Storage, exécute
   `build.py client <NOM> --logo <logo>`.
4. Il téléverse les **9 documents logotés** dans Storage, insère les lignes `documents` correspondantes
   (avec `version`/millésime), marque le job `termine`.
5. Les collaborateurs des `domaines` déclarés reçoivent un **magic link** (voir 5.4).

> Ouverture 100 % automatique **ou** validation admin avant envoi des liens ? → §10. Par défaut proposé :
> génération auto au passage « Signé », **envoi des liens déclenché par un clic admin** (garde-fou humain).

### 5.2 Upload / mise à jour du logo (admin)
- L'admin téléverse le logo une fois. On calcule `logo_sha256`.
- **Validations avant génération** (brief §Validation / guide §3.2) :
  - fond transparent (sinon carré blanc sur le crème) ;
  - hauteur ≥ 200 px (sinon impression A2 floue) ;
  - après génération, contrôle qu'aucun texte ne chevauche le logo (`build.py controles`).
- Une mise à jour de logo crée un job `maj_logo` et **régénère uniquement** les documents concernés.

### 5.3 Bibliothèque & aperçu (client)
- Bibliothèque **filtrable** par niveau d'accès, **phase** (`cadrage`…`bilan`) et **format**.
- **Aperçu PDF en ligne** en lecture seule, sans téléchargement préalable.
- Pas de **traceur analytique** sur les pages servant des documents (brief §À ne pas faire).

### 5.4 Connexion des collaborateurs
- **Magic link Supabase Auth**, restreint : l'e-mail doit appartenir à un `domaines.domaine` du client.
  Un e-mail hors domaine déclaré est refusé.
- Expiration / renouvellement des liens → §10.

### 5.5 E-mails de campagne
- **Ne sont pas des PDF.** Servis depuis `scripts/gabarits/emails.json` : objet + corps en texte,
  champs `{{date}}`, `{{lieu}}`, `{{lien}}`, `{{entreprise}}` substitués **côté client** via un petit
  formulaire, avec un bouton **« copier »**. Le PDF n'est qu'une vue imprimable du même JSON.
- 12 e-mails, 3 séquences, 4 options chacune.

### 5.6 Versionnage
- Chaque document porte son **millésime en pied de page**. On **conserve l'historique** : un client qui a
  imprimé 200 affiches doit pouvoir retrouver sa version exacte. On ne supprime pas les anciennes versions.

---

## 6. Service de génération (contrat)

- **Techno :** image Docker embarquant le pack complet (`build.py`, `scripts/`, `assets/`, polices),
  Python (weasyprint + libs système Cairo/Pango, python-pptx, pdfplumber, pillow, defusedxml/lxml) et
  Node (pptxgenjs). Vérifié en local : `build.py controles` → **« 15/15 · Aucun défaut détecté »**.
- **Hébergement :** **Scaleway Serverless Containers** (FR/EU), `scale-to-zero`.
- **Entrée d'un job :** `client_id`, `nom`, `logo` (depuis Storage), `type`.
- **Sortie :** documents téléversés dans Storage + lignes `documents` + statut du job.
- **Idempotence / cache :** clé `(doc_catalogue_id, logo_sha256)`. Si déjà généré, on **saute** — jamais de
  régénération à l'affichage (brief §À ne pas faire).
- **Interdits :**
  - ne pas réécrire les PDF côté serveur pour y coller un logo → **toujours passer par les générateurs**
    (sinon perte des polices embarquées, du fond perdu 3 mm et des traits de coupe des affiches) ;
  - ne pas exposer `scripts/gabarits/` ni `documents/_sources/` (polices base64, fichiers lourds).

---

## 7. Sécurité, accès et conformité

- **Trois niveaux d'accès** (= colonne `documents.acces`, recopiée du CATALOGUE, jamais saisie) :

  | Niveau | Contenu | Accès |
  |---|---|---|
  | `public` | affiches, kit collaborateur, notice d'information | lien direct, sans auth |
  | `client` | mode d'emploi RH, recueil e-mails, formulaire à imprimer, correspondants | espace client authentifié |
  | `hds` | comptes-rendus, lettres d'adressage | **jamais sur cette plateforme** |

- **RLS Postgres** : un utilisateur client ne voit que les `documents` de **son** `client_id` et de niveau
  `public`/`client`. Aucune ligne `hds` n'est jamais servie ; option retenue par défaut : **ne pas créer**
  de ligne `hds` sur cette base du tout (défense en profondeur).
- **Garde-fou logo (9/15)** : le logo employeur ne va **jamais** sur un document médical ou juridique
  (comptes-rendus, lettre, notice, formulaire, recueil e-mails). Le champ `logo_client` du catalogue tranche.
  **Pas de case « appliquer partout »** dans l'UI, pas d'écrasement de ce champ.
- **Textes de consentement non modifiables** : la mise en page se régénère, le texte juridique **jamais**
  (aucune reformulation, mention retirée ou durée de conservation changée). Toute demande en ce sens : refuser.
- **Charte / accessibilité** : cyan (#0CA6DF) et orange (#EC7735) donnent < 3:1 sur crème → **interdits pour du
  texte sur fond crème**, réservés aux fonds sombres/logos/éléments graphiques. Même règle dans les UI qu'on crée.
- **Pas d'analytics** sur les pages de documents.

---

## 8. Anomalies connues du pack (à remonter, pas à corriger en silence)

Reprises du brief §Anomalies / guide §6, à traiter côté métier / plateforme HDS, pas dans cette plateforme :

1. **Résolution des affiches** : 4 photos sur 5 à 1024×1536 (~62 dpi en A2, il en faut 150–300). HD à récupérer,
   ou descendre en A3/A4.
2. **Faute planche ABCDE** : l'image porte « BORDS IRRÉGULIÉS ». Gravé dans le fichier → planche à refaire.
3. **Modèle de données CR** : un seul champ « Avis » / « Recommandation » pour tout le dossier multi-zones → ambigu.
   À rattacher à la zone, côté plateforme de téléexpertise.
4. **Doublon de schéma** : « Antécédents de cancers cutanés connus » vs « … cutanés » se contredisent.
5. **Signature électronique** : cadre « signature à apposer » sur CR et lettre → générée à la clôture du dossier
   côté plateforme HDS ; **ne jamais recopier** une image de signature d'un document antérieur.

---

## 9. Plan de livraison proposé (par lots)

1. **Lot 0 — Socle** : projet Supabase, schéma Postgres + RLS, buckets Storage, squelettes des deux frontends.
2. **Lot 1 — Service de génération** : image Docker + déploiement Scaleway, exécution `build.py client`,
   écriture Storage + `documents`, cache par empreinte logo.
3. **Lot 2 — Admin** : CRM minimal (statut « Signé »), upload + validation logo, déclaration domaines,
   déclenchement génération, envoi des invitations.
4. **Lot 3 — Client** : magic link par domaine, bibliothèque filtrable, aperçu PDF, e-mails copiables, versionnage.
5. **Lot 4 — Durcissement** : contrôles d'accès (tests que `hds` est injoignable même par URL directe),
   recette complète du brief (§Critères de recette).

---

## 10. Points ouverts (à trancher avec Arthur)

1. **Ouverture de l'espace** : 100 % auto au passage « Signé », ou génération auto **puis** validation admin
   avant l'envoi des magic links ? (proposé : validation admin avant envoi.)
2. **Rôles dans l'admin** : qui peut changer un statut CRM, uploader un logo, envoyer les invitations ?
   (super-admin AvisDoc uniquement, ou plusieurs niveaux ?)
3. **Rôles côté client** : simple `membre`, ou un `referent` RH avec des droits en plus ?
4. **Lignes `hds`** : confirmer qu'on ne les matérialise **pas du tout** sur cette base (recommandé).
5. **Magic links** : durée de validité, renouvellement, révocation quand un collaborateur quitte l'entreprise.
6. **Multi-campagnes** : un client peut-il avoir plusieurs campagnes/journées dans le temps (donc plusieurs
   millésimes de documents actifs) ? Impact sur le modèle `documents`.
7. **Notifications** : e-mail d'invitation seul, ou aussi notifications à l'admin quand une génération échoue ?
8. **CRM** : périmètre attendu du CRM dans l'admin (pipeline complet vs simple champ « statut » ?).
9. **Facturation / suivi** : hors périmètre pour l'instant, à confirmer.

---

*Prochaine étape : validation de cette note, arbitrage du §10, puis démarrage du Lot 0.*
