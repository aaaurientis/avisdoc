-- ============================================================================
-- 0068 — Le résumé des notes, en première page de la fiche
-- ----------------------------------------------------------------------------
-- « Fais un résumé des notes en première page. » — Olivier, 09/10, en automatique.
--
-- Les notes du commercial (texte entier) restent dans l'Historique. Merx en tire
-- quelques lignes, affichées en tête de l'onglet Identité. Le résumé est refait à
-- l'ouverture de la fiche quand une note est plus récente que lui.
--
-- Il se range sur la fiche la plus avancée de l'entreprise : prospect, affaire ou
-- client. Forme : { points: text[], nb: int, derniere: timestamptz, au: timestamptz }
-- — nb et derniere disent sur quelles notes il a été fait.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

alter table public.admin_prospects add column if not exists resume_notes jsonb;
alter table public.admin_clients   add column if not exists resume_notes jsonb;
alter table public.admin_accounts  add column if not exists resume_notes jsonb;

comment on column public.admin_prospects.resume_notes is
  'Résumé des notes par Merx : { points, nb, derniere, au }. Refait quand une note est plus récente.';
comment on column public.admin_clients.resume_notes is
  'Résumé des notes par Merx : { points, nb, derniere, au }. Refait quand une note est plus récente.';
comment on column public.admin_accounts.resume_notes is
  'Résumé des notes par Merx : { points, nb, derniere, au }. Refait quand une note est plus récente.';
