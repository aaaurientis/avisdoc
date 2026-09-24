-- ============================================================================
-- 0048 — Toutes les personnes trouvées, pas une seule
-- ----------------------------------------------------------------------------
-- « Dans Léoville Las Cases, je dois aller fouiller tout en bas pour trouver
--   Arce, DRH peut-être, et pas dans les identités. Dès que tu as un nom, tu le
--   mets dans Identité, tu ajoutes autant de lignes que possible avec nom,
--   fonction, e-mail, téléphone, mobile si on les a. »
--
-- L'approfondissement AVAIT trouvé Patrick Arce, responsable des ressources
-- humaines. Le modèle ne rendait qu'un seul contact : celui dont la source
-- faisait foi. Arce venait d'un annuaire d'affaires non daté — jugé insuffisant,
-- donc écarté de la fiche, et relégué dans la justification d'un critère de
-- notation, tout en bas de l'écran.
--
-- C'était confondre deux choses. Une source qui ne fait pas foi ne justifie pas
-- de POINTS ; elle justifie très bien qu'on note un nom quelque part. Un
-- commercial préfère un responsable RH « à confirmer » à une case vide.
--
-- Cette colonne recueille donc toutes les personnes trouvées, chacune avec sa
-- fonction, son adresse électronique, son téléphone, son mobile, la page qui la
-- mentionne, et si cette page fait foi ou non. La fiche les affiche toutes, en
-- haut, avec la mention « à confirmer » quand il y a lieu.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

alter table public.admin_prospects
  add column if not exists personnes jsonb;

comment on column public.admin_prospects.personnes is
  'Toutes les personnes trouvées : [{nom, fonction, email, telephone, mobile, source, sur}]. « sur » dit si la page qui la mentionne fait foi. Une piste non confirmée vaut mieux qu''une case vide.';
