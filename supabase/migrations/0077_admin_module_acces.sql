-- ============================================================================
-- 0065 — Le module « Admin » ouvre TOUT l'onglet Admin
-- ----------------------------------------------------------------------------
-- Jusqu'ici, consulter le journal d'audit (admin_audit_log) et gérer les droits
-- (admin_droits) était réservé aux super-admins (table admin_superadmins). Sur
-- demande : toute personne qui a le module « admin » coché dans admin_droits
-- doit avoir accès à l'onglet Admin COMPLET (Réglages + Droits d'accès +
-- Auditabilité), sans être super-admin.
--
-- Le super-admin reste un échelon distinct, géré uniquement au SQL Editor :
-- lui seul gère la liste admin_superadmins, et il a toujours tous les modules.
--
-- Côté application, la garde passe de isSuperAdmin à peut("admin"). Côté base,
-- la RLS reste la garde ultime : on l'élargit ici aux porteurs du module admin.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helper : l'utilisateur courant a-t-il accès à l'onglet Admin ?
--    Vrai s'il est super-admin OU s'il a le module 'admin' dans admin_droits.
--    SECURITY DEFINER pour lire les deux tables hors RLS (évite toute
--    récursion quand ce helper sert dans les policies d'admin_droits).
-- ----------------------------------------------------------------------------
create or replace function public.has_admin_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.admin_superadmins s
      where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
    or exists (
      select 1 from public.admin_droits d
      where lower(d.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and 'admin' = any(d.modules)
    )
$$;

-- ----------------------------------------------------------------------------
-- 2. Journal d'audit : lecture ouverte aux porteurs du module admin.
-- ----------------------------------------------------------------------------
drop policy if exists "audit_superadmin_read" on public.admin_audit_log;
drop policy if exists "audit_admin_read" on public.admin_audit_log;
create policy "audit_admin_read" on public.admin_audit_log
  for select to authenticated
  using (public.has_admin_access());

-- ----------------------------------------------------------------------------
-- 3. Droits d'accès : lecture de toutes les lignes + écriture ouvertes aux
--    porteurs du module admin (en plus de sa propre ligne, toujours lisible).
-- ----------------------------------------------------------------------------
drop policy if exists "droits_lecture" on public.admin_droits;
create policy "droits_lecture" on public.admin_droits
  for select to authenticated
  using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.has_admin_access()
  );

drop policy if exists "droits_ecriture" on public.admin_droits;
create policy "droits_ecriture" on public.admin_droits
  for all to authenticated
  using (public.has_admin_access())
  with check (public.has_admin_access());
