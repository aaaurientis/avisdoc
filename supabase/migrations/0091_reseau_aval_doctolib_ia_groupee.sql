-- ============================================================================
-- 0091 — Réseau d'aval : lien Doctolib, relevé du premier créneau, recherche IA
--        groupée sur tout un département
-- ----------------------------------------------------------------------------
-- Doctolib (décisions du 14/11) : aucune page Doctolib n'est lue par le Hub — pas
-- d'API publique, collecte automatisée interdite par ses conditions, règle 2 du
-- brief. Le LIEN de la fiche est cherché automatiquement par une recherche web
-- limitée à doctolib.fr : seules les adresses renvoyées par la recherche sont
-- examinées, et un lien n'est rattaché d'office que s'il est le seul à porter le
-- nom, le prénom et une commune d'exercice du praticien ; sinon « à confirmer ».
-- Le premier créneau est relevé par l'opérateur, comme un signal sourcé (lien,
-- date, auteur), périmé au bout de 14 jours.
--
-- Recherche IA groupée : une tâche « ia_departement » enchaîne les recherches par
-- praticien, trois à la fois, et peut être arrêtée (statut « annule »).
--
-- Additif et rejouable. À exécuter dans le SQL Editor du projet admin
-- (wtovhzxymlqnfxyjxrdq), après 0090.
-- ============================================================================

-- ── 1. Lien vers la fiche Doctolib ──────────────────────────────────────────
alter table public.admin_reseau_praticiens
  add column if not exists doctolib_url text check (doctolib_url is null or doctolib_url ~ '^https://([a-z0-9-]+\.)*doctolib\.(fr|de|it)/[^ ]+$'),
  add column if not exists doctolib_par text,
  add column if not exists doctolib_le  timestamptz,
  add column if not exists doctolib_statut text not null default 'a_chercher'
    check (doctolib_statut in ('a_chercher', 'trouve_auto', 'confirme', 'a_confirmer', 'introuvable', 'aucun')),
  add column if not exists doctolib_cherche_le timestamptz;

create index if not exists idx_admin_reseau_praticiens_doctolib on public.admin_reseau_praticiens (doctolib_statut);

-- Quota quotidien des recherches de lien Doctolib (appels facturés à l'IA).
alter table public.admin_reseau_appels_google drop constraint if exists admin_reseau_appels_google_type_check;
alter table public.admin_reseau_appels_google add constraint admin_reseau_appels_google_type_check
  check (type in ('recherche', 'details', 'details_avis', 'doctolib'));

-- ── 1 bis. Plusieurs fiches Google par praticien (cabinet, hôpital…) ────────
-- Les identifiants seuls (conditions de Google). google_place_id reste la première.
alter table public.admin_reseau_praticiens
  add column if not exists google_place_ids text[] not null default '{}';
update public.admin_reseau_praticiens set google_place_ids = array[google_place_id]
 where google_place_id is not null and cardinality(google_place_ids) = 0;

-- ── 1 ter. Coordonnées des lieux d'exercice (carte), géocodées par l'API Adresse ─
alter table public.admin_reseau_lieux
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists geo_tente boolean not null default false;

-- ── 2. Nouveau signal : premier créneau Doctolib ────────────────────────────
alter table public.admin_reseau_signaux drop constraint if exists admin_reseau_signaux_type_check;
alter table public.admin_reseau_signaux add constraint admin_reseau_signaux_type_check check (type in (
  'orientation', 'nouveaux_patients', 'motif_exerese', 'dermoscopie',
  'chirurgie_sur_place', 'circuit_rapide', 'prevention', 'plaintes_delais',
  'du_dermoscopie', 'signal_depart', 'teleexpertise', 'creneau_doctolib'));

-- ── 3. Recherche IA groupée : nouveau type de tâche, arrêt possible ─────────
alter table public.admin_reseau_recherches_ia drop constraint if exists admin_reseau_recherches_ia_type_check;
alter table public.admin_reseau_recherches_ia add constraint admin_reseau_recherches_ia_type_check
  check (type in ('praticien', 'mg_derm_departement', 'google_departement', 'ia_departement'));
-- « google_departement » désigne désormais la recherche des liens d'un département :
-- fiches Google, puis lien Doctolib.

alter table public.admin_reseau_recherches_ia drop constraint if exists admin_reseau_recherches_ia_statut_check;
alter table public.admin_reseau_recherches_ia add constraint admin_reseau_recherches_ia_statut_check
  check (statut in ('en_cours', 'termine', 'echec', 'annule'));

-- File d'attente de la tâche groupée : les praticiens restant à traiter.
alter table public.admin_reseau_recherches_ia
  add column if not exists file uuid[] not null default '{}';
