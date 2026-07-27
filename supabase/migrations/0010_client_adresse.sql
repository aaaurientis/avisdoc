-- ============================================================================
-- 0010 — Adresse client : code postal / ville séparés
-- ----------------------------------------------------------------------------
-- Champs dédiés pour un envoi fiable vers Qonto (billing_address), sans
-- dépendre d'un découpage automatique de l'adresse libre. La colonne `adresse`
-- reste la valeur complète (affichage). Additif et idempotent.
-- ============================================================================
alter table public.admin_clients
  add column if not exists code_postal text,
  add column if not exists ville       text;
