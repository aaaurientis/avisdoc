-- ============================================================================
-- 0052 — Une fiche n'est complétée qu'une fois
-- ----------------------------------------------------------------------------
-- La complétion automatique posée le 24/09 se souvenait de ce qu'elle avait
-- déjà tenté dans une variable d'écran. Changer de page, recharger, revenir :
-- la mémoire repart à zéro et tout recommence.
--
-- Le 30 septembre : 4 662 complétions pour 255 fiches. Dix-huit fois la même.
-- Chacune interroge Pappers, qui facture à l'appel.
--
-- La trace descend donc en base. `completed_at` est posé à la FIN de chaque
-- complétion, qu'elle ait trouvé quelque chose ou non — une tentative qui n'a
-- rien donné n'en donnera pas plus la seconde fois, et c'est précisément celle
-- qui repartait en boucle.
--
-- Les fiches déjà traitées sont marquées ici, pour qu'aucune ne reparte une
-- dernière fois au premier chargement.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

alter table public.admin_prospects
  add column if not exists completed_at timestamptz;

comment on column public.admin_prospects.completed_at is
  'Quand la complétion automatique a traité cette fiche. Posé même si rien n''a été trouvé : on ne retente jamais. Sans cela, chaque affichage de l''écran relançait un appel Pappers facturé.';

-- Tout ce que les complétions passées ont déjà touché : on ne le refait pas.
update public.admin_prospects p
   set completed_at = d.fin
  from (
    select prospect_id, max(coalesce(finished_at, created_at)) as fin
      from public.admin_merx_demandes
     where kind = 'completion' and prospect_id is not null
     group by prospect_id
  ) d
 where d.prospect_id = p.id
   and p.completed_at is null;

create index if not exists admin_prospects_completion_idx
  on public.admin_prospects (completed_at) where completed_at is null;
