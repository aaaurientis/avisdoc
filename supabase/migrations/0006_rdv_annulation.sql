-- ============================================================================
-- 0006 — Annulation de rendez-vous par lien (sans compte)
-- ----------------------------------------------------------------------------
-- Chaque réservation reçoit un jeton d'annulation non devinable, inclus dans
-- le lien « Annuler mon rendez-vous » de l'e-mail de confirmation. L'annulation
-- passe par l'Edge Function rdv (action "annuler"), en service_role.
-- Additif et idempotent.
-- ============================================================================
alter table public.admin_rdv
  add column if not exists annul_token text not null default replace(gen_random_uuid()::text, '-', '');
