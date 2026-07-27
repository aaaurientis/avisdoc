# AvisDoc — Application d'administration (`admin.avisdoc.fr`)

Back-office interne réservé à l'équipe AvisDoc (comptes Google `@avisdoc.fr`).
Il vit **dans le même dépôt** que le site vitrine, partage le **même design
system** (Inter + Fraunces, tokens `avisdoc-*`, composants shadcn) mais se
construit comme une **application séparée** servie sur le sous-domaine.

## Écrans

| Route (hash) | Écran | Contenu |
|---|---|---|
| `#/` (non connecté) | Connexion | SSO Google restreint `@avisdoc.fr` |
| `#/dashboard` | Tableau de bord | KPI + activité + répartition réseau |
| `#/crm` | CRM | Kanban 4 étapes (Nouveau → Signé) |
| `#/crm/:id` | Projet | Fiche entreprise, contacts, documents, suivis, proposition, résultat |
| `#/contacts` | Annuaire | Requérants / Experts / Réseau d'Aval + fiche détail |
| `#/documents` | Documents | Gestion documentaire versionnée |
| `#/settings` | Réglages | Types de documents |

## Architecture technique

- **Deuxième entrée Vite** : `admin.html` → `src/admin/main.tsx`. Le build
  (`npm run build`) produit `dist/index.html` (vitrine) **et** `dist/admin.html`
  (back-office) avec des bundles séparés partageant `dist/assets/`.
- **Routage** : `HashRouter` (`react-router-dom`). Robuste sur hébergement
  statique (aucune réécriture serveur fragile), refresh-safe.
- **Design system** : `src/index.css` (identique au site) est importé par
  `src/admin/main.tsx`. `src/admin/admin.css` n'ajoute que le responsive de la
  coquille.
- **Couche de données** : `src/admin/data/` — un `AdminRepo` (interface) avec
  deux implémentations interchangeables :
  - `MockRepo` (défaut) : données de démo en mémoire (`data/seed.ts`).
  - `SupabaseRepo` : persistance Postgres/Storage.
  L'état applicatif vit dans `AdminDataContext` (mutations optimistes) ; le repo
  ne fait que charger et persister.
- **Authentification** : `src/admin/auth/AuthContext.tsx` — mode `demo`
  (SSO simulé) ou `supabase` (vrai OAuth Google).

```
src/admin/
  main.tsx            entrée (monte AdminApp)
  AdminApp.tsx        HashRouter + providers + gate d'auth
  admin.css           responsive de la coquille
  types.ts            modèles (Client, NetworkContact, DocItem…)
  lib/                config, format, maps, tokens UI
  auth/               AuthContext (SSO Google / démo)
  data/               repo (mock + supabase), pappers, seed
  components/         Sidebar, AppShell, primitives UI
  pages/              Login, Dashboard, Crm, Contacts, Documents, Settings
```

## Modes de fonctionnement (variables d'env Vite)

Le back-office a son **propre projet Supabase**, distinct de celui du site :
`wtovhzxymlqnfxyjxrdq` (`https://wtovhzxymlqnfxyjxrdq.supabase.co`).

Par défaut, l'admin tourne **sans backend** (données de démo, SSO simulé) —
idéal pour développer/valider l'UI. Variables (`.env`) :

```bash
# Projet Supabase dédié à l'admin
VITE_ADMIN_SUPABASE_URL=https://wtovhzxymlqnfxyjxrdq.supabase.co
VITE_ADMIN_SUPABASE_ANON_KEY=<clé anon public du projet admin>

# Bascule démo ↔ backend réel (mettre les deux à "supabase" quand prêt)
VITE_ADMIN_BACKEND=supabase   # persistance Postgres + Storage
VITE_ADMIN_AUTH=supabase      # vrai SSO Google (@avisdoc.fr)
```

> Les deux variables `VITE_ADMIN_SUPABASE_*` doivent être définies ensemble ;
> sinon le client retombe sur le projet du site (`VITE_SUPABASE_*`). Tant que
> `VITE_ADMIN_BACKEND`/`VITE_ADMIN_AUTH` valent `mock`/`demo`, l'app reste en
> mode démonstration.

## Mise en place du backend Supabase

> Toutes ces étapes visent le **projet admin** `wtovhzxymlqnfxyjxrdq`.

### 1. Schéma + sécurité (RLS) + données de démo

Exécuter, dans le SQL Editor du projet admin (ou via `supabase db push`) :

1. `supabase/migrations/0001_admin_schema.sql` — crée les tables `admin_*`,
   active la **Row Level Security** (accès réservé aux emails `@avisdoc.fr` via
   `is_avisdoc_user()`), crée le bucket privé `admin-documents`.
2. `supabase/migrations/0002_admin_seed.sql` *(optionnel)* — peuple la base avec
   le jeu de démonstration (à retirer en production réelle).

### 2. SSO Google restreint au domaine

1. Supabase → **Authentication → Providers → Google** : activer, renseigner
   Client ID / Secret (Google Cloud Console, écran OAuth + identifiants Web).
2. Dans Google Cloud, autoriser l'URL de redirection Supabase
   (`https://wtovhzxymlqnfxyjxrdq.supabase.co/auth/v1/callback`).
3. La restriction `@avisdoc.fr` est imposée à **trois** niveaux :
   - le paramètre `hd=avisdoc.fr` envoyé à Google (indicatif) ;
   - la vérification du domaine côté client (`AuthContext`) ;
   - **la RLS** (garde ultime : un compte hors domaine ne lit/écrit rien).
   Pour bloquer aussi la création de session, ajouter un *Auth Hook* Supabase
   « Before user created » rejetant les emails hors `@avisdoc.fr`.

### 3. Edge Function Pappers (clé API côté serveur)

```bash
supabase link --project-ref wtovhzxymlqnfxyjxrdq
supabase functions deploy pappers-search
supabase secrets set PAPPERS_API_KEY=xxxxxxxx
```

La clé Pappers **ne quitte jamais le serveur**. Le front appelle la fonction via
`supabase.functions.invoke('pappers-search', …)` ; la fonction re-vérifie le
domaine de l'appelant avant d'interroger `api.pappers.fr`.

### 4. (Optionnel) Upload réel des documents

Le bucket `admin-documents` est prêt. Brancher l'upload de fichiers
(`supabase.storage.from('admin-documents').upload(...)`) sur le bouton
« Importer un document » et enregistrer `storage_path` dans `admin_documents`.

## Déploiement (OVH)

Le build produit `admin.html` + `index.html` dans `dist/`. Le `public/.htaccess`
aiguille selon le sous-domaine :

- `admin.avisdoc.fr` → `admin.html` (back-office) ;
- `avisdoc.fr` / `www` → `index.html` (vitrine).

**Config OVH** : créer le sous-domaine `admin.avisdoc.fr` et le faire pointer
vers le **même dossier web** que le site (`/www`). Le `.htaccess` fait le reste.
Déploiement identique au site : `npm run deploy:ovh`.

## Conformité

- **RGPD** : Supabase région EU (Francfort/Paris), DPA signable. Aucune donnée
  patient nominative — uniquement CRM, contacts professionnels et chiffres
  agrégés de campagne.
- **HDS** : non requis en l'état (pas de données de santé nominatives). Si de
  telles données devaient être stockées un jour, les isoler sur un hébergeur
  **certifié HDS** (OVH Healthcare, Scaleway…).
