-- ============================================================================
-- 0007 — Rappels de rendez-vous (suivi anti-doublon)
-- ----------------------------------------------------------------------------
-- Deux rappels e-mail par réservation : la veille (J-1) et une heure avant
-- (H-1). Les colonnes ci-dessous mémorisent l'envoi pour ne jamais doublonner.
-- La fonction planifiée « rdv-rappels » les renseigne. Additif, idempotent.
-- ============================================================================
alter table public.admin_rdv
  add column if not exists rappel_j1_le timestamptz,
  add column if not exists rappel_h1_le timestamptz;
