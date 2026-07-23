# Plateforme client AvisDoc

Backend et services de la plateforme (distincte du site vitrine à la racine du
dépôt). Cadrage complet : [`docs/cadrage-plateforme-client.md`](../docs/cadrage-plateforme-client.md).

## Composants

| Dossier | Rôle | État |
|---|---|---|
| `supabase/migrations/` | Schéma Postgres, RLS (cloison `public`/`client`/`hds`), buckets Storage, triggers de génération | **fait** (Lot 0) |
| `generation-service/` | Service Docker (FastAPI) qui exécute le pack et publie les documents logotés — Scaleway | **fait** (Lot 1) |
| `admin/` | Backoffice `admin.avisdoc.fr` (CRM, espaces, logo, invitations) | **fait** (Lot 2) |
| `client/` | Espace `client.avisdoc.fr` (bibliothèque, aperçu, e-mails) | à venir (Lot 3) |

L'Edge Function d'invitation vit dans le projet Supabase commun :
`supabase/functions/inviter-utilisateurs/` (à la racine du dépôt).

## Architecture

Un **backend Supabase unique** (Auth + Postgres + Storage + RLS) partagé par les
deux frontends. Le passage du statut CRM à `signe` déclenche la génération des
documents du client (logo incrusté), publiés dans Storage selon leur niveau
d'accès. Les documents de santé (`hds`) ne transitent **jamais** par ici.

```
admin.avisdoc.fr   client.avisdoc.fr
        \               /
         ▼             ▼
        Supabase (commun, RLS)
              │  job « Signé »
              ▼
    generation-service (Scaleway)
```

## Migrations

Appliquer dans l'ordre (`0001` → `0004`) via la CLI Supabase ou l'éditeur SQL :

```
0001_schema.sql     tables + types
0002_rls.sql        Row Level Security (cœur de la sécurité d'accès)
0003_storage.sql    buckets + politiques Storage
0004_triggers.sql   création des jobs au statut « Signé » / maj logo
```

Après application, configurer un **Database Webhook** sur `INSERT` de
`generation_jobs` pointant vers `POST /generate` du service, avec l'en-tête
`X-Webhook-Secret`.

## Points ouverts

Les arbitrages restants (rôles, durée des magic links, multi-campagnes, etc.)
sont listés au §10 du cadrage.
