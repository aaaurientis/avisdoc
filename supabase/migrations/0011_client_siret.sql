-- ============================================================================
-- 0011 — SIRET du client (siège)
-- ----------------------------------------------------------------------------
-- Le SIRET (14 chiffres) est l'identifiant que Qonto valide automatiquement
-- pour une entreprise française. Capté depuis Pappers (siege.siret) et envoyé
-- à Qonto en priorité (repli sur le SIREN). Additif et idempotent.
-- ============================================================================
alter table public.admin_clients
  add column if not exists siret text;
