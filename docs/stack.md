# Pile technique AvisDoc

État du dépôt `aaaurientis/avisdoc` — document de référence pour cadrer un brief
de développement. Rédigé à partir du code, pas des intentions : chaque point est
vérifiable dans les fichiers cités.

---

## Vue d'ensemble

Un **monorepo léger** : un seul projet Vite qui construit **4 fronts** à partir
de 4 points d'entrée HTML, des **Edge Functions Deno** côté serveur, et un
**service Python conteneurisé** pour la génération documentaire.

| Front | Entrée | Domaine | Rôle |
|---|---|---|---|
| Site vitrine | `index.html` → `src/main.tsx` | `avisdoc.fr` | marketing, SEO/GEO, pages légales |
| Back-office | `admin.html` → `src/admin/` | `admin.avisdoc.fr` | CRM, contacts, documents, devis, RDV |
| Espace client | `client.html` → `src/client/` | `client.avisdoc.fr` | bibliothèque, e-mails, rendez-vous |
| Espace pro | `pro.html` → `src/pro/` | `pro.avisdoc.fr` | connexion Pro Santé Connect (v1) |

Les quatre partagent le design system et l'alias `@/` → `src/` (`vite.config.ts`).

---

## 1. Front (Admin et Client)

Les deux sont **le même projet Vite**, avec des points d'entrée distincts — pas
deux applications séparées.

- **React 18.3** + **TypeScript 5.8**, build **Vite 5.4** avec
  `@vitejs/plugin-react-swc`. Pas de Next/Nuxt, **pas de SSR** : ce sont des SPA
  statiques.
- **Routeur** : `react-router-dom` 6.30. Chaque entrée a son propre arbre de
  routes (`src/admin/App.tsx`, `src/client/App.tsx`).
- **Gestion d'état** : **React Context + hooks**, rien d'autre. Aucun
  Redux/Zustand/Jotai/MobX. Trois contextes :
  - `src/admin/data/AdminDataContext.tsx` — état métier du back-office, avec
    transitions optimistes ;
  - `src/admin/auth/AuthContext.tsx` ;
  - `src/client/lib/auth.tsx`.
  `@tanstack/react-query` est en dépendance mais **n'est monté que sur la
  vitrine** (`src/App.tsx`) — l'admin et le client ne l'utilisent pas.
- **UI / CSS** : **Tailwind 3.4** avec un design system maison
  (`tailwind.config.ts` + `src/index.css`), plus **shadcn/ui** (style `default`,
  base `slate`, CSS variables). Seuls les composants réellement utilisés sont
  vendorisés dans `src/components/ui` : `button`, `accordion`, `input`, `toast`,
  `sonner`, `tooltip`. Radix UI en dépendance directe, `lucide-react` pour les
  icônes, `tailwind-merge` + `class-variance-authority`.

---

## 2. Back

Il n'y a **pas de backend applicatif au sens classique** — pas de Node/NestJS,
pas de Django. Deux briques :

- **Supabase Edge Functions** — **Deno / TypeScript**, 10 fonctions dans
  `supabase/functions/`, déployées via la CLI Supabase. API **REST/RPC** : le
  front les appelle en `supabase.functions.invoke(...)`, et attaque sinon
  **PostgREST** directement via `supabase-js`
  (`.from("admin_clients").select(...)`). Pas de GraphQL, pas de tRPC.
- **Un service Python** — `platform/generation-service/`, **FastAPI + Uvicorn**
  (Python 3.11), pour la génération documentaire (WeasyPrint 69, python-pptx,
  pdfplumber, + `pptxgenjs` via Node). Deux endpoints REST (`GET /health`,
  `POST /generate`), authentifié par un secret partagé `X-Webhook-Secret`,
  déclenché par un **Database Webhook** Supabase sur `INSERT` dans
  `generation_jobs`.

### Les 10 Edge Functions

| Fonction | `verify_jwt` | Rôle |
|---|---|---|
| `rdv` | non | réservation publique de créneaux, par jeton de journée |
| `rdv-rappels` | non | rappels J-1 / H-1, cron 15 min, secret `x-secret` |
| `inviter-espace` | oui | invitations et magic links de l'espace client |
| `supprimer-client` | oui | suppression complète d'un client |
| `qonto` | oui | passerelle devis / factures Qonto |
| `pappers-search` | oui | enrichissement entreprise (SIRET) |
| `annuaire-sante` | oui | annuaire RPPS |
| `psc-auth` | non | OIDC Pro Santé Connect, sessions signées HMAC 12 h |
| `send-contact-message` | non | formulaire de contact du site |
| `send-data-deletion-request` | non | demandes de suppression RGPD |

### Authentification — trois mécanismes distincts

| Périmètre | Mécanisme |
|---|---|
| Admin | **Supabase Auth / Google SSO**, restreint au domaine `@avisdoc.fr` (vérifié en RLS *et* dans chaque fonction) — JWT Supabase |
| Client | **Supabase Auth passwordless** — magic link + invitation, flux `implicit` |
| Pro | **OIDC Pro Santé Connect** (e-CPS), flux entièrement côté serveur dans `psc-auth`, session rendue au front sous forme de **jeton signé HMAC 12 h** |

Les fonctions publiques (`rdv`, `rdv-rappels`) tournent en `verify_jwt = false`
et sont protégées par jeton d'URL ou secret partagé — voir
`supabase/config.toml`.

### E-mails

Deux canaux, à ne pas confondre :

- **API Resend** appelée en `fetch` direct (`https://api.resend.com/emails`)
  dans `rdv`, `rdv-rappels`, `send-contact-message` et
  `send-data-deletion-request` — HTML inline dans chaque fonction, pièce jointe
  `.ics` générée à la main pour les confirmations de RDV.
- **Supabase Auth** pour les e-mails d'authentification (magic link, invitation),
  y compris ceux déclenchés par le back-office via `inviter-espace`
  (`inviteUserByEmail` / `signInWithOtp`). Templates dans
  `supabase/email-templates/`, à coller dans le dashboard. Le SMTP réellement
  utilisé derrière est un réglage du dashboard Supabase, **absent du dépôt**.

---

## 3. Base de données, ORM, stockage des images

- **PostgreSQL managé par Supabase**, avec **RLS**.
- **Aucun ORM** : `@supabase/supabase-js` 2.99 en direct, requêtes PostgREST. Un
  pattern *repository* isole ça derrière une interface
  (`src/admin/data/repo.ts`), avec deux implémentations strictement
  interchangeables : `mock` (en mémoire) et `supabaseRepo`.
- **Migrations** : 17 fichiers SQL versionnés dans `supabase/migrations/`
  (`0001` → `0017`), **appliquées à la main** dans le SQL Editor —
  volontairement jamais rejouées par la CI.
- **Tables**, toutes préfixées `admin_` : `admin_clients`,
  `admin_network_contacts`, `admin_client_docs`, `admin_client_espace_users`,
  `admin_client_domaines`, `admin_devis`, `admin_journees`, `admin_rdv`,
  `admin_generation_jobs`, `admin_client_logs`, `admin_suivis`,
  `admin_client_stage_history`…
- **Images et fichiers** : **Supabase Storage**. Buckets `espace-logos` (logos
  clients) et `admin-devis` (PDF de devis, mis en cache, servis en URL signée
  1 h). Le service de génération publie dans `documents-public` /
  `documents-client`. Les images de la vitrine sont des assets statiques buildés
  (`src/assets/`).

---

## 4. Hébergement et environnements

- **Fronts** : **OVH Web Cloud mutualisé, mode Multisite** — déploiement par
  **SFTP / lftp**, un dossier racine par sous-domaine (`www`, `admin`, `client`,
  `pro`). Hébergement purement statique, redirections SPA par `.htaccess`.
- **Backend** : **Supabase Cloud**, région EU.
  ⚠️ **Deux projets Supabase distincts** — un pour la vitrine, un pour la
  plateforme (`wtovhzxymlqnfxyjxrdq`, cible de tous les déploiements de
  fonctions). Le `project_id` de `supabase/config.toml` pointe encore sur le
  projet vitrine : divergence à connaître avant de toucher aux fonctions.
- **Service de génération** : image Docker poussée sur le **registre Scaleway**
  (`rg.fr-par.scw.cloud/avisdoc/generation`), prévue pour **Scaleway Serverless
  Containers** (scale-to-zero).
- **Environnements** : **il n'y a qu'un environnement, la production.** Pas de
  staging, pas de preview. Le déploiement part sur `push` vers `main`, ou
  manuellement depuis n'importe quelle branche avec choix des cibles. Le seul
  « autre mode » est le **mode démo du back-office** (données en mémoire, SSO
  simulé) piloté par `VITE_ADMIN_BACKEND` / `VITE_ADMIN_AUTH`, qui est **le
  défaut**.
- **HDS** : **pas d'hébergeur certifié HDS aujourd'hui, et c'est assumé.**
  `docs/admin-app.md` acte que le HDS n'est pas requis en l'état, car aucune
  donnée de santé nominative n'est stockée (CRM, contacts professionnels et
  agrégats de campagne uniquement). Le service de génération refuse
  explicitement de publier les documents marqués `hds` (comptes-rendus, lettres
  d'adressage). Cibles évoquées le jour où cela change : **OVH Healthcare ou
  Scaleway**.
  À noter : le site vitrine affiche « hébergement certifié HDS » — c'est la
  promesse commerciale portant sur la chaîne de téléexpertise, pas l'état de
  cette plateforme-ci.

---

## 5. Dépôt

**Un seul repo**, `aaaurientis/avisdoc`. Pas de workspaces npm/pnpm, pas de
Turborepo ni de Nx — **un unique `package.json` à la racine** qui construit les
4 fronts, plus un dossier Python indépendant avec ses propres
`requirements.txt`.

La cohabitation Admin / Client se fait par **points d'entrée multi-page de Vite**
(`vite.config.ts`) et par convention de dossiers :

```
avisdoc/
├── index.html          → src/main.tsx     → avisdoc.fr        (vitrine)
├── admin.html          → src/admin/       → admin.avisdoc.fr  (back-office)
├── client.html         → src/client/      → client.avisdoc.fr (espace client)
├── pro.html            → src/pro/         → pro.avisdoc.fr    (Pro Santé Connect)
├── src/
│   ├── admin/          auth, components, data, espace, lib, pages   (43 fichiers)
│   ├── client/         components, data, lib, pages                 (14 fichiers)
│   ├── components/     design system partagé + ui/ (shadcn)
│   ├── pages/          pages de la vitrine
│   ├── lib/            seo.ts, schema.ts, utils.ts
│   ├── integrations/supabase/
│   └── test/
├── supabase/
│   ├── functions/      10 Edge Functions Deno
│   ├── migrations/     0001 → 0017 (SQL)
│   ├── email-templates/
│   └── config.toml
├── platform/generation-service/   FastAPI + WeasyPrint + Dockerfile
├── scripts/            build-deploy.sh, deploy-ovh.sh
├── docs/               admin-app.md, RELEASE-fusion.md, site-content.md, stack.md
└── .github/workflows/  deploy.yml, generation-image.yml
```

`npm run build` produit un seul `dist/` contenant les 4 HTML ; le script de
déploiement répartit ensuite les fichiers vers le bon dossier OVH par cible.

---

## 6. Outillage

- **Gestionnaire de paquets** : **npm** (`package-lock.json`, `npm ci` en CI),
  Node 20. Côté Python : `pip` + `requirements.txt` épinglés.
- **CI** : **GitHub Actions**, deux workflows.
  - `deploy.yml` — build + envoi SFTP vers OVH, puis
    `supabase functions deploy` ; déclenché sur `main` ou manuellement avec
    choix des cibles.
  - `generation-image.yml` — build et push de l'image Docker vers Scaleway.

  ⚠️ **Aucun job de lint ou de test dans la CI** — le déploiement part sans
  garde-fou automatique.
- **Tests** : **Vitest 3.2** + Testing Library + jsdom, configurés proprement
  (`vitest.config.ts`, `src/test/setup.ts`)… mais **un seul fichier de test
  existe**, `src/test/example.test.ts`. Côté Python,
  `platform/generation-service/tests/test_generation.py` (pytest). L'outillage
  est en place, **la couverture est quasi nulle**.
- **Qualité** : ESLint 9 (flat config) + typescript-eslint, `npm run lint`, à
  lancer à la main. Pas de Prettier, pas de hooks pre-commit, pas de typecheck
  séparé en CI.

### Scripts npm

| Script | Effet |
|---|---|
| `npm run dev` | Vite en dev, port 8080 |
| `npm run build` | build de production des 4 fronts |
| `npm run build:dev` | build en mode development |
| `npm run preview` | sert le build |
| `npm run lint` | ESLint |
| `npm run test` / `test:watch` | Vitest |
| `npm run deploy:ovh` | déploiement SFTP manuel |

---

## Points d'attention pour un brief

1. **Un seul environnement, la production.** Pas de staging ni de preview :
   toute nouvelle fonctionnalité doit prévoir son propre plan de recette.
2. **Zéro test et zéro lint bloquants en CI.** L'outillage existe mais rien ne
   s'exécute avant déploiement.
3. **La question HDS.** L'architecture actuelle tient parce qu'aucune donnée de
   santé nominative n'est stockée. Toute fonctionnalité touchant à des données
   patient fait basculer les choix d'hébergement.
4. **Deux projets Supabase** (vitrine / plateforme), avec un `config.toml` qui
   ne pointe pas sur celui que déploie la CI.
5. **Migrations SQL manuelles**, à appliquer dans le bon ordre via le SQL Editor
   (voir `docs/RELEASE-fusion.md` pour le format de runbook en vigueur).
