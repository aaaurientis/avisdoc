-- ============================================================================
-- 0016 — Annuaire réseau : réponse FHIR brute de l'Annuaire Santé
-- ----------------------------------------------------------------------------
-- Conservée telle quelle à la création du contact (Practitioner + exercices),
-- affichée dans l'onglet JSON de la fiche pour vérifier les champs source.
-- Additif et idempotent.
-- ============================================================================
alter table public.admin_network_contacts
  add column if not exists fhir_brut jsonb;
