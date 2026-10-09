-- ============================================================================
-- 0066 — « Général » reçoit les colonnes de tous les pipelines
-- ----------------------------------------------------------------------------
-- « Tous et Général, c'est redondant : supprime Tous, et Général tu lui mets les
--   mêmes colonnes que tous les pipelines, comme s'ils étaient fusionnés. » — 09/10.
--
-- Général devient la vue d'ensemble : il montre les affaires de tous les
-- pipelines. Ses colonnes donnent l'ordre de cette vue ; il lui manquait
-- Contacté, Présentation et RDV (pipelines Olivier et Stéphan).
--
-- Ordre retenu : Nouveau · Qualifié · Contacté · Présentation · Proposition ·
-- RDV · Négociation · Signé · Perdu. Rejouable.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

do $$
declare g uuid;
begin
  select id into g from public.admin_pipelines where nom = 'Général';
  if g is null then
    raise exception 'Pipeline « Général » introuvable';
  end if;

  insert into public.admin_pipeline_stages (label, position, tone, pipeline_id)
  select v.label, 0, v.tone, g
    from (values ('Contacté', 'teal'), ('Présentation', 'coral'), ('RDV', 'emerald')) as v(label, tone)
   where not exists (
     select 1 from public.admin_pipeline_stages s where s.pipeline_id = g and s.label = v.label
   );

  update public.admin_pipeline_stages s
     set position = o.position
    from (values ('Nouveau', 1), ('Qualifié', 2), ('Contacté', 3), ('Présentation', 4), ('Proposition', 5),
                 ('RDV', 6), ('Négociation', 7), ('Signé', 8), ('Perdu', 9)) as o(label, position)
   where s.pipeline_id = g and s.label = o.label;
end $$;
