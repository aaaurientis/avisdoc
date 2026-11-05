-- ============================================================================
-- 0081 — Typologies de clients et règles de confirmation des journées
-- ----------------------------------------------------------------------------
-- Une journée de dépistage est « confirmée » quand les conditions exigées par
-- la typologie de son client sont remplies. Exemple : un partenaire sans CPS
-- (Viabeez) fournit lui-même les requérants → la confirmation du requérant
-- n'est pas exigée, seul l'expert l'est.
--
--   admin_typologies_clients   les typologies et ce qu'elles exigent
--   admin_clients_typologie    l'affectation d'un client Qonto à une typologie,
--                              avec les noms sous lesquels il apparaît dans
--                              l'extraction des journées (alias)
--
-- Une seule typologie « par défaut » : elle vaut pour tout client non affecté.
-- Lecture : tout compte @avisdoc.fr. Écriture : porteurs du module Admin.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- Idempotent : rejouable sans effet.
-- ============================================================================

create table if not exists public.admin_typologies_clients (
  id                  uuid primary key default gen_random_uuid(),
  nom                 text not null unique,
  description         text not null default '',
  exige_requerant     boolean not null default true,
  exige_expert        boolean not null default true,
  exige_client        boolean not null default false,
  exige_consentements boolean not null default false,
  exige_dermatoscope  boolean not null default false,
  par_defaut          boolean not null default false,
  position            integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Au plus une typologie par défaut.
create unique index if not exists admin_typologies_clients_un_defaut
  on public.admin_typologies_clients (par_defaut) where par_defaut;

create table if not exists public.admin_clients_typologie (
  qonto_client_id text primary key,
  nom_qonto       text not null,
  typologie_id    uuid not null references public.admin_typologies_clients(id) on delete restrict,
  -- Noms du client tels qu'écrits dans l'extraction (« VIABEEZ »…), en plus du nom Qonto.
  alias           text[] not null default '{}',
  updated_at      timestamptz not null default now(),
  updated_by      text
);

alter table public.admin_typologies_clients enable row level security;
alter table public.admin_clients_typologie enable row level security;

drop policy if exists "typologies_lecture" on public.admin_typologies_clients;
create policy "typologies_lecture" on public.admin_typologies_clients
  for select to authenticated using (public.is_avisdoc_user());
drop policy if exists "typologies_ecriture" on public.admin_typologies_clients;
create policy "typologies_ecriture" on public.admin_typologies_clients
  for all to authenticated using (public.has_admin_access()) with check (public.has_admin_access());

drop policy if exists "clients_typologie_lecture" on public.admin_clients_typologie;
create policy "clients_typologie_lecture" on public.admin_clients_typologie
  for select to authenticated using (public.is_avisdoc_user());
drop policy if exists "clients_typologie_ecriture" on public.admin_clients_typologie;
create policy "clients_typologie_ecriture" on public.admin_clients_typologie
  for all to authenticated using (public.has_admin_access()) with check (public.has_admin_access());

-- Deux typologies de départ, modifiables ensuite dans Admin › Typologies clients.
insert into public.admin_typologies_clients (nom, description, exige_requerant, exige_expert, par_defaut, position)
values
  ('Client direct', 'AvisDoc fournit le requérant et l''expert.', true, true, true, 1),
  ('Partenaire sans CPS', 'Le partenaire fournit les requérants (ex. Viabeez) : seul l''expert est exigé.', false, true, false, 2)
on conflict (nom) do nothing;
