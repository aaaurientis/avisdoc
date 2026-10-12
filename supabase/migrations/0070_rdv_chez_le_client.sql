-- ============================================================================
-- 0070 — Rendez-vous chez le client, et retour en arrière si on l'annule
-- ----------------------------------------------------------------------------
-- « En visio, sur place, ou chez le client : il faut ajouter chez le client. »
-- « Si je supprime le rendez-vous, il faut qu'il retourne dans sa case d'avant. »
--   — Olivier, 12/10.
--
-- Un rendez-vous programmé qui a fait passer la fiche en « RDV » retient la
-- colonne où elle était (`colonne_avant`). Le supprimer l'y renvoie.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

alter table public.admin_echanges add column if not exists colonne_avant text;

alter table public.admin_echanges drop constraint if exists admin_echanges_rdv_mode_check;
alter table public.admin_echanges
  add constraint admin_echanges_rdv_mode_check check (rdv_mode is null or rdv_mode in ('visio', 'sur_place', 'chez_client'));
