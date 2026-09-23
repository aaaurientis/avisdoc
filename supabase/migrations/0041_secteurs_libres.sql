-- ============================================================================
-- 0041 — Plus aucun secteur ne bloque une fiche
-- ----------------------------------------------------------------------------
-- « On ne doit être bloqué par aucun secteur, on doit tout faire si on veut. »
--
-- La colonne `sector` portait une liste fermée de cinq valeurs. Le jour où le
-- code en a proposé une sixième — « santé et beauté » —, la base a refusé, et
-- comme une seule valeur invalide fait échouer l'insertion de TOUTE la liste,
-- deux cent cinquante entreprises trouvées au registre ne sont jamais entrées.
-- Le commercial voyait « aucun résultat » sur une recherche parfaitement bonne.
--
-- Un commercial doit pouvoir chercher n'importe quel métier : des feux
-- d'artifice, des scieries, des salles de sport. Le secteur n'est qu'une
-- étiquette de rangement, pas une autorisation : il ne doit jamais empêcher une
-- fiche d'exister.
--
-- L'écran reste maître de l'affichage : un secteur qu'il ne connaît pas se
-- range dans la colonne « Autre », sans rien perdre.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

alter table public.admin_prospects
  drop constraint if exists admin_prospects_sector_check;

-- On garde une exigence, la seule qui compte : un secteur reste renseigné.
alter table public.admin_prospects
  alter column sector set default 'autre';

update public.admin_prospects set sector = 'autre' where sector is null or btrim(sector) = '';
