-- ============================================================================
-- AvisDoc — Plateforme client · Administrateurs par domaine
-- ----------------------------------------------------------------------------
-- Règle métier : tout compte dont l'adresse e-mail est en @avisdoc.fr est
-- administrateur. La table `admins` est conservée comme liste d'exception
-- (ex. prestataire externe), combinée en OR.
-- ============================================================================

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select
    coalesce(lower(auth.jwt() ->> 'email') like '%@avisdoc.fr', false)
    or exists (select 1 from admins where auth_user_id = auth.uid());
$$;
