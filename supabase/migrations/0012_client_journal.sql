-- ============================================================================
-- 0012 — Journal du client (commentaires horodatés + auteur)
-- ----------------------------------------------------------------------------
-- Fil d'activité manuel : chaque entrée porte un message, l'auteur (nom de
-- l'admin) et un horodatage. Réservé aux comptes @avisdoc.fr (RLS). Idempotent.
-- ============================================================================
create table if not exists public.admin_client_logs (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.admin_clients (id) on delete cascade,
  auteur     text not null default '',
  message    text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_admin_client_logs_client
  on public.admin_client_logs (client_id, created_at desc);

alter table public.admin_client_logs enable row level security;
drop policy if exists "avisdoc_all" on public.admin_client_logs;
create policy "avisdoc_all" on public.admin_client_logs
  for all to authenticated
  using (public.is_avisdoc_user())
  with check (public.is_avisdoc_user());
