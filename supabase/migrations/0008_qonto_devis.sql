-- ============================================================================
-- 0008 — Devis Qonto
-- ----------------------------------------------------------------------------
-- Lien vers Qonto (id client) + e-mail de facturation, et table des devis émis.
-- Les appels Qonto passent par l'Edge Function `qonto` (clé secrète côté
-- serveur). RLS admin uniquement. Additif et idempotent.
-- ============================================================================

alter table public.admin_clients
  add column if not exists qonto_client_id  text,
  add column if not exists email_facturation text;

create table if not exists public.admin_devis (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.admin_clients (id) on delete cascade,
  qonto_quote_id text,
  numero         text,
  montant_ht     numeric,
  montant_ttc    numeric,
  statut         text not null default 'brouillon',
  pdf_path       text,                       -- chemin dans le bucket admin-devis
  cree_le        timestamptz not null default now()
);
create index if not exists idx_devis_client on public.admin_devis (client_id);

alter table public.admin_devis enable row level security;
drop policy if exists devis_admin on public.admin_devis;
create policy devis_admin on public.admin_devis for all to authenticated
  using (public.is_avisdoc_user()) with check (public.is_avisdoc_user());

-- Bucket privé pour les PDF de devis (accès admin via clé service / signed URL).
insert into storage.buckets (id, name, public)
values ('admin-devis', 'admin-devis', false)
on conflict (id) do nothing;

drop policy if exists devis_pdf_admin on storage.objects;
create policy devis_pdf_admin on storage.objects for all to authenticated
  using (bucket_id = 'admin-devis' and public.is_avisdoc_user())
  with check (bucket_id = 'admin-devis' and public.is_avisdoc_user());
