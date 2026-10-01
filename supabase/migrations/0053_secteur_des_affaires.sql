-- ============================================================================
-- 0053 — Le secteur d'une affaire, pour pouvoir filtrer le Pipeline dessus
-- ----------------------------------------------------------------------------
-- « Pipeline par secteur, ça peut être utile, mais comment : un pipeline à part
--   entière ou juste un filtre ? » — un filtre.
--
-- Un pipeline est un tableau, et une affaire n'est que dans un seul tableau à la
-- fois. Si l'affaire Essilor vit dans le pipeline d'un commercial, elle ne peut
-- pas vivre en même temps dans un pipeline « Industrie ». Or on veut justement
-- voir un secteur À TRAVERS les commerciaux : c'est une lecture transversale,
-- donc un filtre.
--
-- Restait qu'il n'y avait rien à filtrer : les affaires ne portent qu'un code
-- NAF, et huit sur neuf l'ont vide. Le secteur devient donc un champ à lui.
--
-- Il se remplit tout seul pour les affaires nées d'un prospect — Merx l'a déjà
-- classé — et se corrige à la main dans la fiche. Les mêmes six valeurs que la
-- Prospection, pour qu'un secteur veuille dire la même chose des deux côtés.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

alter table public.admin_clients
  add column if not exists secteur text;

comment on column public.admin_clients.secteur is
  'btp, espaces_verts, agriculture, collectivites, sante_beaute, autre — les mêmes qu''en Prospection. Repris du prospect d''origine, corrigeable à la main. Aucune contrainte CHECK : une valeur inconnue se range dans « Autre » à l''écran plutôt que de faire échouer l''enregistrement.';

-- Ce que Merx avait déjà classé ne se reclasse pas à la main.
update public.admin_clients c
   set secteur = p.sector
  from public.admin_prospects p
 where p.converted_client_id = c.id
   and c.secteur is null
   and p.sector is not null;

create index if not exists admin_clients_secteur_idx on public.admin_clients (secteur);
