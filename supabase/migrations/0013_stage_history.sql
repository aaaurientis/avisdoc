-- ============================================================================
-- 0013 — Historique des changements d'étape (parcours CRM)
-- ----------------------------------------------------------------------------
-- Chaque passage d'étape (Nouveau → Qualifié → Proposition → Signé) est
-- horodaté via un trigger sur admin_clients — quelle que soit la source de la
-- modification. Permet d'afficher l'avancement et le temps passé à chaque
-- étape. Additif et idempotent.
-- ============================================================================
create table if not exists public.admin_client_stage_history (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.admin_clients (id) on delete cascade,
  stage      text not null,
  changed_at timestamptz not null default now()
);
create index if not exists idx_admin_stage_hist_client
  on public.admin_client_stage_history (client_id, changed_at);

-- Trigger : journalise l'étape à la création puis à chaque changement.
create or replace function public.admin_log_stage()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.admin_client_stage_history (client_id, stage)
      values (new.id, new.stage);
  elsif (new.stage is distinct from old.stage) then
    insert into public.admin_client_stage_history (client_id, stage)
      values (new.id, new.stage);
  end if;
  return new;
end $$;

drop trigger if exists trg_admin_log_stage on public.admin_clients;
create trigger trg_admin_log_stage
  after insert or update of stage on public.admin_clients
  for each row execute function public.admin_log_stage();

-- Backfill : une entrée initiale pour les clients existants (étape actuelle à
-- la date de création), afin que le bandeau ait au moins un point de départ.
insert into public.admin_client_stage_history (client_id, stage, changed_at)
select c.id, c.stage, coalesce(c.created_at, now())
from public.admin_clients c
where not exists (
  select 1 from public.admin_client_stage_history h where h.client_id = c.id
);

alter table public.admin_client_stage_history enable row level security;
drop policy if exists "avisdoc_all" on public.admin_client_stage_history;
create policy "avisdoc_all" on public.admin_client_stage_history
  for all to authenticated
  using (public.is_avisdoc_user())
  with check (public.is_avisdoc_user());
