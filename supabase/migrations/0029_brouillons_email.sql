-- ============================================================================
-- 0029 — Les brouillons d'e-mail se gardent
-- ----------------------------------------------------------------------------
-- Jusqu'ici Merx écrivait un brouillon, l'affichait, et l'oubliait : fermer la
-- fenêtre le perdait. La demande gardait le coût, pas le texte produit.
--
-- Le brouillon est le résultat de la demande : il se range donc avec elle.
-- La fiche peut alors montrer ce qui a déjà été écrit, et le rouvrir.
--
-- Un brouillon n'est PAS un échange : rien n'est parti tant que personne n'a
-- cliqué « Envoyer » dans sa propre messagerie. Il reste donc hors du fil de
-- suivi, dans l'onglet Approche.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

alter table public.admin_merx_demandes
  add column if not exists objet text,
  add column if not exists corps text;
