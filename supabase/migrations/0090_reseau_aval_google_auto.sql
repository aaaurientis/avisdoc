-- ============================================================================
-- 0090 — Réseau d'aval : recherche automatique de la fiche Google Maps
-- ----------------------------------------------------------------------------
-- Dès qu'un praticien entre dans le tableau (import RPPS, ajout par RPPS,
-- généraliste repéré par l'IA), sa fiche Google est cherchée automatiquement.
-- Elle n'est rattachée d'office que si UN SEUL résultat correspond sans ambiguïté
-- (même nom, même code postal qu'un lieu d'exercice RPPS) ; sinon un opérateur
-- confirme. Seul l'identifiant de la fiche est conservé (conditions de Google).
--
-- Additif et rejouable. À exécuter dans le SQL Editor du projet admin
-- (wtovhzxymlqnfxyjxrdq), après 0089.
-- ============================================================================

alter table public.admin_reseau_praticiens
  add column if not exists google_statut text not null default 'a_chercher'
    check (google_statut in ('a_chercher', 'trouvee_auto', 'confirmee', 'a_confirmer', 'introuvable', 'aucune')),
  add column if not exists google_cherche_le timestamptz;

-- Reprise de l'existant : une fiche déjà choisie par un opérateur est confirmée.
update public.admin_reseau_praticiens set google_statut = 'confirmee'
 where google_place_id is not null and google_statut = 'a_chercher';
update public.admin_reseau_praticiens set google_statut = 'aucune'
 where google_aucune_fiche and google_statut = 'a_chercher';

create index if not exists idx_admin_reseau_praticiens_google on public.admin_reseau_praticiens (google_statut);

-- Le suivi des recherches accueille aussi la recherche des fiches Google d'un département.
alter table public.admin_reseau_recherches_ia drop constraint if exists admin_reseau_recherches_ia_type_check;
alter table public.admin_reseau_recherches_ia add constraint admin_reseau_recherches_ia_type_check
  check (type in ('praticien', 'mg_derm_departement', 'google_departement'));
