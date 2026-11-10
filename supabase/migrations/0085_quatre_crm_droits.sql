-- ============================================================================
-- 0085 — Les quatre CRM : un droit par CRM, et chaque fiche dans son CRM
-- ----------------------------------------------------------------------------
-- Olivier, 09/11 : « Commercial » devient CRM Entreprise (même droit, « commercial »),
-- et trois CRM s'ajoutent, chacun avec son droit : crm_collectivites, crm_mutuelles,
-- crm_intermediaires ; la CRM Synthèse a le sien, crm_synthese. « veille » reste la
-- Veille Marché. « demarche » (Veille à démarcher) n'est plus lu ; on ne l'efface pas.
--
-- 1. La veille se lit avec le droit de la Veille Marché OU celui d'un CRM (chaque CRM
--    a sa veille) : toutes les règles et fonctions qui demandaient « veille »
--    demandent désormais public.voit_la_veille().
-- 2. Chaque fiche (prospect, affaire, client) porte son CRM : « demarcher » (CRM Entreprise)
--    par défaut. Rien n'est déplacé ici : le rangement des fiches existantes dans les
--    autres CRM est une étape à part, validée par Olivier sur la liste.
-- 3. Ceux qui ont le module « admin » reçoivent les trois nouveaux CRM et la Synthèse ;
--    personne d'autre (Olivier coche ensuite dans Droits d'accès).
--
-- Idempotent : rejouable sans effet. À jouer APRÈS 0082, 0083 et 0084.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Lire la veille : Veille Marché ou un CRM.
-- ----------------------------------------------------------------------------
create or replace function public.voit_la_veille()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.a_le_module('veille') or public.a_le_module('commercial')
      or public.a_le_module('crm_collectivites') or public.a_le_module('crm_mutuelles')
      or public.a_le_module('crm_intermediaires') or public.a_le_module('crm_synthese');
$$;
grant execute on function public.voit_la_veille() to authenticated;

do $$
declare
  p record;
  u text;
  c text;
  ancien constant text := 'a_le_module(''veille''::text)';
  nouveau constant text := 'voit_la_veille()';
begin
  for p in
    select tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (qual like '%' || ancien || '%' or with_check like '%' || ancien || '%')
  loop
    u := replace(p.qual, ancien, nouveau);
    c := replace(p.with_check, ancien, nouveau);
    if u is not null and c is not null then
      execute format('alter policy %I on public.%I using (%s) with check (%s)', p.policyname, p.tablename, u, c);
    elsif u is not null then
      execute format('alter policy %I on public.%I using (%s)', p.policyname, p.tablename, u);
    else
      execute format('alter policy %I on public.%I with check (%s)', p.policyname, p.tablename, c);
    end if;
  end loop;
end $$;

-- Les fonctions de la veille (retirer, supprimer, réserver une question à Scope).
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosrc like '%a_le_module(''veille'')%'
      -- voit_la_veille() elle-même demande « veille » : la réécrire la ferait s'appeler sans fin.
      and p.proname <> 'voit_la_veille'
  loop
    execute replace(pg_get_functiondef(f), 'a_le_module(''veille'')', 'voit_la_veille()');
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Chaque fiche dans son CRM.
-- ----------------------------------------------------------------------------
alter table public.admin_prospects add column if not exists crm text not null default 'demarcher';
alter table public.admin_clients   add column if not exists crm text not null default 'demarcher';
alter table public.admin_accounts  add column if not exists crm text not null default 'demarcher';
alter table public.admin_prospects drop constraint if exists admin_prospects_crm_check;
alter table public.admin_prospects add constraint admin_prospects_crm_check
  check (crm in ('demarcher', 'collectivites', 'mutuelles', 'intermediaires'));
alter table public.admin_clients drop constraint if exists admin_clients_crm_check;
alter table public.admin_clients add constraint admin_clients_crm_check
  check (crm in ('demarcher', 'collectivites', 'mutuelles', 'intermediaires'));
-- Les recherches de Merx portent le CRM d'où elles partent : leurs fiches y sont rangées.
alter table public.admin_merx_demandes add column if not exists crm text not null default 'demarcher';
create index if not exists admin_prospects_crm on public.admin_prospects (crm);
create index if not exists admin_clients_crm on public.admin_clients (crm);
alter table public.admin_accounts drop constraint if exists admin_accounts_crm_check;
alter table public.admin_accounts add constraint admin_accounts_crm_check
  check (crm in ('demarcher', 'collectivites', 'mutuelles', 'intermediaires'));

-- ----------------------------------------------------------------------------
-- 3. Les admins reçoivent les nouveaux CRM.
-- ----------------------------------------------------------------------------
update public.admin_droits
set modules = (
      select array_agg(distinct x order by x)
      from unnest(modules || array['crm_collectivites', 'crm_mutuelles', 'crm_intermediaires', 'crm_synthese']) x
    ),
    updated_at = now()
where 'admin' = any (modules)
  and not (modules @> array['crm_collectivites', 'crm_mutuelles', 'crm_intermediaires', 'crm_synthese']);
