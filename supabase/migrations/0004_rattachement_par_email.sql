-- ============================================================================
-- 0004 — Rattachement de l'espace client par e-mail (et non par auth_user_id)
-- ----------------------------------------------------------------------------
-- Motif : admin_client_espace_users.auth_user_id peut se retrouver NULL
--   * FK « on delete set null » : si un compte auth est supprimé/recréé pendant
--     les tests, la liaison est effacée ;
--   * le renvoi en magic link ne repose pas l'auth_user_id.
-- Résultat : espace_client_id() ne trouvait plus la ligne → « Compte non
-- rattaché » alors que l'utilisateur est bien déclaré.
--
-- L'e-mail est la clé naturelle : l'admin déclare des e-mails, l'utilisateur se
-- connecte avec (e-mail vérifié par le lien magique). On rattache donc dessus.
-- Additif et idempotent.
-- ============================================================================

-- 1. Helper : id du client de l'utilisateur courant, par e-mail du JWT.
create or replace function public.espace_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from admin_client_espace_users
  where lower(email) = lower(auth.jwt() ->> 'email')
  limit 1;
$$;

-- 2. L'utilisateur d'espace peut lire la fiche de SON client (nom de société).
alter table public.admin_clients enable row level security;
drop policy if exists clients_espace_membre on public.admin_clients;
create policy clients_espace_membre on public.admin_clients
  for select to authenticated using (id = public.espace_client_id());

-- 3. Marquer la première connexion sans ouvrir d'UPDATE aux clients
--    (éviter toute réassignation de client_id → escalade).
create or replace function public.marquer_premiere_connexion() returns void
language sql security definer set search_path = public as $$
  update admin_client_espace_users
  set premiere_connexion_le = coalesce(premiere_connexion_le, now())
  where lower(email) = lower(auth.jwt() ->> 'email');
$$;
grant execute on function public.marquer_premiere_connexion() to authenticated;

-- 4. Confort : reposer auth_user_id par e-mail quand il est absent (pour info
--    admin), via une fonction que l'app appelle après connexion.
create or replace function public.lier_auth_user() returns void
language sql security definer set search_path = public as $$
  update admin_client_espace_users
  set auth_user_id = auth.uid()
  where lower(email) = lower(auth.jwt() ->> 'email')
    and (auth_user_id is null or auth_user_id <> auth.uid());
$$;
grant execute on function public.lier_auth_user() to authenticated;
