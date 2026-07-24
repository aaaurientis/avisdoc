-- ============================================================================
-- AvisDoc — Fusion : espace client + génération documentaire
-- ----------------------------------------------------------------------------
-- Greffe la génération de documents et l'espace client sur le CRM existant
-- (admin_clients). 100 % ADDITIF : uniquement des `add column if not exists`
-- et `create ... if not exists`. N'altère AUCUNE table/politique existante.
--
-- Deux mondes d'accès cohabitent :
--   - ADMIN  (@avisdoc.fr, is_avisdoc_user()) : gère tout.
--   - ESPACE CLIENT (utilisateurs externes @domaine, rattachés à un client) :
--     ne voient que les documents de LEUR client (public + client), jamais hds.
-- Le service de génération écrit avec la clé service_role (contourne la RLS).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Logo + espace sur admin_clients
-- ----------------------------------------------------------------------------
alter table public.admin_clients
  add column if not exists logo_path      text,
  add column if not exists logo_sha256    text,
  add column if not exists espace_cree_le timestamptz;

-- ----------------------------------------------------------------------------
-- 2. Domaines e-mail déclarés (autorisent l'accès à l'espace client)
-- ----------------------------------------------------------------------------
create table if not exists public.admin_client_domaines (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.admin_clients (id) on delete cascade,
  domaine    text not null,
  created_at timestamptz not null default now(),
  unique (domaine)
);
create index if not exists idx_acd_client on public.admin_client_domaines (client_id);

-- ----------------------------------------------------------------------------
-- 3. Utilisateurs de l'espace client (invités)
-- ----------------------------------------------------------------------------
create table if not exists public.admin_client_espace_users (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references public.admin_clients (id) on delete cascade,
  auth_user_id          uuid references auth.users (id) on delete set null,
  email                 text not null,
  role                  text not null default 'membre',
  invite_le             timestamptz not null default now(),
  premiere_connexion_le timestamptz,
  unique (email)
);
create index if not exists idx_ace_client on public.admin_client_espace_users (client_id);
create index if not exists idx_ace_auth on public.admin_client_espace_users (auth_user_id);

-- ----------------------------------------------------------------------------
-- 4. Documents générés (jamais 'hds' : contrainte CHECK)
-- ----------------------------------------------------------------------------
create table if not exists public.admin_generated_docs (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.admin_clients (id) on delete cascade,
  doc_catalogue_id text not null,
  titre            text not null,
  acces            text not null check (acces in ('public', 'client')),
  logo_client      boolean not null,
  phase            text not null,
  format           text not null,
  version          text not null,
  storage_bucket   text not null,
  storage_path     text not null,
  octets           bigint,
  logo_sha256      text not null default 'sans-logo',
  genere_le        timestamptz not null default now(),
  unique (client_id, doc_catalogue_id, logo_sha256, version)
);
create index if not exists idx_agd_client on public.admin_generated_docs (client_id);
create index if not exists idx_agd_acces on public.admin_generated_docs (acces);

-- ----------------------------------------------------------------------------
-- 5. File de génération
-- ----------------------------------------------------------------------------
create table if not exists public.admin_generation_jobs (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.admin_clients (id) on delete cascade,
  type        text not null default 'creation_espace'
              check (type in ('creation_espace', 'maj_logo')),
  statut      text not null default 'en_attente'
              check (statut in ('en_attente', 'en_cours', 'termine', 'echec')),
  logo_sha256 text,
  erreur      text,
  cree_le     timestamptz not null default now(),
  demarre_le  timestamptz,
  fini_le     timestamptz
);
create index if not exists idx_agj_statut on public.admin_generation_jobs (statut);
create index if not exists idx_agj_client on public.admin_generation_jobs (client_id);

-- ----------------------------------------------------------------------------
-- 6. Helper : id du client de l'utilisateur d'espace courant
-- ----------------------------------------------------------------------------
create or replace function public.espace_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from admin_client_espace_users
  where auth_user_id = auth.uid()
  limit 1;
$$;

-- ----------------------------------------------------------------------------
-- 7. RLS
-- ----------------------------------------------------------------------------
alter table public.admin_client_domaines     enable row level security;
alter table public.admin_client_espace_users enable row level security;
alter table public.admin_generated_docs      enable row level security;
alter table public.admin_generation_jobs     enable row level security;

-- Domaines : admin gère ; l'utilisateur d'espace lit ceux de son client.
drop policy if exists acd_admin on public.admin_client_domaines;
create policy acd_admin on public.admin_client_domaines
  for all to authenticated using (public.is_avisdoc_user()) with check (public.is_avisdoc_user());
drop policy if exists acd_membre on public.admin_client_domaines;
create policy acd_membre on public.admin_client_domaines
  for select to authenticated using (client_id = public.espace_client_id());

-- Utilisateurs d'espace : admin gère ; l'utilisateur lit sa propre ligne.
drop policy if exists ace_admin on public.admin_client_espace_users;
create policy ace_admin on public.admin_client_espace_users
  for all to authenticated using (public.is_avisdoc_user()) with check (public.is_avisdoc_user());
drop policy if exists ace_self on public.admin_client_espace_users;
create policy ace_self on public.admin_client_espace_users
  for select to authenticated using (client_id = public.espace_client_id());

-- Documents générés :
--   public  -> lisible par tous (anon inclus) ;
--   client  -> lisible par l'utilisateur rattaché à ce client ;
--   admin   -> tout, @avisdoc.fr.
drop policy if exists agd_public on public.admin_generated_docs;
create policy agd_public on public.admin_generated_docs
  for select to anon, authenticated using (acces = 'public');
drop policy if exists agd_membre on public.admin_generated_docs;
create policy agd_membre on public.admin_generated_docs
  for select to authenticated
  using (client_id = public.espace_client_id() and acces in ('public', 'client'));
drop policy if exists agd_admin on public.admin_generated_docs;
create policy agd_admin on public.admin_generated_docs
  for all to authenticated using (public.is_avisdoc_user()) with check (public.is_avisdoc_user());

-- Jobs : admin uniquement (le service_role contourne la RLS).
drop policy if exists agj_admin on public.admin_generation_jobs;
create policy agj_admin on public.admin_generation_jobs
  for all to authenticated using (public.is_avisdoc_user()) with check (public.is_avisdoc_user());

-- ----------------------------------------------------------------------------
-- 8. Trigger : passage du CRM à « Signé » -> job de génération
-- ----------------------------------------------------------------------------
create or replace function public.creer_job_espace() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stage = 'Signé' and old.stage is distinct from 'Signé' then
    if new.espace_cree_le is null then new.espace_cree_le := now(); end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_admin_clients_signe_before on public.admin_clients;
create trigger trg_admin_clients_signe_before
  before update on public.admin_clients
  for each row execute function public.creer_job_espace();

create or replace function public.creer_job_espace_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Ouverture de l'espace au passage à « Signé »
  if new.stage = 'Signé' and old.stage is distinct from 'Signé' then
    insert into admin_generation_jobs (client_id, type, logo_sha256)
    values (new.id, 'creation_espace', new.logo_sha256);
  -- Régénération quand le logo change sur un client déjà signé
  elsif new.stage = 'Signé'
        and new.logo_sha256 is not null
        and new.logo_sha256 is distinct from old.logo_sha256 then
    insert into admin_generation_jobs (client_id, type, logo_sha256)
    values (new.id, 'maj_logo', new.logo_sha256);
  end if;
  return null;
end $$;

drop trigger if exists trg_admin_clients_signe_after on public.admin_clients;
create trigger trg_admin_clients_signe_after
  after update on public.admin_clients
  for each row execute function public.creer_job_espace_after();

-- ----------------------------------------------------------------------------
-- 9. Storage — buckets de l'espace client (distincts de admin-documents)
--    Convention de chemin : {client_id}/{fichier}.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('espace-logos',       'espace-logos',       false),
  ('espace-docs-public', 'espace-docs-public', true),
  ('espace-docs-client', 'espace-docs-client', false)
on conflict (id) do nothing;

-- Logos : admin (le service_role contourne la RLS).
drop policy if exists espace_logos_admin on storage.objects;
create policy espace_logos_admin on storage.objects
  for all to authenticated
  using (bucket_id = 'espace-logos' and public.is_avisdoc_user())
  with check (bucket_id = 'espace-logos' and public.is_avisdoc_user());

-- Docs publics : lecture par tous.
drop policy if exists espace_docs_public_lecture on storage.objects;
create policy espace_docs_public_lecture on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'espace-docs-public');

-- Docs client : lecture par l'utilisateur rattaché (1er segment du chemin = son client) ou admin.
drop policy if exists espace_docs_client_lecture on storage.objects;
create policy espace_docs_client_lecture on storage.objects
  for select to authenticated
  using (
    bucket_id = 'espace-docs-client'
    and (
      public.is_avisdoc_user()
      or (storage.foldername(name))[1] = public.espace_client_id()::text
    )
  );
