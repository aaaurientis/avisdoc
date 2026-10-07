-- Lot 4 — signature électronique du contrat (Yousign).
-- Complète req_contrats (lien de signature + identifiant signataire + idempotence
-- des événements webhook, RI-07) et ajoute le bucket privé d'archivage.

-- ----------------------------------------------------------------------------
-- 1. Colonnes supplémentaires sur req_contrats.
-- ----------------------------------------------------------------------------
alter table public.req_contrats
  add column if not exists yousign_signer_id text,   -- signataire Yousign
  add column if not exists sign_url           text;  -- lien de signature (voie portail)

-- ----------------------------------------------------------------------------
-- 2. Idempotence des événements Yousign (RI-07 : un événement traité une fois).
-- ----------------------------------------------------------------------------
create table if not exists public.req_yousign_events (
  event_id   text primary key,            -- identifiant d'événement Yousign
  recu_le    timestamptz not null default now()
);
alter table public.req_yousign_events enable row level security;
-- Aucune policy : table interne, accessible uniquement en service_role (fonctions).

-- ----------------------------------------------------------------------------
-- 3. Storage : bucket privé d'archivage des contrats signés + preuves.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('req-contrats', 'req-contrats', false)
on conflict (id) do nothing;

-- Lecture admin : on étend la policy existante aux trois buckets req-*.
drop policy if exists "req_storage_admin_read" on storage.objects;
create policy "req_storage_admin_read" on storage.objects
  for select to authenticated
  using (bucket_id in ('req-pieces', 'req-identite', 'req-contrats') and public.is_avisdoc_user());
