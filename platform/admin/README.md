# Admin — admin.avisdoc.fr

Backoffice AvisDoc : CRM (statut), création d'espaces clients, logo, domaines,
utilisateurs, suivi de la génération, envoi des invitations.

Vite + React + TypeScript + Tailwind, sur le backend Supabase commun.

## Développement

```bash
npm install
cp .env.example .env   # renseigner VITE_SUPABASE_ANON_KEY
npm run dev            # http://localhost:8090
```

## Rôle d'administrateur

Connexion par **Google** (`signInWithOAuth`). **Tout compte `@avisdoc.fr` est
administrateur** (fonction `is_admin()` côté base, `queryParams.hd=avisdoc.fr`
côté client). Un compte hors `@avisdoc.fr` voit « Accès réservé ».

La table `admins` reste une **liste d'exception** (admin externe ponctuel) —
voir `platform/supabase/seed-admin.sql`. Le provider Google doit être activé
dans Supabase (voir `platform/DEPLOIEMENT.md`, étape 3).

## Flux couvert

1. Créer un client, déclarer ses **domaines** (`acme.fr`) et ses **utilisateurs**
   (contrôle : l'adresse doit relever d'un domaine déclaré).
2. **Téléverser le logo** (PNG/SVG transparent, hauteur ≥ 200 px) → bucket `logos`.
3. Passer le statut à **« Signé »** → déclenche la génération (trigger + service).
   Le passage à « Signé » est refusé tant qu'aucun logo n'est téléversé.
4. Suivre l'état de la **génération** et la liste des **documents** produits.
5. **Envoyer les invitations** (validation humaine) → Edge Function
   `inviter-utilisateurs` (magic link restreint aux domaines déclarés).

## Sécurité

- Seule la **clé anon** (publique) est utilisée côté navigateur ; toutes les
  écritures sensibles passent par la RLS (droits admin) ou par l'Edge Function
  à clé service_role.
- Les documents de niveau `hds` n'existent pas sur ce backend : rien à masquer
  côté UI, ils ne remontent jamais.
