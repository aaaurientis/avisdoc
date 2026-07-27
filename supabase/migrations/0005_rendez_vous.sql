-- ============================================================================
-- 0005 — Rendez-vous : journées de dépistage + créneaux
-- ----------------------------------------------------------------------------
-- Réservation SANS COMPTE via un lien à jeton (le {{lien}} des e-mails de
-- campagne). L'employeur (espace client) voit le compteur + la liste des
-- inscrits. La réservation publique passe par une Edge Function (service_role) :
-- aucune écriture anon directe. Additif et idempotent.
-- ============================================================================

-- Journées de dépistage d'un client.
create table if not exists public.admin_journees (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.admin_clients (id) on delete cascade,
  date         date not null,
  lieu         text not null default '',
  heure_debut  time not null default '09:00',
  heure_fin    time not null default '17:00',
  duree_min    int  not null default 15 check (duree_min between 5 and 120),
  pause_debut  time,                       -- pause déjeuner optionnelle
  pause_fin    time,
  token        text not null unique default replace(gen_random_uuid()::text, '-', ''),
  actif        boolean not null default true,
  cree_le      timestamptz not null default now()
);
create index if not exists idx_journees_client on public.admin_journees (client_id);
create index if not exists idx_journees_token  on public.admin_journees (token);

-- Réservations (un créneau = un rendez-vous).
create table if not exists public.admin_rdv (
  id          uuid primary key default gen_random_uuid(),
  journee_id  uuid not null references public.admin_journees (id) on delete cascade,
  creneau     time not null,
  nom         text not null,
  email       text not null,
  telephone   text not null default '',
  cree_le     timestamptz not null default now(),
  unique (journee_id, creneau)             -- pas de double réservation d'un créneau
);
create index if not exists idx_rdv_journee on public.admin_rdv (journee_id);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.admin_journees enable row level security;
alter table public.admin_rdv      enable row level security;

-- Admin (@avisdoc.fr) : tout.
drop policy if exists journees_admin on public.admin_journees;
create policy journees_admin on public.admin_journees for all to authenticated
  using (public.is_avisdoc_user()) with check (public.is_avisdoc_user());
drop policy if exists rdv_admin on public.admin_rdv;
create policy rdv_admin on public.admin_rdv for all to authenticated
  using (public.is_avisdoc_user()) with check (public.is_avisdoc_user());

-- Espace client : lecture des journées et des rdv de SON client (compteur + liste).
drop policy if exists journees_espace on public.admin_journees;
create policy journees_espace on public.admin_journees for select to authenticated
  using (client_id = public.espace_client_id());
drop policy if exists rdv_espace on public.admin_rdv;
create policy rdv_espace on public.admin_rdv for select to authenticated
  using (journee_id in (select id from public.admin_journees where client_id = public.espace_client_id()));

-- Pas de policy anon : la page publique de réservation lit et écrit via l'Edge
-- Function `rdv` (service_role, jeton vérifié). Rien n'est exposé directement.
