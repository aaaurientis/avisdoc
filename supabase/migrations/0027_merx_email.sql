-- ============================================================================
-- 0027 — Merx rédige l'e-mail de premier contact
-- ----------------------------------------------------------------------------
-- La rédaction d'un e-mail devient une troisième sorte de demande, à côté de la
-- recherche et de l'approfondissement. Elle passe donc par la même file, et son
-- coût apparaît dans l'écran Coûts comme les autres.
--
-- Comme l'approfondissement, elle porte sur une fiche : la contrainte qui liait
-- `prospect_id` au seul approfondissement est élargie.
--
-- RIEN N'EST ENVOYÉ PAR LE HUB : Merx écrit un brouillon, le commercial le
-- relit, le modifie, et l'envoie depuis sa propre messagerie.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

alter table public.admin_merx_demandes
  drop constraint if exists admin_merx_demandes_kind_check;
alter table public.admin_merx_demandes
  add constraint admin_merx_demandes_kind_check
  check (kind in ('recherche', 'approfondissement', 'email'));

alter table public.admin_merx_demandes
  drop constraint if exists admin_merx_demandes_check;
alter table public.admin_merx_demandes
  add constraint admin_merx_demandes_check
  check ((kind in ('approfondissement', 'email')) = (prospect_id is not null));
