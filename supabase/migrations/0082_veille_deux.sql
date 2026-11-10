-- ============================================================================
-- 0082 — Veille : deux veilles, la commerciale et celle de marché (décision d'Olivier, 02/11/2026)
-- ----------------------------------------------------------------------------
-- La veille commerciale : À ne pas manquer, Entreprises, Collectivités, Intermédiaires, Mutuelle Assurance.
-- La veille de marché : Réseaux sociaux, Publications scientifiques, Concurrents, Événements, Ce qu'on dit de nous.
-- « Nouveautés » est débranché : ses rubriques ne sont plus cherchées ni utilisées pour ranger.
-- Le rapport du vendredi en fait deux (un mail par veille), sur la même recherche. Un seul budget, avec la part de
-- chaque veille dans CPR.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq). Rejouable.
-- ============================================================================

-- 1. « Nouveautés » débranché (rien n'est effacé : les rubriques se rallument depuis les Réglages).
update public.admin_veille_rubriques set actif = false where axe = 'nouveautes';
update public.admin_veille_expressions set actif = false
 where rubrique_id in (select id from public.admin_veille_rubriques where axe = 'nouveautes');

-- 1 bis. D'où vient vraiment une publication (presse, revue, officiel, site…), dit par l'agent au tri : la pastille
-- ne dit plus « Presse » pour tout ce que trouve Linkup. Les réseaux sociaux se reconnaissent à leur adresse.
alter table public.admin_veille_articles add column if not exists genre_source text;

-- 1 ter. « Intermédiaires » (Olivier, 03/11) : un nouvel onglet de la veille commerciale. Ses rubriques se créent
-- dans Réglages › Rubriques.
alter table public.admin_veille_rubriques drop constraint if exists admin_veille_rubriques_axe_check;
alter table public.admin_veille_rubriques add constraint admin_veille_rubriques_axe_check
  check (axe in ('demarcher','collectivites','intermediaires','mutuelles','evenements','concurrents','publications','nouveautes','nous'));

-- 2. À quelle veille appartient un axe.
create or replace function public.veille_de_axe(p_axe text)
returns text
language sql
immutable
as $$
  select case when p_axe in ('demarcher', 'collectivites', 'intermediaires', 'mutuelles') then 'commerciale'
              when p_axe in ('publications', 'concurrents', 'evenements', 'nous') then 'marche' end;
$$;

-- 3. Lu ou non lu : propre à chaque veille (un même rapport du vendredi en fait deux).
alter table public.admin_veille_lectures add column if not exists veille text not null default 'commerciale';
alter table public.admin_veille_lectures drop constraint if exists admin_veille_lectures_veille_check;
alter table public.admin_veille_lectures add constraint admin_veille_lectures_veille_check check (veille in ('commerciale', 'marche'));
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'admin_veille_lectures_pkey'
              and pg_get_constraintdef(oid) not like '%veille%') then
    alter table public.admin_veille_lectures drop constraint admin_veille_lectures_pkey;
    alter table public.admin_veille_lectures add constraint admin_veille_lectures_pkey primary key (rapport_id, email, veille);
  end if;
end $$;
-- Ce qui était lu avant les deux veilles l'est aussi dans celle de marché : une seule fois, au premier passage
-- (rejouée plus tard, la migration ne recopie pas ce qui n'a été lu que dans la veille commerciale).
insert into public.admin_veille_lectures (rapport_id, email, lu_le, veille)
select rapport_id, email, lu_le, 'marche' from public.admin_veille_lectures
 where veille = 'commerciale' and not exists (select 1 from public.admin_veille_lectures where veille = 'marche')
on conflict do nothing;

-- 4. Les points clés et les idées de posts d'une veille, écrits sans toucher à ceux de l'autre.
-- Les deux étapes peuvent finir en même temps : une seule mise à jour, la ligne verrouillée, relit la dernière version.
create or replace function public.veille_ecrire_points(p_rapport uuid, p_veille text, p_points jsonb, p_posts jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  update public.admin_veille_rapports
     set points_cles = coalesce((select jsonb_agg(x) from jsonb_array_elements(points_cles) x where coalesce(x->>'veille', 'commerciale') <> p_veille), '[]'::jsonb) || coalesce(p_points, '[]'::jsonb),
         posts       = coalesce((select jsonb_agg(x) from jsonb_array_elements(posts) x where coalesce(x->>'veille', 'marche') <> p_veille), '[]'::jsonb) || coalesce(p_posts, '[]'::jsonb)
   where id = p_rapport;
$$;
revoke all on function public.veille_ecrire_points(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.veille_ecrire_points(uuid, text, jsonb, jsonb) to service_role;

-- 5. Ce que chaque veille a coûté ce mois-ci (CPR). Les points clés sont comptés à leur veille ; le tri et
-- Perplexity d'une tournée ou d'un rapport, au prorata de ses publications retenues dans chaque veille ;
-- le reste (questions à Vigile, tournée sans publication retenue, anciennes Nouveautés) est « commun ».
create or replace function public.veille_cout_par_veille()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_debut timestamptz := date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
begin
  if not public.a_le_module('veille') then raise exception 'non autorisé'; end if;
  return (
    with couts as (
      select e.rapport_id, e.cout_usd c,
             case when e.genre = 'points_cles' then case when e.cle = 'points-marche' then 'marche' else 'commerciale' end end directe
        from public.admin_veille_etapes e
       where e.cout_usd > 0 and e.genre in ('tri', 'perplexity', 'points_cles') and e.updated_at >= v_debut),
    parts as (
      select a.rapport_id, public.veille_de_axe(rb.axe) veille, count(*)::numeric n
        from public.admin_veille_articles a
        left join public.admin_veille_rubriques rb on rb.nom = a.rubrique
       where a.verdict = 'retenu' and a.rapport_id in (select rapport_id from couts)
       group by 1, 2),
    tot as (select rapport_id, sum(n) t from parts group by 1),
    reparti as (
      select directe veille, c from couts where directe is not null
      union all
      select p.veille, c.c * p.n / t.t from couts c join tot t using (rapport_id) join parts p using (rapport_id) where c.directe is null
      union all
      select null, c.c from couts c left join tot t using (rapport_id) where c.directe is null and t.rapport_id is null
      union all
      select null, q.cout_usd from public.admin_veille_questions q where q.cout_usd > 0 and q.pose_le >= v_debut)
    select jsonb_build_object(
      'commerciale', coalesce(sum(c) filter (where veille = 'commerciale'), 0),
      'marche', coalesce(sum(c) filter (where veille = 'marche'), 0),
      'commun', coalesce(sum(c) filter (where veille is null), 0))
      from reparti);
end;
$$;
revoke all on function public.veille_cout_par_veille() from public, anon;
grant execute on function public.veille_cout_par_veille() to authenticated, service_role;
