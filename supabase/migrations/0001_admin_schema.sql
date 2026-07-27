-- ============================================================================
-- AvisDoc — Back-office (admin.avisdoc.fr)
-- Schéma Postgres + RLS + Storage.
--
-- Sécurité : toutes les tables sont protégées par Row Level Security.
-- Seuls les utilisateurs authentifiés dont l'email se termine par @avisdoc.fr
-- peuvent lire/écrire. Le SSO Google impose déjà le domaine, mais la RLS est la
-- garde ultime : un compte Google hors domaine qui s'authentifierait ne verrait
-- et ne modifierait rien.
--
-- À exécuter via le SQL Editor Supabase, ou `supabase db push`.
-- ============================================================================

-- Helper : email du domaine autorisé ?
create or replace function public.is_avisdoc_user()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') like '%@avisdoc.fr'
$$;

-- Helper : maintient updated_at.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Annuaire du réseau
-- ----------------------------------------------------------------------------
create table if not exists public.admin_network_contacts (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  role         text default '',
  type         text not null check (type in ('Requérant', 'Expert', 'Réseau d''Aval')),
  statut       text not null default 'En attente' check (statut in ('Accepté', 'En attente', 'Refusé')),
  ville        text default '',
  adresse      text default '',
  email        text default '',
  tel          text default '',
  last_contact text default '',
  notes        text default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Projets CRM (une entreprise cliente = un projet)
-- ----------------------------------------------------------------------------
create table if not exists public.admin_clients (
  id           uuid primary key default gen_random_uuid(),
  company      text not null,
  siren        text default '',
  naf          text default '',
  adresse      text default '',
  effectif     text default '',
  stage        text not null default 'Nouveau' check (stage in ('Nouveau', 'Qualifié', 'Proposition', 'Signé')),
  jours        int  not null default 1,
  tarif        int  not null default 0,
  depistes     int  not null default 0,
  orientes     int  not null default 0,
  resultat     text,
  statut_propo text not null default 'Brouillon' check (statut_propo in ('Brouillon', 'Envoyée', 'Acceptée', 'Refusée')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.admin_client_contacts (
  id        uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.admin_clients (id) on delete cascade,
  name      text not null,
  role      text default '',
  email     text default '',
  tel       text default ''
);
create index if not exists idx_admin_client_contacts_client on public.admin_client_contacts (client_id);

create table if not exists public.admin_client_docs (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.admin_clients (id) on delete cascade,
  name       text not null,
  ext        text not null default 'PDF',
  date_label text default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_admin_client_docs_client on public.admin_client_docs (client_id);

create table if not exists public.admin_suivis (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.admin_clients (id) on delete cascade,
  text       text not null,
  deadline   date,
  done       boolean not null default false,
  when_label text,
  created_at timestamptz not null default now()
);
create index if not exists idx_admin_suivis_client on public.admin_suivis (client_id);

-- ----------------------------------------------------------------------------
-- Gestion documentaire globale
-- ----------------------------------------------------------------------------
create table if not exists public.admin_documents (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  ext          text not null default 'PDF',
  cat          text default '',
  size         text default '',
  date_label   text default '',
  owner        text default '',
  version      int not null default 1,
  storage_path text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.admin_doc_types (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Journal d'activité (dashboard)
-- ----------------------------------------------------------------------------
create table if not exists public.admin_activity (
  id         uuid primary key default gen_random_uuid(),
  dot        text default 'bg-avisdoc-teal',
  text       text not null,
  when_label text default '',
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Triggers updated_at
-- ----------------------------------------------------------------------------
drop trigger if exists trg_contacts_updated on public.admin_network_contacts;
create trigger trg_contacts_updated before update on public.admin_network_contacts
  for each row execute function public.set_updated_at();

drop trigger if exists trg_clients_updated on public.admin_clients;
create trigger trg_clients_updated before update on public.admin_clients
  for each row execute function public.set_updated_at();

drop trigger if exists trg_documents_updated on public.admin_documents;
create trigger trg_documents_updated before update on public.admin_documents
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS — accès réservé aux comptes @avisdoc.fr
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'admin_network_contacts', 'admin_clients', 'admin_client_contacts',
    'admin_client_docs', 'admin_suivis', 'admin_documents',
    'admin_doc_types', 'admin_activity'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "avisdoc_all" on public.%I;', t);
    execute format(
      'create policy "avisdoc_all" on public.%I
         for all to authenticated
         using (public.is_avisdoc_user())
         with check (public.is_avisdoc_user());',
      t
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Storage — bucket privé pour les fichiers réels
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('admin-documents', 'admin-documents', false)
on conflict (id) do nothing;

drop policy if exists "avisdoc_read_docs" on storage.objects;
create policy "avisdoc_read_docs" on storage.objects
  for select to authenticated
  using (bucket_id = 'admin-documents' and public.is_avisdoc_user());

drop policy if exists "avisdoc_write_docs" on storage.objects;
create policy "avisdoc_write_docs" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'admin-documents' and public.is_avisdoc_user());

drop policy if exists "avisdoc_update_docs" on storage.objects;
create policy "avisdoc_update_docs" on storage.objects
  for update to authenticated
  using (bucket_id = 'admin-documents' and public.is_avisdoc_user());

drop policy if exists "avisdoc_delete_docs" on storage.objects;
create policy "avisdoc_delete_docs" on storage.objects
  for delete to authenticated
  using (bucket_id = 'admin-documents' and public.is_avisdoc_user());

-- ----------------------------------------------------------------------------
-- Types de documents par défaut
-- ----------------------------------------------------------------------------
insert into public.admin_doc_types (name)
values ('Conventions'), ('Comptes-rendus'), ('Facturation'), ('Juridique')
on conflict (name) do nothing;
