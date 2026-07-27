-- ============================================================================
-- 0009 — Contact référent : prénom / nom séparés
-- ----------------------------------------------------------------------------
-- Deux champs distincts sur le contact CRM pour éviter tout découpage
-- automatique du nom (source des erreurs côté Qonto). La colonne `name` est
-- conservée (affichage + compat) et vaut « prénom nom ». Additif et idempotent.
-- ============================================================================
alter table public.admin_client_contacts
  add column if not exists prenom text,
  add column if not exists nom    text;
