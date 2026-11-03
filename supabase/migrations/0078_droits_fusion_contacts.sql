-- ============================================================================
-- 0078 — Fusion des droits « Contacts Médicaux » et « Requérants »
-- ----------------------------------------------------------------------------
-- Le module « infirmieres » (Requérants) disparaît : « contacts » (Contacts
-- Médicaux) couvre désormais aussi les Requérants. On met à niveau les lignes
-- existantes d'admin_droits pour ne perdre aucun accès :
--   1. toute ligne qui avait « infirmieres » sans « contacts » reçoit « contacts » ;
--   2. on retire « infirmieres », devenu sans effet.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

-- 1. Les porteurs de « infirmieres » qui n'avaient pas « contacts » le reçoivent.
update public.admin_droits
set modules = array_remove(modules, 'infirmieres') || array['contacts'],
    updated_at = now()
where 'infirmieres' = any(modules)
  and not ('contacts' = any(modules));

-- 2. On nettoie le module obsolète partout où il subsiste.
update public.admin_droits
set modules = array_remove(modules, 'infirmieres'),
    updated_at = now()
where 'infirmieres' = any(modules);
