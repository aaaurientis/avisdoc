-- ============================================================================
-- 0072 — FullEnrich : les interlocuteurs d'une fiche et leurs coordonnées
-- ----------------------------------------------------------------------------
-- Olivier, 19/10 : à chaque recherche Merx, 2 interlocuteurs par fiche avec leur
-- e-mail pro ; « Chercher 2 autres contacts » une fois par fiche ; le mobile pour
-- un vrai client seulement ; plafond FIXE de 500 crédits par mois, alerte au-delà.
--
-- Une file d'attente (admin_fullenrich), traitée chaque minute par la fonction
-- « fullenrich » protégée par un secret, comme les rappels (0069).
--
-- Pour relever le plafond plus tard (ex. 1000) :
--   update public.admin_secrets_internes set valeur = '1000' where cle = 'fullenrich_plafond_mensuel';
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

create table if not exists public.admin_fullenrich (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  prospect_id   uuid not null references public.admin_prospects (id) on delete cascade,
  kind          text not null check (kind in ('contacts', 'contacts_plus', 'mobile')),
  statut        text not null default 'en_attente'
                check (statut in ('en_attente', 'lancement', 'enrichissement', 'termine', 'echec', 'bloque')),
  personne      text,
  enrichment_id text,
  credits       numeric not null default 0,
  -- Ce que la demande peut encore coûter, réservé au lancement (rendu quand on sait).
  reserve       numeric not null default 0,
  -- Le mois (Paris) où elle a été lancée : c'est lui qui compte pour le plafond.
  mois          text,
  message       text,
  demande_par   text,
  traite_le     timestamptz
);
create index if not exists admin_fullenrich_statut_idx on public.admin_fullenrich (statut, created_at);
create index if not exists admin_fullenrich_prospect_idx on public.admin_fullenrich (prospect_id);
-- Une seule première recherche et une seule « 2 autres contacts » par fiche.
create unique index if not exists admin_fullenrich_contacts_unique on public.admin_fullenrich (prospect_id) where kind = 'contacts';
create unique index if not exists admin_fullenrich_plus_unique on public.admin_fullenrich (prospect_id) where kind = 'contacts_plus';

alter table public.admin_fullenrich enable row level security;
drop policy if exists "fullenrich_equipe_lire" on public.admin_fullenrich;
create policy "fullenrich_equipe_lire" on public.admin_fullenrich
  for select to authenticated using (public.is_avisdoc_user());
drop policy if exists "fullenrich_equipe_demander" on public.admin_fullenrich;
create policy "fullenrich_equipe_demander" on public.admin_fullenrich
  for insert to authenticated with check (public.is_avisdoc_user() and statut = 'en_attente' and credits = 0);

-- Réserver une demande dans le plafond du mois, d'un seul geste et un appel à la fois
-- (verrou) : deux passages simultanés ne peuvent ni lancer la même demande, ni
-- dépasser ensemble le plafond. Rend « ok », « plafond » ou « pris ».
create or replace function public.fullenrich_reserver(p_id uuid, p_cout numeric, p_mois text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plafond numeric;
  v_engage  numeric;
  v_n       int;
begin
  perform pg_advisory_xact_lock(7240120);
  select coalesce(nullif(valeur, '')::numeric, 500) into v_plafond
    from public.admin_secrets_internes where cle = 'fullenrich_plafond_mensuel';
  v_plafond := coalesce(v_plafond, 500);
  select coalesce(sum(credits + reserve), 0) into v_engage
    from public.admin_fullenrich where mois = p_mois;
  if v_engage + p_cout > v_plafond then
    update public.admin_fullenrich
       set statut = 'bloque', traite_le = now(),
           message = 'Plafond FullEnrich du mois atteint (' || v_plafond || ' crédits) : demandez à l''administrateur de le relever.'
     where id = p_id and statut = 'en_attente';
    return 'plafond';
  end if;
  update public.admin_fullenrich
     set statut = 'lancement', reserve = p_cout, mois = p_mois
   where id = p_id and statut = 'en_attente';
  get diagnostics v_n = row_count;
  return case when v_n = 1 then 'ok' else 'pris' end;
end;
$$;
revoke execute on function public.fullenrich_reserver(uuid, numeric, text) from public, anon, authenticated;

insert into public.admin_secrets_internes (cle, valeur)
values ('fullenrich', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')),
       ('fullenrich_plafond_mensuel', '500')
on conflict (cle) do nothing;

select cron.unschedule('fullenrich')
 where exists (select 1 from cron.job where jobname = 'fullenrich');

select cron.schedule('fullenrich', '* * * * *', $$
  select net.http_post(
    url := 'https://wtovhzxymlqnfxyjxrdq.supabase.co/functions/v1/fullenrich',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-secret', (select valeur from public.admin_secrets_internes where cle = 'fullenrich')
    ),
    body := '{}'::jsonb
  );
$$);
