-- ============================================================================
-- 0009 — Contact de facturation Qonto (prénom / nom / e-mail explicites)
-- ----------------------------------------------------------------------------
-- Champs séparés pour éviter tout découpage automatique du nom. Pré-remplis
-- depuis le 1er contact CRM côté UI, mais éditables. Additif et idempotent.
-- ============================================================================
alter table public.admin_clients
  add column if not exists contact_prenom text,
  add column if not exists contact_nom    text,
  add column if not exists contact_email  text;
