-- ============================================================================
-- 0047 — On ne jette plus rien de ce que le registre publie
-- ----------------------------------------------------------------------------
-- « Je ne comprends pas que tu supprimais les infos que tu récupérais sur les
--   prospects. C'est inadmissible. »
--
-- Il a raison. La recherche recevait, dans une seule réponse et sans rien payer,
-- le dirigeant avec sa fonction, l'adresse complète, le chiffre d'affaires,
-- l'ancienneté, le SIRET, les conventions collectives, les démarches déclarées.
-- Elle n'en gardait que le nom, la ville et le code d'activité — au motif qu'une
-- recherche devait rendre une « fiche légère » que l'approfondissement viendrait
-- remplir plus tard, en payant un modèle pour aller chercher ailleurs ce qui
-- était déjà là.
--
-- Le chiffre d'affaires de Colas France, quatre milliards sept cents millions,
-- arrivait dans la même ligne que son nom. Il partait à la poubelle.
--
-- Cette colonne recueille désormais tout ce que l'État publie et que l'écran ne
-- sait pas encore montrer : finances par exercice, date de création, catégorie
-- INSEE, SIRET, coordonnées géographiques, conventions collectives, numéro de
-- TVA, nature juridique, nombre total d'établissements.
--
-- Rien ne s'affiche encore à partir d'elle. C'est voulu : ce qui est reçu doit
-- d'abord être gardé. On décidera ensuite de ce qu'on en montre.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

alter table public.admin_prospects
  add column if not exists registre jsonb;

comment on column public.admin_prospects.registre is
  'Tout ce que l''annuaire officiel publie et que la fiche ne montre pas encore : finances, date de création, catégorie, SIRET, coordonnées, conventions collectives, TVA. Conservé tel quel — on ne jette pas une information qu''on a reçue.';
