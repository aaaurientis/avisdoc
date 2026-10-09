-- ============================================================================
-- 0067 — Un tronc commun de colonnes pour tous les pipelines
-- ----------------------------------------------------------------------------
-- « Pour tous les pipelines tu fais un tronc commun de colonnes. Tu prends les
--   colonnes du pipeline d'Olivier. Nouveau est Qualifié, on remplace. Proposition
--   tu rajoutes pour tous entre RDV et Signé, Proposition remplace ainsi
--   Négociation. » — Olivier, 09/10.
--
-- Le tronc commun : Qualifié · Contacté · Présentation · RDV · Proposition ·
-- Signé · Perdu. C'est un point de départ : chaque pipeline peut ensuite ajouter,
-- renommer ou retirer une colonne. Les colonnes propres à un pipeline restent,
-- rangées après le tronc.
--
-- Pour chaque pipeline :
--   · les affaires en « Nouveau » passent en « Qualifié », celles en
--     « Négociation » en « Proposition » (l'historique des étapes le note) ;
--   · les colonnes « Nouveau » et « Négociation » disparaissent ;
--   · les colonnes du tronc qui manquent sont créées ;
--   · le tronc est remis dans l'ordre, les autres colonnes à la suite.
-- Rejouable.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

do $$
declare p record;
begin
  for p in select id from public.admin_pipelines loop
    -- 1. Les affaires suivent la fusion des colonnes.
    update public.admin_clients set stage = 'Qualifié'    where pipeline_id = p.id and stage = 'Nouveau';
    update public.admin_clients set stage = 'Proposition' where pipeline_id = p.id and stage = 'Négociation';

    -- 2. Les deux colonnes fusionnées disparaissent.
    delete from public.admin_pipeline_stages
     where pipeline_id = p.id and label in ('Nouveau', 'Négociation');

    -- 3. Le tronc commun, complété là où il manque.
    insert into public.admin_pipeline_stages (label, position, tone, pipeline_id)
    select t.label, 0, t.tone, p.id
      from (values ('Qualifié', 'slate'), ('Contacté', 'teal'), ('Présentation', 'coral'), ('RDV', 'emerald'),
                   ('Proposition', 'coral'), ('Signé', 'violet'), ('Perdu', 'rose')) as t(label, tone)
     where not exists (
       select 1 from public.admin_pipeline_stages s where s.pipeline_id = p.id and s.label = t.label
     );

    -- 4. Le tronc dans l'ordre, puis les colonnes propres au pipeline.
    update public.admin_pipeline_stages s
       set position = o.position
      from (values ('Qualifié', 1), ('Contacté', 2), ('Présentation', 3), ('RDV', 4),
                   ('Proposition', 5), ('Signé', 6), ('Perdu', 7)) as o(label, position)
     where s.pipeline_id = p.id and s.label = o.label;

    update public.admin_pipeline_stages s
       set position = 7 + r.rang
      from (
        select id, row_number() over (order by position, label) as rang
          from public.admin_pipeline_stages
         where pipeline_id = p.id
           and label not in ('Qualifié', 'Contacté', 'Présentation', 'RDV', 'Proposition', 'Signé', 'Perdu')
      ) r
     where s.id = r.id;
  end loop;
end $$;
