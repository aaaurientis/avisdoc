-- Personne ne peut plus vider la corbeille, sauf un super-admin.
--
-- Une fiche supprimée part à la corbeille et s'y garde. Le problème, c'est qu'on
-- pouvait ensuite l'y détruire : n'importe quel compte @avisdoc.fr avait le droit
-- d'effacer définitivement, et en lot. Un commercial fâché pouvait tout emporter.
--
-- La barrière est posée ICI, en base, et pas dans l'écran : la clé publique de
-- Supabase est lisible dans le code de la page, donc une protection côté navigateur
-- se contourne en appelant l'API directement. Seule une règle de la base tient.
--
-- Ce qui ne change pas : chacun continue de lire, créer, modifier, et de mettre à la
-- corbeille (qui est une modification — `deleted_at` —, pas une suppression).

-- ----------------------------------------------------------------------------
-- Qui est super-admin. Même forme que `is_avisdoc_user`, pour rester lisible.
-- ----------------------------------------------------------------------------
create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_superadmins s
    where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;

comment on function public.is_superadmin() is
  'Vrai si le compte connecté figure dans admin_superadmins. Sert à réserver la suppression définitive.';

-- ----------------------------------------------------------------------------
-- Prospection
-- ----------------------------------------------------------------------------
drop policy if exists "prospects_equipe" on public.admin_prospects;

create policy "prospects_equipe_lecture" on public.admin_prospects
  for select to authenticated using (public.is_avisdoc_user());
create policy "prospects_equipe_creation" on public.admin_prospects
  for insert to authenticated with check (public.is_avisdoc_user());
-- Mettre à la corbeille passe par ici : c'est une mise à jour de `deleted_at`.
create policy "prospects_equipe_modification" on public.admin_prospects
  for update to authenticated using (public.is_avisdoc_user()) with check (public.is_avisdoc_user());
create policy "prospects_destruction_superadmin" on public.admin_prospects
  for delete to authenticated using (public.is_superadmin());

-- ----------------------------------------------------------------------------
-- Pipeline. La politique de l'espace client (`clients_espace_membre`) n'est pas
-- touchée : elle ne donne que la lecture de SA propre fiche.
-- ----------------------------------------------------------------------------
drop policy if exists "avisdoc_all" on public.admin_clients;

create policy "clients_equipe_lecture" on public.admin_clients
  for select to authenticated using (public.is_avisdoc_user());
create policy "clients_equipe_creation" on public.admin_clients
  for insert to authenticated with check (public.is_avisdoc_user());
create policy "clients_equipe_modification" on public.admin_clients
  for update to authenticated using (public.is_avisdoc_user()) with check (public.is_avisdoc_user());
create policy "clients_destruction_superadmin" on public.admin_clients
  for delete to authenticated using (public.is_superadmin());

-- ----------------------------------------------------------------------------
-- Fichier client
-- ----------------------------------------------------------------------------
drop policy if exists "accounts_equipe" on public.admin_accounts;

create policy "accounts_equipe_lecture" on public.admin_accounts
  for select to authenticated using (public.is_avisdoc_user());
create policy "accounts_equipe_creation" on public.admin_accounts
  for insert to authenticated with check (public.is_avisdoc_user());
create policy "accounts_equipe_modification" on public.admin_accounts
  for update to authenticated using (public.is_avisdoc_user()) with check (public.is_avisdoc_user());
create policy "accounts_destruction_superadmin" on public.admin_accounts
  for delete to authenticated using (public.is_superadmin());
