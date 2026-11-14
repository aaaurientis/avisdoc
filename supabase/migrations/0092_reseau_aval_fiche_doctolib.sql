-- ============================================================================
-- 0092 — Réseau d'aval : informations relevées sur la fiche Doctolib
-- ----------------------------------------------------------------------------
-- Relevé par un opérateur avec le favori « Relever sur Doctolib » : l'opérateur
-- ouvre lui-même la fiche, clique, vérifie l'analyse dans le Hub, puis enregistre.
-- Aucun parcours automatique de Doctolib (décision du 14/11, à faire valider par
-- le DPO). Sont conservés : les rubriques utiles (expertises, conventionnement,
-- tarifs, langues, présentation…), la date et l'auteur du relevé ; les signaux
-- validés vont dans admin_reseau_signaux avec le lien de la fiche comme source.
--
-- Additif et rejouable. À exécuter dans le SQL Editor du projet admin
-- (wtovhzxymlqnfxyjxrdq), après 0091.
-- ============================================================================

alter table public.admin_reseau_praticiens
  add column if not exists doctolib_infos      jsonb,
  add column if not exists doctolib_releve_le  timestamptz,
  add column if not exists doctolib_releve_par text;

comment on column public.admin_reseau_praticiens.doctolib_infos is
  'Rubriques de la fiche Doctolib relevées par un opérateur : { specialite, expertises[], conventionnement, carteVitale, teleconsultation, tarifs[], langues[], presentation, adresses[], premierCreneau }.';
