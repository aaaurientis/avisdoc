-- ============================================================================
-- AvisDoc — Plateforme client · Schéma
-- ----------------------------------------------------------------------------
-- Backend commun à admin.avisdoc.fr et client.avisdoc.fr.
-- Voir docs/cadrage-plateforme-client.md (§4). Les garde-fous de sécurité
-- (cloisonnement public/client/hds, règle logo 9/15) sont portés par les
-- politiques RLS dans 0002_rls.sql : ce fichier ne fait que le schéma.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Types
-- ----------------------------------------------------------------------------
do $$ begin
  create type statut_crm as enum ('prospect', 'en_cours', 'signe', 'clos');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Les trois niveaux d'accès du pack. 'hds' ne doit JAMAIS être servi par
  -- cette plateforme (données de santé -> hébergeur certifié uniquement).
  create type niveau_acces as enum ('public', 'client', 'hds');
exception when duplicate_object then null; end $$;

do $$ begin
  create type phase_campagne as enum
    ('cadrage', 'annonce', 'relance', 'preparation', 'jour-j', 'bilan');
exception when duplicate_object then null; end $$;

do $$ begin
  create type type_job as enum ('creation_espace', 'maj_logo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type statut_job as enum ('en_attente', 'en_cours', 'termine', 'echec');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Horodatage automatique de maj_le
-- ----------------------------------------------------------------------------
create or replace function set_maj_le() returns trigger
language plpgsql as $$
begin
  new.maj_le := now();
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- admins : comptes du backoffice AvisDoc (accès total via RLS).
-- ----------------------------------------------------------------------------
create table if not exists admins (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  cree_le      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- clients : l'entreprise cliente.
-- ----------------------------------------------------------------------------
create table if not exists clients (
  id           uuid primary key default gen_random_uuid(),
  nom          text not null,               -- « ACME » : suffixe passé à build.py
  statut_crm   statut_crm not null default 'prospect',
  signe_le     timestamptz,                 -- passage à 'signe' (déclencheur génération)
  logo_path    text,                        -- chemin dans le bucket privé « logos »
  logo_sha256  text,                        -- empreinte -> clé de cache de génération
  cree_le      timestamptz not null default now(),
  maj_le       timestamptz not null default now()
);

drop trigger if exists trg_clients_maj on clients;
create trigger trg_clients_maj before update on clients
  for each row execute function set_maj_le();

-- ----------------------------------------------------------------------------
-- domaines : domaines e-mail autorisés d'un client (magic link restreint).
-- ----------------------------------------------------------------------------
create table if not exists domaines (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients (id) on delete cascade,
  domaine    text not null,                 -- « acme.fr » (sans @), en minuscules
  cree_le    timestamptz not null default now(),
  unique (domaine)
);
create index if not exists idx_domaines_client on domaines (client_id);

-- ----------------------------------------------------------------------------
-- utilisateurs_client : lien entre un compte Auth et un client.
-- ----------------------------------------------------------------------------
create table if not exists utilisateurs_client (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references clients (id) on delete cascade,
  auth_user_id          uuid references auth.users (id) on delete set null,
  email                 text not null,       -- doit relever d'un domaine du client
  role                  text not null default 'membre',  -- 'membre' | 'referent'
  invite_le             timestamptz not null default now(),
  premiere_connexion_le timestamptz,
  unique (email)
);
create index if not exists idx_uc_client on utilisateurs_client (client_id);
create index if not exists idx_uc_auth on utilisateurs_client (auth_user_id);

-- ----------------------------------------------------------------------------
-- documents : une ligne par document GÉNÉRÉ pour un client.
--   acces et logo_client sont RECOPIÉS du CATALOGUE de build.py par le service
--   de génération ; ils ne sont jamais saisis ni modifiés depuis une UI.
--   Aucune ligne de niveau 'hds' ne doit exister ici (défense en profondeur :
--   contrainte CHECK + RLS). Voir cadrage §7.
-- ----------------------------------------------------------------------------
create table if not exists documents (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references clients (id) on delete cascade,
  doc_catalogue_id text not null,            -- « affiche-1 », « kit-collaborateur »…
  titre            text not null,
  acces            niveau_acces not null,
  logo_client      boolean not null,         -- source de vérité = catalogue
  phase            phase_campagne not null,
  format           text not null,            -- A2 | A4 | 16:9
  version          text not null,            -- millésime en pied de page
  storage_bucket   text not null,            -- documents-public | documents-client
  storage_path     text not null,
  octets           bigint,
  -- Empreinte du logo ayant servi = clé de cache. 'sans-logo' pour les documents
  -- qui ne portent pas de logo (leur contenu ne dépend pas du logo client).
  logo_sha256      text not null default 'sans-logo',
  genere_le        timestamptz not null default now(),
  -- Interdit formellement de matérialiser un document de santé sur cette base.
  constraint documents_jamais_hds check (acces <> 'hds'),
  -- Cache + versionnage : au plus une entrée par (client, document, logo, version).
  -- Un nouveau millésime crée une nouvelle ligne, l'historique est conservé.
  unique (client_id, doc_catalogue_id, logo_sha256, version)
);
create index if not exists idx_documents_client on documents (client_id);
create index if not exists idx_documents_acces on documents (acces);

-- ----------------------------------------------------------------------------
-- generation_jobs : file de travail du service de génération.
-- ----------------------------------------------------------------------------
create table if not exists generation_jobs (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients (id) on delete cascade,
  type         type_job not null,
  statut       statut_job not null default 'en_attente',
  logo_sha256  text,
  erreur       text,
  cree_le      timestamptz not null default now(),
  demarre_le   timestamptz,
  fini_le      timestamptz
);
create index if not exists idx_jobs_statut on generation_jobs (statut);
create index if not exists idx_jobs_client on generation_jobs (client_id);
