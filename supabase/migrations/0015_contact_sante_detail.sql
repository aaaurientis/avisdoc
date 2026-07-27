-- ============================================================================
-- 0015 — Annuaire réseau : savoir-faire, activités et diplômes (multiples)
-- ----------------------------------------------------------------------------
-- Un praticien peut avoir PLUSIEURS savoir-faire (spécialités), PLUSIEURS
-- activités (exercices : fonction + structure + coordonnées) et plusieurs
-- diplômes d'État. `specialite` (0014) reste le 1er savoir-faire (affichage).
-- Additif et idempotent.
-- ============================================================================
alter table public.admin_network_contacts
  add column if not exists savoir_faire text[],
  add column if not exists diplomes     text[],
  add column if not exists activites    jsonb; -- [{fonction, structure, ville, telephone, email}]
