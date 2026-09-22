-- ============================================================================
-- 0030 — Savoir quel modèle a travaillé
-- ----------------------------------------------------------------------------
-- Merx n'appelle plus le même modèle selon ce qu'on lui demande : Sonnet pour
-- prospecter, Opus pour approfondir. Leurs tarifs diffèrent d'un facteur cinq.
--
-- Sans cette colonne, l'écran des coûts compte tout au tarif du modèle par
-- défaut : le chiffre affiché serait faux dès le premier approfondissement.
-- On enregistre donc le modèle avec la consommation, comme un ticket de caisse
-- garde le prix pratiqué ce jour-là.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

alter table public.admin_merx_demandes
  add column if not exists model text;

comment on column public.admin_merx_demandes.model is
  'Modèle réellement appelé pour cette demande ; sert au calcul du coût.';
