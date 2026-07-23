-- ============================================================================
-- AvisDoc — Plateforme client · RLS (Row Level Security)
-- ----------------------------------------------------------------------------
-- Cloisonnement des trois niveaux d'accès (cadrage §7) :
--   public  -> lisible sans authentification (rôles anon + authenticated)
--   client  -> lisible par l'utilisateur rattaché au client, uniquement
--   hds     -> jamais servi ici (aucune ligne, aucune politique de lecture)
--
-- Les écritures dans documents/generation_jobs se font par le service de
-- génération avec la clé service_role (rôle Postgres à BYPASSRLS) : aucune
-- politique d'INSERT/UPDATE n'est donc accordée aux rôles anon/authenticated
-- sur ces tables.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER pour ne pas boucler sur la RLS des tables lues)
-- ----------------------------------------------------------------------------
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where auth_user_id = auth.uid());
$$;

create or replace function current_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from utilisateurs_client
  where auth_user_id = auth.uid()
  limit 1;
$$;

-- ----------------------------------------------------------------------------
-- Activation RLS
-- ----------------------------------------------------------------------------
alter table admins              enable row level security;
alter table clients             enable row level security;
alter table domaines            enable row level security;
alter table utilisateurs_client enable row level security;
alter table documents           enable row level security;
alter table generation_jobs     enable row level security;

-- ----------------------------------------------------------------------------
-- admins
-- ----------------------------------------------------------------------------
drop policy if exists admins_lecture on admins;
create policy admins_lecture on admins
  for select to authenticated using (is_admin());

-- ----------------------------------------------------------------------------
-- clients
-- ----------------------------------------------------------------------------
drop policy if exists clients_admin_tout on clients;
create policy clients_admin_tout on clients
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists clients_membre_lecture on clients;
create policy clients_membre_lecture on clients
  for select to authenticated using (id = current_client_id());

-- ----------------------------------------------------------------------------
-- domaines
-- ----------------------------------------------------------------------------
drop policy if exists domaines_admin_tout on domaines;
create policy domaines_admin_tout on domaines
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists domaines_membre_lecture on domaines;
create policy domaines_membre_lecture on domaines
  for select to authenticated using (client_id = current_client_id());

-- ----------------------------------------------------------------------------
-- utilisateurs_client
-- ----------------------------------------------------------------------------
drop policy if exists uc_admin_tout on utilisateurs_client;
create policy uc_admin_tout on utilisateurs_client
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists uc_membre_lecture on utilisateurs_client;
create policy uc_membre_lecture on utilisateurs_client
  for select to authenticated using (client_id = current_client_id());

-- ----------------------------------------------------------------------------
-- documents
--   Lecture publique : tout le monde (anon inclus) voit les documents 'public'.
--   Lecture client   : l'utilisateur rattaché voit 'public' + 'client' de SON
--                       client. 'hds' n'est jamais atteignable (aucune politique
--                       ne le sélectionne, et la contrainte CHECK l'interdit).
-- ----------------------------------------------------------------------------
drop policy if exists documents_public_lecture on documents;
create policy documents_public_lecture on documents
  for select to anon, authenticated using (acces = 'public');

drop policy if exists documents_client_lecture on documents;
create policy documents_client_lecture on documents
  for select to authenticated
  using (client_id = current_client_id() and acces in ('public', 'client'));

drop policy if exists documents_admin_lecture on documents;
create policy documents_admin_lecture on documents
  for select to authenticated using (is_admin());

-- ----------------------------------------------------------------------------
-- generation_jobs : réservé aux admins en lecture. Le service (service_role)
-- gère l'écriture en contournant la RLS.
-- ----------------------------------------------------------------------------
drop policy if exists jobs_admin_lecture on generation_jobs;
create policy jobs_admin_lecture on generation_jobs
  for select to authenticated using (is_admin());
