-- ============================================================================
-- AvisDoc — Plateforme client · Déclencheurs de génération
-- ----------------------------------------------------------------------------
-- Le passage du statut CRM à 'signe' crée un job 'creation_espace'.
-- Une mise à jour du logo d'un client déjà signé crée un job 'maj_logo'.
--
-- La consommation des jobs est déclenchée hors base : un Supabase Database
-- Webhook sur INSERT de generation_jobs appelle le service de génération
-- (conteneur Scaleway). Ce fichier ne fait que produire les lignes de job.
-- ============================================================================

create or replace function creer_job_signature() returns trigger
language plpgsql as $$
begin
  -- Passage à 'signe' (et pas un simple UPDATE d'une ligne déjà signée)
  if new.statut_crm = 'signe' and old.statut_crm is distinct from 'signe' then
    if new.signe_le is null then
      new.signe_le := now();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_clients_signe_before on clients;
create trigger trg_clients_signe_before
  before update on clients
  for each row execute function creer_job_signature();

create or replace function creer_job_generation() returns trigger
language plpgsql as $$
begin
  -- Ouverture de l'espace au passage à 'signe'
  if new.statut_crm = 'signe' and old.statut_crm is distinct from 'signe' then
    insert into generation_jobs (client_id, type, logo_sha256)
    values (new.id, 'creation_espace', new.logo_sha256);

  -- Régénération quand le logo change sur un client déjà signé
  elsif new.statut_crm = 'signe'
        and new.logo_sha256 is not null
        and new.logo_sha256 is distinct from old.logo_sha256 then
    insert into generation_jobs (client_id, type, logo_sha256)
    values (new.id, 'maj_logo', new.logo_sha256);
  end if;
  return null;
end $$;

drop trigger if exists trg_clients_signe_after on clients;
create trigger trg_clients_signe_after
  after update on clients
  for each row execute function creer_job_generation();
