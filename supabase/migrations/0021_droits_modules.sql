-- ============================================================================
-- 0021 — Droits d'accès par module (menu Hub à 2 niveaux)
-- ----------------------------------------------------------------------------
-- Modules de 1er niveau : crm (Clients et Prospection), contacts (Contacts
-- Médicaux), marketing, finance (Facturation), documents, admin.
-- Le tableau de bord est accessible à tous (widgets filtrés par module).
--
-- Règles :
--   • un super-admin (admin_superadmins) a TOUS les modules, gère les droits ;
--   • un utilisateur listé ici a exactement ses `modules` ;
--   • un utilisateur @avisdoc.fr non listé a les modules par défaut
--     (tout sauf admin) — appliqué côté application.
-- ============================================================================
create table if not exists public.admin_droits (
  email      text primary key,
  modules    text[] not null default array['crm','contacts','marketing','finance','documents'],
  updated_at timestamptz not null default now()
);

alter table public.admin_droits enable row level security;

-- Lecture : sa propre ligne ; les super-admins lisent tout.
drop policy if exists "droits_lecture" on public.admin_droits;
create policy "droits_lecture" on public.admin_droits
  for select to authenticated
  using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or exists (
      select 1 from public.admin_superadmins s
      where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- Écriture : super-admins uniquement.
drop policy if exists "droits_ecriture" on public.admin_droits;
create policy "droits_ecriture" on public.admin_droits
  for all to authenticated
  using (
    exists (
      select 1 from public.admin_superadmins s
      where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
  with check (
    exists (
      select 1 from public.admin_superadmins s
      where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );
