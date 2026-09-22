-- ============================================================================
-- 0032 — Une corbeille commune, vidée au bout de 15 jours
-- ----------------------------------------------------------------------------
-- Supprimer ne détruit plus rien tout de suite : on note la date. La fiche quitte
-- son tableau, se retrouve dans la corbeille, et se restaure d'un clic. Ce qui a
-- plus de 15 jours part pour de bon.
--
-- Pourquoi : une suppression est faite en une seconde et se regrette pendant des
-- jours — une information arrive, un collègue se manifeste. Une recherche coûte
-- désormais une dizaine de centimes : ce travail ne doit pas partir d'un clic.
--
-- Les prospects avaient déjà leur mise de côté (status = 'ecarte'). Elle devient
-- la corbeille commune : on convertit l'existant et on rend le statut à sa vraie
-- fonction, le suivi commercial.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

alter table public.admin_prospects add column if not exists deleted_at timestamptz;
alter table public.admin_clients   add column if not exists deleted_at timestamptz;
alter table public.admin_accounts  add column if not exists deleted_at timestamptz;

comment on column public.admin_prospects.deleted_at is 'Mise à la corbeille ; purgée au bout de 15 jours.';
comment on column public.admin_clients.deleted_at   is 'Mise à la corbeille ; purgée au bout de 15 jours.';
comment on column public.admin_accounts.deleted_at  is 'Mise à la corbeille ; purgée au bout de 15 jours.';

-- Ce qui était « écarté » rejoint la corbeille, en gardant une date plausible.
update public.admin_prospects
   set deleted_at = coalesce(opened_at, created_at),
       status = 'a_verifier'
 where status = 'ecarte'
   and deleted_at is null;

-- Les listes ne montrent que ce qui n'est pas à la corbeille : l'index suit.
create index if not exists admin_prospects_vivants_idx on public.admin_prospects (deleted_at) where deleted_at is null;
create index if not exists admin_clients_vivants_idx   on public.admin_clients   (deleted_at) where deleted_at is null;
create index if not exists admin_accounts_vivants_idx  on public.admin_accounts  (deleted_at) where deleted_at is null;
