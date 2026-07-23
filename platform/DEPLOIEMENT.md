# Déploiement — plateforme client AvisDoc

Runbook, à dérouler **dans l'ordre**. Chaque étape est autonome et vérifiable.
Projet Supabase : `wtovhzxymlqnfxyjxrdq`.

---

## Étape 0 — Prérequis et secrets

À récupérer / installer avant de commencer :

- **Clés Supabase** (Project Settings > API) :
  - `anon` (publique) → pour les frontends ;
  - `service_role` (**secrète**) → pour le service de génération et l'Edge Function.
- **Compte Scaleway** (console web).
- **Un secret webhook** que tu inventes (chaîne aléatoire), noté `WEBHOOK_SECRET`.

> Ce runbook est écrit pour **sans psql** (migrations via le SQL Editor) et
> **sans Docker local** (l'image est construite par GitHub Actions). La chaîne
> de connexion Postgres n'est donc pas nécessaire.

Valeurs à garder sous la main (ne rien committer) :

```
SUPABASE_URL              = https://wtovhzxymlqnfxyjxrdq.supabase.co
SUPABASE_SERVICE_ROLE_KEY = …   (secret)
SUPABASE_ANON_KEY         = …   (public)
WEBHOOK_SECRET            = …   (invente une chaîne aléatoire, ex. via `openssl rand -hex 24`)
```

---

## Étape 1 — Base de données (migrations, via le SQL Editor)

Crée les tables, la RLS, les buckets Storage et les triggers.

1. Ouvre **Supabase > SQL Editor > New query**.
2. Copie **tout** le contenu de `platform/supabase/all-migrations.sql` (les 4
   migrations concaténées dans l'ordre) et colle-le.
3. Clique **Run**. Aucune erreur attendue.

Vérification (nouvelle requête) :

```sql
-- Doit lister les 6 tables :
select table_name from information_schema.tables
  where table_schema = 'public'
    and table_name in ('admins','clients','domaines','utilisateurs_client',
                       'documents','generation_jobs')
  order by 1;
-- Doit lister 3 buckets (logos, documents-public, documents-client) :
select id, public from storage.buckets order by id;
```

> Avec psql, l'alternative est `./apply-migrations.sh` (voir en-tête du script).

---

## Étape 2 — Premier administrateur

1. Ouvre `admin.avisdoc.fr` (ou en local `npm run dev` dans `platform/admin`),
   connecte-toi par lien magique avec ton adresse `@avisdoc.fr`. Tu verras
   « Accès réservé » : c'est attendu, la ligne `auth.users` est créée.
2. Dans le SQL Editor Supabase, exécute `platform/supabase/seed-admin.sql`
   après y avoir mis ton adresse.
3. Recharge l'admin : tu as maintenant accès.

---

## Étape 3 — Auth (SMTP + URLs de redirection)

Dans Supabase > Authentication :

- **URL Configuration** :
  - *Site URL* : `https://client.avisdoc.fr`
  - *Redirect URLs* (allow-list) : ajoute
    `https://admin.avisdoc.fr/**` et `https://client.avisdoc.fr/**`
    (et tes URLs locales si tu testes : `http://localhost:8090/**`, `:8091/**`).
- **SMTP** : configure un serveur d'envoi (OVH / Google Workspace) pour que les
  liens magiques et les invitations partent réellement. Sans SMTP, l'envoi de
  masse est bridé par Supabase.

---

## Étape 4 — Service de génération (image via GitHub Actions + conteneur Scaleway)

Sans Docker local : **GitHub Actions construit l'image et la pousse** vers le
registre Scaleway ; on crée ensuite le conteneur dans la console Scaleway.

### 4.1 — Registre Scaleway

Console Scaleway > **Container Registry** > créer un *namespace* `avisdoc`
(région `fr-par`), en visibilité **privée**. L'image cible sera
`rg.fr-par.scw.cloud/avisdoc/generation`.

### 4.2 — Clé d'API Scaleway → secret GitHub

- Scaleway > **IAM > API Keys** : crée une clé, note la *Secret Key*.
- GitHub (dépôt) > **Settings > Secrets and variables > Actions** :
  - *New repository secret* : `SCW_SECRET_KEY` = la Secret Key.
  - (facultatif, si tu changes de région/namespace : *Variables*
    `SCW_REGION`, `SCW_REGISTRY_NAMESPACE`.)

### 4.3 — Lancer le build

GitHub > onglet **Actions** > workflow *« Image du service de génération »* >
**Run workflow**. Il build et pousse `…/generation:latest`. (Il se relance
aussi automatiquement à chaque modification de `platform/generation-service/`.)

### 4.4 — Créer le conteneur serverless

Console Scaleway > **Serverless > Containers** > *Deploy a container* :

- *Registry image* : `rg.fr-par.scw.cloud/avisdoc/generation:latest`
- *Port* : `8080`
- *Scale* : min **0**, max **1** ; *Memory* **2048 Mo** ; *Timeout* **300 s**
- *Environment variables* :
  - `SUPABASE_URL` = `https://wtovhzxymlqnfxyjxrdq.supabase.co`
- *Secret environment variables* :
  - `SUPABASE_SERVICE_ROLE_KEY` = … (clé service_role)
  - `WEBHOOK_SECRET` = … (celui de l'étape 0)

Déploie, récupère l'**URL publique** du conteneur et teste dans un navigateur
ou :

```
GET https://<URL_CONTENEUR>/health   ->  {"ok":true}
```

---

## Étape 5 — Database Webhook (déclencheur)

Relie l'insertion d'un job à l'appel du conteneur.

Supabase > Database > **Webhooks** > *Create a new hook* :

- *Table* : `generation_jobs`
- *Events* : `Insert`
- *Type* : HTTP Request · `POST`
- *URL* : `https://<URL_CONTENEUR>/generate`
- *HTTP Headers* :
  - `Content-Type: application/json`
  - `X-Webhook-Secret: <WEBHOOK_SECRET>` (la valeur de l'étape 0)

Test bout-en-bout :

```sql
-- Crée un client, un logo, passe-le à « Signé » depuis l'admin, ou en SQL :
insert into clients (nom, statut_crm) values ('Demo', 'prospect');
-- (téléverser un logo via l'admin puis) passer à 'signe' déclenche un job.
select statut, erreur from generation_jobs order by cree_le desc limit 1;
```

---

## Étape 6 — Edge Function d'invitation

La fonction vit dans le projet **plateforme** : `platform/supabase/functions/`.
Le déploiement ne nécessite pas Docker (seul le `serve` local en aurait besoin).

**Option CLI** (Supabase CLI installé) — depuis le dossier `platform/` :

```bash
cd platform
supabase functions deploy inviter-utilisateurs --project-ref wtovhzxymlqnfxyjxrdq
supabase secrets set CLIENT_APP_URL=https://client.avisdoc.fr --project-ref wtovhzxymlqnfxyjxrdq
```

**Option console** (sans CLI) : Supabase > **Edge Functions** > *Create a
function* nommée `inviter-utilisateurs`, colle le contenu de
`platform/supabase/functions/inviter-utilisateurs/index.ts`, déploie. Ajoute la
variable `CLIENT_APP_URL=https://client.avisdoc.fr` dans les secrets des Edge
Functions.

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` et `SUPABASE_ANON_KEY` sont fournis
automatiquement aux Edge Functions.

---

## Étape 7 — Frontends (build + hébergement + DNS)

Pour chacune des apps (`platform/admin`, `platform/client`) :

```bash
cd platform/admin        # puis idem dans platform/client
npm ci
echo "VITE_SUPABASE_URL=$SUPABASE_URL"          >  .env
echo "VITE_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY" >> .env
npm run build            # produit dist/
```

- **Hébergement** : `dist/` est statique → OVH (comme le site vitrine), ou
  Netlify / Vercel / Cloudflare Pages.
- **DNS** : `admin.avisdoc.fr` → hébergement de l'admin ;
  `client.avisdoc.fr` → hébergement du client.
- **Redirections SPA** (indispensable pour React Router). Sur OVH (Apache),
  déposer un `.htaccess` à la racine de chaque app :

  ```apache
  RewriteEngine On
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
  ```

---

## Étape 8 — Recette live

Dérouler `platform/RECETTE.md` : cloisonnement `hds`, e-mails copiables, fond
perdu des affiches, logo au rapport d'aspect extrême.

---

## Ordre récapitulatif

1. Secrets → 2. Migrations → 3. Premier admin → 4. Auth/SMTP →
5. Conteneur Scaleway → 6. Webhook → 7. Edge Function → 8. Frontends → 9. Recette.
