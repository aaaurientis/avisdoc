-- ============================================================================
-- 0080 — Les demandes « completion » de Merx sont enfin enregistrées
-- ----------------------------------------------------------------------------
-- « Parler à Merx » et la complétion de fiche notent leur demande avec
-- kind = 'completion', mais les règles de admin_merx_demandes ne l'ont jamais
-- permis : l'insertion était refusée en silence. Ces demandes n'apparaissaient
-- ni dans le suivi, ni dans les coûts, et leurs échecs ne laissaient aucune trace.
--
-- Idempotent. À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

alter table public.admin_merx_demandes
  drop constraint if exists admin_merx_demandes_kind_check;

alter table public.admin_merx_demandes
  add constraint admin_merx_demandes_kind_check
  check (kind in ('recherche', 'approfondissement', 'email', 'completion'));

alter table public.admin_merx_demandes
  drop constraint if exists admin_merx_demandes_check;

alter table public.admin_merx_demandes
  add constraint admin_merx_demandes_check check (
    -- Une recherche ne vise personne en particulier.
    (kind = 'recherche' and prospect_id is null and account_id is null)
    -- On n'approfondit qu'un prospect.
    or (kind = 'approfondissement' and prospect_id is not null)
    -- Un e-mail s'adresse à un prospect OU à un client.
    or (kind = 'email' and (prospect_id is not null or account_id is not null))
    -- Une complétion (ou une discussion) porte sur une fiche prospect.
    or (kind = 'completion' and prospect_id is not null)
  );
