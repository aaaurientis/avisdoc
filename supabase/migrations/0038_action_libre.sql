-- ============================================================================
-- 0038 — Une action libre : sans entreprise, et pas forcément un appel
-- ----------------------------------------------------------------------------
-- Le planning ne recevait que ce qui venait d'un prospect, d'une affaire ou
-- d'un client, et seulement sous la forme d'un appel, d'un e-mail ou d'un
-- rendez-vous. Or une journée de commercial contient aussi des choses qui
-- n'appartiennent à personne et qui ne sont rien de tout cela : préparer une
-- tournée, rappeler un fournisseur, passer au salon du BTP. Sans elles, le
-- planning ment sur ce qu'il y a vraiment à faire.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

-- 1. La règle passe de « exactement une fiche » à « au plus une » : on ne
--    rattache toujours pas une action à deux entreprises à la fois, mais on
--    accepte qu'elle n'en concerne aucune.
alter table public.admin_echanges
  drop constraint if exists admin_echanges_une_seule_fiche;

alter table public.admin_echanges
  add constraint admin_echanges_une_seule_fiche check (
    ((prospect_id is not null)::int + (client_id is not null)::int + (account_id is not null)::int) <= 1
  );

-- 2. Un quatrième genre : « à faire ». Ni un appel, ni un e-mail, ni un
--    rendez-vous — ce qui sort de la liste de choses à faire. Les quatre
--    genres existants restent valides : on n'enlève rien.
alter table public.admin_echanges
  drop constraint if exists admin_echanges_kind_check;

alter table public.admin_echanges
  add constraint admin_echanges_kind_check check (
    kind in ('appel', 'email', 'rdv', 'note', 'tache')
  );
