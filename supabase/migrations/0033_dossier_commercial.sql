-- ============================================================================
-- 0033 — Le dossier commercial d'un prospect
-- ----------------------------------------------------------------------------
-- L'approfondissement ne rendait qu'une ou deux phrases d'« angle d'approche ».
-- Il rend désormais un dossier : ce qu'on a appris de l'entreprise, qui aborder
-- et pourquoi, la phrase d'accroche, les arguments avec le fait qui les fonde,
-- les objections qu'elle opposera et ce qu'on répond, la formule qui lui va, et
-- ce qui reste à vérifier.
--
-- C'est ce qui sépare un moteur de recherche d'un soutien de vente : le
-- commercial doit pouvoir décrocher son téléphone après l'avoir lu.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

alter table public.admin_prospects
  add column if not exists dossier jsonb;

comment on column public.admin_prospects.dossier is
  'Dossier commercial produit à l''approfondissement : à retenir, qui aborder, accroche, arguments, objections, offre, à vérifier.';
