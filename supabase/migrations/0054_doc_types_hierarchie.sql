-- ============================================================================
-- Arborescence documentaire à 2 niveaux (catégories → sous-catégories).
--
-- Avant : admin_doc_types était une liste plate (name unique), et les documents
-- portaient une seule catégorie (admin_documents.cat).
-- Après : admin_doc_types gagne une colonne `parent` (null = catégorie de
-- niveau 1 ; sinon = sous-catégorie rattachée au nom de sa catégorie).
-- Les documents portent désormais (cat_parent, cat) = (catégorie, sous-catégorie).
--
-- Les anciennes catégories à plat sont conservées sous une catégorie « Divers »
-- pour ne rien perdre ; à reclasser ensuite depuis l'écran Documents.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

-- 1. Nouvelles colonnes (`position` ordonne l'affichage ; null = ajouté ensuite,
--    classé en fin).
alter table public.admin_doc_types
  add column if not exists parent text,
  add column if not exists position int;

alter table public.admin_documents
  add column if not exists cat_parent text;

-- 2. Les noms de sous-catégories se répètent entre parents (Experts, Infirmières…)
--    → l'unicité porte sur (parent, name), plus sur name seul.
alter table public.admin_doc_types drop constraint if exists admin_doc_types_name_key;
create unique index if not exists admin_doc_types_parent_name_key
  on public.admin_doc_types (coalesce(parent, ''), name);

-- 3. Les anciens types à plat deviennent des sous-catégories de « Divers »
--    (tout ce qui est encore au niveau 1 et n'est PAS une des nouvelles catégories).
update public.admin_doc_types
set parent = 'Divers'
where parent is null
  and name not in (
    'Divers', 'Doc. Profil', 'Equipe Médicale', 'Doc. Interne',
    'CR journées', 'Contrats signés', 'Newsletter', 'Réserve'
  );

-- 4. Les documents existants sont rattachés à « Divers » (leur `cat` devient la feuille).
update public.admin_documents
set cat_parent = 'Divers'
where cat_parent is null;

-- 5. Insertion de l'arborescence cible (idempotent). « Divers » en dernier.
insert into public.admin_doc_types (position, parent, name)
select v.position, v.parent, v.name
from (values
  (10, null::text, 'Doc. Profil'),
  (11, 'Doc. Profil', 'Prospection Clients'),
  (12, 'Doc. Profil', 'RH - Contact Client'),
  (13, 'Doc. Profil', 'Mailing Campagne'),
  (14, 'Doc. Profil', 'Collaborateur Patient'),
  (20, null, 'Equipe Médicale'),
  (21, 'Equipe Médicale', 'Infirmières'),
  (22, 'Equipe Médicale', 'Experts'),
  (23, 'Equipe Médicale', 'Réseau d''aval'),
  (30, null, 'Doc. Interne'),
  (31, 'Doc. Interne', 'Planning'),
  (32, 'Doc. Interne', 'Technique'),
  (33, 'Doc. Interne', 'Organisation'),
  (40, null, 'CR journées'),
  (41, 'CR journées', 'Fiches logistiques'),
  (42, 'CR journées', 'Journées'),
  (43, 'CR journées', 'Patients'),
  (44, 'CR journées', 'Experts'),
  (50, null, 'Contrats signés'),
  (51, 'Contrats signés', 'Infirmières'),
  (52, 'Contrats signés', 'Experts'),
  (53, 'Contrats signés', 'Réseau d''aval'),
  (60, null, 'Newsletter'),
  (61, 'Newsletter', 'Infirmière'),
  (62, 'Newsletter', 'Dermo'),
  (63, 'Newsletter', 'Client'),
  (70, null, 'Réserve'),
  (71, 'Réserve', 'Archives'),
  (72, 'Réserve', 'Draft'),
  (99, null, 'Divers')
) as v(position, parent, name)
where not exists (
  select 1 from public.admin_doc_types t
  where coalesce(t.parent, '') = coalesce(v.parent, '') and t.name = v.name
);
