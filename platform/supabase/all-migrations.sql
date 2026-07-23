-- ============================================================================
-- AvisDoc — plateforme client · TOUTES LES MIGRATIONS (0001 -> 0005)
-- Fichier concatene pour le SQL Editor Supabase : coller l'integralite,
-- puis Run. Genere depuis migrations/*.sql — ne pas editer a la main.
-- ============================================================================

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0001_schema.sql >>>>>>>>>>>>>>>>>>>>>>>>
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

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0002_rls.sql >>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- AvisDoc — Plateforme client · RLS (Row Level Security)
-- ----------------------------------------------------------------------------
-- Cloisonnement des trois niveaux d'accès (cadrage §7) :
--   public  -> lisible sans authentification (rôles anon + authenticated)
--   client  -> lisible par l'utilisateur rattaché au client, uniquement
--   hds     -> jamais servi ici (aucune ligne, aucune politique de lecture)
--
-- Les écritures dans documents/generation_jobs se font par le service de
-- génération avec la clé service_role (rôle Postgres à BYPASSRLS) : aucune
-- politique d'INSERT/UPDATE n'est donc accordée aux rôles anon/authenticated
-- sur ces tables.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER pour ne pas boucler sur la RLS des tables lues)
-- ----------------------------------------------------------------------------
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where auth_user_id = auth.uid());
$$;

create or replace function current_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from utilisateurs_client
  where auth_user_id = auth.uid()
  limit 1;
$$;

-- ----------------------------------------------------------------------------
-- Activation RLS
-- ----------------------------------------------------------------------------
alter table admins              enable row level security;
alter table clients             enable row level security;
alter table domaines            enable row level security;
alter table utilisateurs_client enable row level security;
alter table documents           enable row level security;
alter table generation_jobs     enable row level security;

-- ----------------------------------------------------------------------------
-- admins
-- ----------------------------------------------------------------------------
drop policy if exists admins_lecture on admins;
create policy admins_lecture on admins
  for select to authenticated using (is_admin());

-- ----------------------------------------------------------------------------
-- clients
-- ----------------------------------------------------------------------------
drop policy if exists clients_admin_tout on clients;
create policy clients_admin_tout on clients
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists clients_membre_lecture on clients;
create policy clients_membre_lecture on clients
  for select to authenticated using (id = current_client_id());

-- ----------------------------------------------------------------------------
-- domaines
-- ----------------------------------------------------------------------------
drop policy if exists domaines_admin_tout on domaines;
create policy domaines_admin_tout on domaines
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists domaines_membre_lecture on domaines;
create policy domaines_membre_lecture on domaines
  for select to authenticated using (client_id = current_client_id());

-- ----------------------------------------------------------------------------
-- utilisateurs_client
-- ----------------------------------------------------------------------------
drop policy if exists uc_admin_tout on utilisateurs_client;
create policy uc_admin_tout on utilisateurs_client
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists uc_membre_lecture on utilisateurs_client;
create policy uc_membre_lecture on utilisateurs_client
  for select to authenticated using (client_id = current_client_id());

-- ----------------------------------------------------------------------------
-- documents
--   Lecture publique : tout le monde (anon inclus) voit les documents 'public'.
--   Lecture client   : l'utilisateur rattaché voit 'public' + 'client' de SON
--                       client. 'hds' n'est jamais atteignable (aucune politique
--                       ne le sélectionne, et la contrainte CHECK l'interdit).
-- ----------------------------------------------------------------------------
drop policy if exists documents_public_lecture on documents;
create policy documents_public_lecture on documents
  for select to anon, authenticated using (acces = 'public');

drop policy if exists documents_client_lecture on documents;
create policy documents_client_lecture on documents
  for select to authenticated
  using (client_id = current_client_id() and acces in ('public', 'client'));

drop policy if exists documents_admin_lecture on documents;
create policy documents_admin_lecture on documents
  for select to authenticated using (is_admin());

-- ----------------------------------------------------------------------------
-- generation_jobs : réservé aux admins en lecture. Le service (service_role)
-- gère l'écriture en contournant la RLS.
-- ----------------------------------------------------------------------------
drop policy if exists jobs_admin_lecture on generation_jobs;
create policy jobs_admin_lecture on generation_jobs
  for select to authenticated using (is_admin());

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0003_storage.sql >>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- AvisDoc — Plateforme client · Storage
-- ----------------------------------------------------------------------------
-- Trois buckets. Convention de chemin : {client_id}/{fichier}.
--   logos             (privé)  : logos téléversés par l'admin. Lu par le service.
--   documents-public  (public) : documents de niveau 'public', lien direct.
--   documents-client  (privé)  : documents de niveau 'client', cloisonnés.
-- Aucun bucket pour 'hds' : ces documents ne transitent jamais par ici.
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('logos',            'logos',            false),
  ('documents-public', 'documents-public', true),
  ('documents-client', 'documents-client', false)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- logos : admin uniquement (le service_role contourne la RLS).
-- ----------------------------------------------------------------------------
drop policy if exists logos_admin on storage.objects;
create policy logos_admin on storage.objects
  for all to authenticated
  using (bucket_id = 'logos' and is_admin())
  with check (bucket_id = 'logos' and is_admin());

-- ----------------------------------------------------------------------------
-- documents-public : lecture par tous (anon inclus).
-- ----------------------------------------------------------------------------
drop policy if exists docs_public_lecture on storage.objects;
create policy docs_public_lecture on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'documents-public');

-- ----------------------------------------------------------------------------
-- documents-client : lecture par l'utilisateur rattaché au client dont l'id
-- est le premier segment du chemin ; plus l'admin.
-- ----------------------------------------------------------------------------
drop policy if exists docs_client_lecture on storage.objects;
create policy docs_client_lecture on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents-client'
    and (
      is_admin()
      or (storage.foldername(name))[1] = current_client_id()::text
    )
  );

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0004_triggers.sql >>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- AvisDoc — Plateforme client · Déclencheurs de génération
-- ----------------------------------------------------------------------------
-- Le passage du statut CRM à 'signe' crée un job 'creation_espace'.
-- Une mise à jour du logo d'un client déjà signé crée un job 'maj_logo'.
--
-- La consommation des jobs est déclenchée hors base : un Supabase Database
-- Webhook sur INSERT de generation_jobs appelle le service de génération
-- (conteneur Scaleway). Ce fichier ne fait que produire les lignes de job.
-- ============================================================================

create or replace function creer_job_signature() returns trigger
language plpgsql as $$
begin
  -- Passage à 'signe' (et pas un simple UPDATE d'une ligne déjà signée)
  if new.statut_crm = 'signe' and old.statut_crm is distinct from 'signe' then
    if new.signe_le is null then
      new.signe_le := now();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_clients_signe_before on clients;
create trigger trg_clients_signe_before
  before update on clients
  for each row execute function creer_job_signature();

create or replace function creer_job_generation() returns trigger
language plpgsql as $$
begin
  -- Ouverture de l'espace au passage à 'signe'
  if new.statut_crm = 'signe' and old.statut_crm is distinct from 'signe' then
    insert into generation_jobs (client_id, type, logo_sha256)
    values (new.id, 'creation_espace', new.logo_sha256);

  -- Régénération quand le logo change sur un client déjà signé
  elsif new.statut_crm = 'signe'
        and new.logo_sha256 is not null
        and new.logo_sha256 is distinct from old.logo_sha256 then
    insert into generation_jobs (client_id, type, logo_sha256)
    values (new.id, 'maj_logo', new.logo_sha256);
  end if;
  return null;
end $$;

drop trigger if exists trg_clients_signe_after on clients;
create trigger trg_clients_signe_after
  after update on clients
  for each row execute function creer_job_generation();

-- >>>>>>>>>>>>>>>>>>>>>>>> migrations/0005_admin_par_domaine.sql >>>>>>>>>>>>>>>>>>>>>>>>
-- ============================================================================
-- AvisDoc — Plateforme client · Administrateurs par domaine
-- ----------------------------------------------------------------------------
-- Règle métier : tout compte dont l'adresse e-mail est en @avisdoc.fr est
-- administrateur. La table `admins` est conservée comme liste d'exception
-- (ex. prestataire externe), combinée en OR.
-- ============================================================================

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select
    coalesce(lower(auth.jwt() ->> 'email') like '%@avisdoc.fr', false)
    or exists (select 1 from admins where auth_user_id = auth.uid());
$$;

