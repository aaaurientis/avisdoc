-- ============================================================================
-- 0017 — Annuaire réseau : rôles multiples par contact
-- ----------------------------------------------------------------------------
-- Un contact peut être à la fois Requérant, Expert et/ou Réseau d'Aval.
-- `types` porte la liste ; `type` (0001) reste le rôle principal (= 1er de la
-- liste) pour compat. Backfill depuis l'existant. Additif et idempotent.
-- ============================================================================
alter table public.admin_network_contacts
  add column if not exists types text[];

update public.admin_network_contacts
set types = array[type]
where types is null and type is not null;
