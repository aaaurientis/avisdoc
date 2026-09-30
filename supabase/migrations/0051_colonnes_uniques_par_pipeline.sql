-- ============================================================================
-- 0051 — Un nom de colonne est unique DANS son pipeline, pas dans toute la base
-- ----------------------------------------------------------------------------
-- « Elles sont où les colonnes du pipeline d'Olivier ? »
--
-- Nulle part : elles n'ont jamais été créées. `admin_pipeline_stages` portait un
-- UNIQUE (label) datant du temps où il n'existait qu'un seul tableau. Le nouveau
-- pipeline demandait « Nouveau », « Qualifié », « Proposition », « Signé »,
-- « Perdu » — cinq noms déjà pris par « Général ». Les cinq insertions étant
-- faites d'un bloc, la base a tout refusé, et le pipeline est resté vide.
--
-- Deux tableaux ont évidemment le droit d'avoir chacun leur colonne « Signé ».
-- L'unicité doit se lire à l'intérieur d'un pipeline, et nulle part ailleurs.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

alter table public.admin_pipeline_stages
  drop constraint if exists admin_pipeline_stages_label_key;

create unique index if not exists admin_pipeline_stages_label_par_pipeline
  on public.admin_pipeline_stages (pipeline_id, label);
