-- Lot 6 — échéances, conservation et éligibilité des infirmières requérantes.
--
--   RI-03 : la copie de pièce d'identité (voie de secours) est détruite 30 jours
--           après son dépôt — purge automatique, chaque nuit.
--   RI-01 : vue d'éligibilité à l'affectation (active + RCP & URSSAF valides et
--           non échues) consommée par le flux de téléexpertise.
--   Rappels / expiration des attestations : gérés par la fonction req-echeances
--           (colonne de déduplication echeance_rappel_le ci-dessous).
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).

-- ----------------------------------------------------------------------------
-- 1. Déduplication des rappels d'échéance (un rappel par pièce validée).
-- ----------------------------------------------------------------------------
alter table public.req_pieces
  add column if not exists echeance_rappel_le timestamptz;

-- ----------------------------------------------------------------------------
-- 2. RI-01 — vue d'éligibilité à l'affectation.
--    security_invoker : la RLS des tables sous-jacentes s'applique (l'admin voit
--    tout, l'infirmière ne voit que la sienne).
-- ----------------------------------------------------------------------------
create or replace view public.req_eligibilite
  with (security_invoker = true) as
  with derniere as (
    select distinct on (inscription_id, type)
           inscription_id, type, etat, date_fin
      from public.req_pieces
     order by inscription_id, type, version desc
  )
  select
    i.id as inscription_id,
    i.etat,
    (
      i.etat = 'active'
      and exists (
        select 1 from derniere d
         where d.inscription_id = i.id and d.type = 'rcp'
           and d.etat = 'validee' and d.date_fin >= current_date
      )
      and exists (
        select 1 from derniere d
         where d.inscription_id = i.id and d.type = 'urssaf'
           and d.etat = 'validee' and d.date_fin >= current_date
      )
    ) as eligible,
    (
      select min(d.date_fin) from derniere d
       where d.inscription_id = i.id and d.etat = 'validee' and d.date_fin is not null
    ) as prochaine_echeance
  from public.req_inscriptions i;

grant select on public.req_eligibilite to authenticated;

-- ----------------------------------------------------------------------------
-- 3. RI-03 — purge de la copie d'identité à J+30.
--    Détruit le fichier dans le bucket et efface le chemin ; trace dans l'histo.
--    security definer : la fonction efface là où la policy réserve aux fonctions.
-- ----------------------------------------------------------------------------
create or replace function public.purger_identites_req()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  limite timestamptz := now() - interval '30 days';
  n integer;
begin
  -- Trace d'abord (sur les pièces encore porteuses d'un fichier et assez âgées).
  insert into public.req_historique (inscription_id, acteur, action, piece_id, detail)
  select inscription_id, 'systeme', 'identite_purgee', id, jsonb_build_object('regle', 'RI-03')
    from public.req_pieces
   where type = 'identite' and storage_path is not null and deposee_le < limite;

  -- Supprime les fichiers du bucket privé.
  delete from storage.objects
   where bucket_id = 'req-identite'
     and name in (
       select storage_path from public.req_pieces
        where type = 'identite' and storage_path is not null and deposee_le < limite
     );

  -- Efface les chemins (la pièce reste, sans sa copie).
  update public.req_pieces
     set storage_path = null
   where type = 'identite' and storage_path is not null and deposee_le < limite;
  get diagnostics n = row_count;

  return coalesce(n, 0);
end;
$$;

revoke all on function public.purger_identites_req() from public, anon, authenticated;

-- Chaque nuit à 3 h 30 (après la purge corbeille à 3 h 15).
select cron.unschedule('purge-identites-req')
 where exists (select 1 from cron.job where jobname = 'purge-identites-req');

select cron.schedule(
  'purge-identites-req',
  '30 3 * * *',
  $cron$ select public.purger_identites_req() $cron$
);
