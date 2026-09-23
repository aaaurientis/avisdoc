-- Une action peut n'être rattachée à aucune fiche.
--
-- Le planning ne recevait que ce qui venait d'un prospect, d'une affaire ou d'un
-- client. Or une journée de commercial contient aussi des choses qui n'appartiennent
-- à personne : préparer une tournée, rappeler un fournisseur, passer au salon du BTP.
-- Sans elles, le planning ment sur ce qu'il y a vraiment à faire.
--
-- La règle passe donc de « exactement une fiche » à « au plus une » : on ne rattache
-- toujours pas une action à deux entreprises à la fois, mais on accepte qu'elle n'en
-- concerne aucune.

alter table public.admin_echanges
  drop constraint if exists admin_echanges_une_seule_fiche;

alter table public.admin_echanges
  add constraint admin_echanges_une_seule_fiche check (
    ((prospect_id is not null)::int + (client_id is not null)::int + (account_id is not null)::int) <= 1
  );
