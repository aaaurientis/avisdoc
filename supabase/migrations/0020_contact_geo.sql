-- ============================================================================
-- Coordonnées géographiques des contacts réseau (visualisation cartographique).
--
-- On mémorise la latitude/longitude géocodée à partir de l'adresse pour ne
-- géocoder qu'UNE fois (le géocodage a lieu côté front, puis est mis en cache
-- ici). Aucune donnée nouvelle sensible : de simples coordonnées dérivées de
-- l'adresse professionnelle déjà présente.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

alter table public.admin_network_contacts
  add column if not exists lat double precision,
  add column if not exists lng double precision;
