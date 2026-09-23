-- ============================================================================
-- 0039 — Un référent par fiche, ce qui se partage, et la corbeille qui se vide
-- ----------------------------------------------------------------------------
-- Quatre changements demandés le 23/09, dans un seul SQL à coller.
--
--   1. La corbeille se vide toute seule, chaque nuit, trente jours glissants
--      après la mise à la corbeille de chaque fiche.
--   2. Le coût des demandes Merx devient visible par l'équipe : les prospects
--      sont partagés, leur coût doit l'être aussi.
--   3. Le texte d'un débrief devient lisible par l'équipe ; l'enregistrement
--      vocal, lui, reste à celui qui l'a dicté.
--   4. Chaque fiche porte le nom de son référent commercial, qui la suit du
--      prospect à l'affaire puis au fichier client.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. La corbeille se vide seule
-- ----------------------------------------------------------------------------
-- Jusqu'ici la purge se déclenchait à l'ouverture de l'écran Corbeille, et la
-- destruction étant réservée au super-admin, elle ne faisait rien pour tous les
-- autres : une fiche jetée pouvait rester indéfiniment. Elle part maintenant
-- trente jours après SA propre mise à la corbeille, sans que personne ait à
-- ouvrir quoi que ce soit.
--
-- La fonction s'exécute avec les droits de son propriétaire : c'est ce qui lui
-- permet de détruire là où la politique réserve la destruction au super-admin.
create or replace function public.purger_corbeille()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  limite timestamptz := now() - interval '30 days';
  total integer := 0;
  n integer;
begin
  -- Les enregistrements des débriefs partent avec eux : sans cela, la voix
  -- resterait au coffre indéfiniment, invisible et payée.
  delete from storage.objects
   where bucket_id = 'admin-dictee'
     and name in (select audio_path from public.admin_notes_dictees
                   where deleted_at < limite and audio_path is not null);

  delete from public.admin_notes_dictees where deleted_at < limite;
  get diagnostics n = row_count; total := total + n;

  delete from public.admin_prospects where deleted_at < limite;
  get diagnostics n = row_count; total := total + n;

  delete from public.admin_clients where deleted_at < limite;
  get diagnostics n = row_count; total := total + n;

  delete from public.admin_accounts where deleted_at < limite;
  get diagnostics n = row_count; total := total + n;

  return total;
end;
$$;

-- Personne ne l'appelle à la main : seule la tâche de nuit s'en sert.
revoke all on function public.purger_corbeille() from public, anon, authenticated;

-- 3 h 15, pour ne pas croiser la purge du journal d'audit qui tourne à 3 h.
select cron.unschedule('purge-corbeille-commercial')
 where exists (select 1 from cron.job where jobname = 'purge-corbeille-commercial');

select cron.schedule(
  'purge-corbeille-commercial',
  '15 3 * * *',
  $cron$ select public.purger_corbeille() $cron$
);


-- ----------------------------------------------------------------------------
-- 2. Le coût des demandes Merx, visible par l'équipe
-- ----------------------------------------------------------------------------
-- Les demandes n'étaient lisibles que par leur auteur. Comme les prospects,
-- eux, sont partagés, un prospect trouvé par un collègue apparaissait avec un
-- coût nul : l'écran « coût d'acquisition par prospect » était faux dès que
-- deux personnes cherchaient.
--
-- On sépare donc la lecture — l'équipe — de l'écriture, qui reste à l'auteur :
-- on regarde ce que l'équipe a dépensé, on ne touche pas au travail d'un autre.
drop policy if exists "merx_demandes_proprietaire" on public.admin_merx_demandes;

create policy "merx_demandes_lecture_equipe" on public.admin_merx_demandes
  for select to authenticated using (public.is_avisdoc_user());
create policy "merx_demandes_creation" on public.admin_merx_demandes
  for insert to authenticated
  with check (public.is_avisdoc_user() and lower(requested_by) = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy "merx_demandes_modification" on public.admin_merx_demandes
  for update to authenticated
  using (public.is_avisdoc_user() and lower(requested_by) = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (public.is_avisdoc_user() and lower(requested_by) = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy "merx_demandes_suppression" on public.admin_merx_demandes
  for delete to authenticated
  using (public.is_avisdoc_user() and lower(requested_by) = lower(coalesce(auth.jwt() ->> 'email', '')));


-- ----------------------------------------------------------------------------
-- 3. Le débrief : le texte se partage, la voix reste personnelle
-- ----------------------------------------------------------------------------
-- Ce qu'un commercial rapporte d'un rendez-vous intéresse toute l'équipe. Sa
-- voix, non : c'est sa parole, dite en sortant, sans être relue. Le texte de la
-- retranscription devient donc lisible par l'équipe ; l'enregistrement ne
-- s'écoute que par celui qui l'a dicté.
drop policy if exists "notes_dictees_proprietaire" on public.admin_notes_dictees;

create policy "notes_lecture_equipe" on public.admin_notes_dictees
  for select to authenticated using (public.is_avisdoc_user());
create policy "notes_creation" on public.admin_notes_dictees
  for insert to authenticated
  with check (public.is_avisdoc_user() and lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy "notes_modification" on public.admin_notes_dictees
  for update to authenticated
  using (public.is_avisdoc_user() and lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (public.is_avisdoc_user() and lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy "notes_suppression" on public.admin_notes_dictees
  for delete to authenticated
  using (public.is_avisdoc_user() and lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- L'enregistrement est rangé sous « adresse@avisdoc.fr/identifiant.webm » : le
-- premier dossier du chemin dit à qui il appartient, et c'est ce qui le protège.
drop policy if exists "avisdoc_read_dictee" on storage.objects;

create policy "dictee_ecoute_proprietaire" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'admin-dictee'
    and public.is_avisdoc_user()
    and (storage.foldername(name))[1] = lower(coalesce(auth.jwt() ->> 'email', ''))
  );


-- ----------------------------------------------------------------------------
-- 4. Le référent commercial
-- ----------------------------------------------------------------------------
-- « Comme un prospect devient client, on doit mettre le nom du commercial qui
-- devient le référent de ce client. » La fiche porte donc le nom de celui qui
-- la suit, et le garde en changeant d'étape.
alter table public.admin_prospects add column if not exists referent text;
alter table public.admin_clients   add column if not exists referent text;
alter table public.admin_accounts  add column if not exists referent text;

-- Ce qui existe déjà prend pour référent celui qui l'a trouvé, quand on le sait.
update public.admin_prospects set referent = owner_email
 where referent is null and owner_email is not null;

update public.admin_clients c set referent = p.referent
  from public.admin_prospects p
 where p.converted_client_id = c.id and c.referent is null and p.referent is not null;

update public.admin_accounts a set referent = c.referent
  from public.admin_clients c
 where a.client_id = c.id and a.referent is null and c.referent is not null;

create index if not exists admin_prospects_referent_idx on public.admin_prospects (referent);
create index if not exists admin_clients_referent_idx   on public.admin_clients (referent);
create index if not exists admin_accounts_referent_idx  on public.admin_accounts (referent);

-- Pour choisir un référent, il faut la liste des collègues. La table des droits
-- ne se lit que par soi-même ou par le super-admin : on expose donc les seules
-- adresses, et seulement aux comptes AvisDoc.
create or replace view public.admin_membres as
  select email from public.admin_droits where public.is_avisdoc_user();

grant select on public.admin_membres to authenticated;

-- Le référent suit la fiche sans qu'on ait à le ressaisir.
--
-- On le pose en base plutôt que dans l'écran : une affaire peut naître d'un clic
-- dans le Pipeline, d'un débrief rangé par Merx ou d'un import, et le référent
-- doit suivre dans les trois cas.

-- Fichier client créé depuis une affaire : il reprend son référent.
create or replace function public.referent_depuis_affaire()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.referent is null and new.client_id is not null then
    select c.referent into new.referent from public.admin_clients c where c.id = new.client_id;
  end if;
  return new;
end;
$$;

drop trigger if exists admin_accounts_referent on public.admin_accounts;
create trigger admin_accounts_referent
  before insert on public.admin_accounts
  for each row execute function public.referent_depuis_affaire();

-- Prospect passé au Pipeline : le lien se pose APRÈS la création de l'affaire,
-- c'est donc à ce moment-là qu'on reporte le référent.
create or replace function public.referent_vers_affaire()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.converted_client_id is not null
     and new.converted_client_id is distinct from old.converted_client_id
     and new.referent is not null then
    update public.admin_clients
       set referent = new.referent
     where id = new.converted_client_id and referent is null;
  end if;
  return new;
end;
$$;

drop trigger if exists admin_prospects_referent on public.admin_prospects;
create trigger admin_prospects_referent
  after update of converted_client_id on public.admin_prospects
  for each row execute function public.referent_vers_affaire();
