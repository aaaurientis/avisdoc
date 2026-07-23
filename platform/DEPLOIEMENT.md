# Déploiement — plateforme client AvisDoc

Runbook, à dérouler **dans l'ordre**. Chaque étape est autonome et vérifiable.
Projet Supabase : `fmchuaxxchghfagfpvwn`.

---

## Étape 0 — Prérequis et secrets

À récupérer / installer avant de commencer :

- **Clés Supabase** (Project Settings > API) :
  - `anon` (publique) → pour les frontends ;
  - `service_role` (**secrète**) → pour le service de génération et l'Edge Function.
- **Chaîne de connexion Postgres** (Project Settings > Database > Connection string > URI).
- **Compte Scaleway** + `scw` CLI (`scaleway.com`), ou l'interface web.
- **Docker** installé localement.
- **Un secret webhook** que tu inventes (chaîne aléatoire), noté `WEBHOOK_SECRET`.

```bash
# À garder sous la main (ne pas committer)
export DATABASE_URL="postgresql://postgres:MDP@db.fmchuaxxchghfagfpvwn.supabase.co:5432/postgres"
export SUPABASE_URL="https://fmchuaxxchghfagfpvwn.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="..."      # secret
export SUPABASE_ANON_KEY="..."              # public
export WEBHOOK_SECRET="$(openssl rand -hex 24)"
echo "WEBHOOK_SECRET=$WEBHOOK_SECRET"       # à conserver
```

---

## Étape 1 — Base de données (migrations)

Crée les tables, la RLS, les buckets Storage et les triggers.

```bash
cd platform/supabase
chmod +x apply-migrations.sh
./apply-migrations.sh
```

Vérification :

```sql
-- Doit lister les 6 tables + 3 buckets.
select table_name from information_schema.tables
  where table_schema = 'public' order by 1;
select id, public from storage.buckets order by id;
```

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

## Étape 4 — Service de génération (Docker + Scaleway)

Build et publication de l'image, puis création du conteneur serverless.

```bash
cd platform/generation-service

# 4.1 — Registre Scaleway (adapter la région / le namespace)
scw registry namespace create name=avisdoc region=fr-par || true
docker login rg.fr-par.scw.cloud -u nologin --password-stdin <<<"$SCW_SECRET_KEY"

# 4.2 — Build + push
IMAGE="rg.fr-par.scw.cloud/avisdoc/generation:latest"
docker build -t "$IMAGE" .
docker push "$IMAGE"

# 4.3 — Conteneur serverless (scale-to-zero)
scw container namespace create name=avisdoc region=fr-par || true
NS=$(scw container namespace list -o json | jq -r '.[]|select(.name=="avisdoc").id')

scw container container create \
  namespace-id="$NS" name=generation \
  registry-image="$IMAGE" port=8080 \
  min-scale=0 max-scale=1 memory-limit=2048 cpu-limit=1000 \
  timeout=300s \
  environment-variables.SUPABASE_URL="$SUPABASE_URL" \
  secret-environment-variables.SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  secret-environment-variables.WEBHOOK_SECRET="$WEBHOOK_SECRET"

scw container container deploy name=generation
```

> Alternative sans CLI : tout est faisable dans la console Scaleway
> (Container Registry + Serverless Containers), mêmes valeurs.

Récupère l'**URL publique** du conteneur (ex.
`https://generationxxxx.functions.fnc.fr-par.scw.cloud`) et teste :

```bash
curl -s https://<URL_CONTENEUR>/health      # -> {"ok":true}
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

Déploie la fonction (projet commun, à la racine `supabase/`) :

```bash
supabase functions deploy inviter-utilisateurs --project-ref fmchuaxxchghfagfpvwn
# Variable facultative : URL de l'espace client pour la redirection
supabase secrets set CLIENT_APP_URL=https://client.avisdoc.fr --project-ref fmchuaxxchghfagfpvwn
```

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
