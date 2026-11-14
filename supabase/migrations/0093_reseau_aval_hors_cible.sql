-- ============================================================================
-- 0093 — Réseau d'aval : exclure un praticien « non concerné » (hors cible)
-- ----------------------------------------------------------------------------
-- Ex. un urologue entré par le code RPPS « chirurgie générale ». Comme toute
-- exclusion, elle est contrôlée sur le RPPS : le praticien n'est jamais réimporté.
-- Le motif reste distinct d'une opposition du praticien.
--
-- Additif et rejouable. À exécuter dans le SQL Editor du projet admin
-- (wtovhzxymlqnfxyjxrdq), après 0092.
-- ============================================================================

-- La table est protégée contre la modification : on remplace seulement la contrainte.
alter table public.admin_reseau_exclusions drop constraint if exists admin_reseau_exclusions_motif_check;
alter table public.admin_reseau_exclusions add constraint admin_reseau_exclusions_motif_check
  check (motif in ('hors_cible', 'opposition', 'esthetique_dominante', 'n_exerce_plus', 'autre'));
