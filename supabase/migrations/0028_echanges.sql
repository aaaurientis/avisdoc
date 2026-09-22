-- ============================================================================
-- 0028 — L'historique des échanges d'une fiche
-- ----------------------------------------------------------------------------
-- Un appel, un e-mail, un rendez-vous, une note : ce que l'équipe a réellement
-- fait, avec sa date et son auteur. C'est le troisième onglet des fiches.
--
-- Une même affaire change de table en avançant : elle est un prospect trouvé
-- par Merx, puis une affaire du Pipeline, puis une fiche du fichier client.
-- Un échange se rattache donc à l'une des trois, et une seule. À l'écran, la
-- fiche rassemble le fil complet en suivant les liens déjà posés
-- (admin_prospects.converted_client_id, admin_accounts.client_id).
--
-- Ce qui s'est passé tout seul — trouvé par Merx, approfondi, passé au
-- Pipeline — n'est PAS stocké ici : ces dates sont déjà sur la fiche. On ne
-- duplique pas une information qu'on possède déjà.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

create table if not exists public.admin_echanges (
  id           uuid primary key default gen_random_uuid(),

  -- La fiche concernée : exactement une des trois.
  prospect_id  uuid references public.admin_prospects(id) on delete cascade,
  client_id    uuid references public.admin_clients(id)   on delete cascade,
  account_id   uuid references public.admin_accounts(id)  on delete cascade,

  kind         text not null check (kind in ('appel', 'email', 'rdv', 'note')),
  titre        text not null,
  detail       text,
  au           timestamptz not null default now(),  -- quand cela a eu lieu, pas quand on l'a saisi
  par          text not null,                       -- l'adresse de qui l'a noté
  created_at   timestamptz not null default now(),

  constraint admin_echanges_une_seule_fiche check (
    (prospect_id is not null)::int + (client_id is not null)::int + (account_id is not null)::int = 1
  )
);

create index if not exists admin_echanges_prospect_idx on public.admin_echanges (prospect_id, au desc);
create index if not exists admin_echanges_client_idx   on public.admin_echanges (client_id, au desc);
create index if not exists admin_echanges_account_idx  on public.admin_echanges (account_id, au desc);

-- Le suivi commercial est partagé par l'équipe, comme les fiches elles-mêmes.
alter table public.admin_echanges enable row level security;

drop policy if exists "echanges_equipe" on public.admin_echanges;
create policy "echanges_equipe" on public.admin_echanges
  for all
  using (public.is_avisdoc_user())
  with check (public.is_avisdoc_user());

-- ----------------------------------------------------------------------------
-- Le jalon « passée au Pipeline » n'avait pas de date : le lien existait, pas
-- le moment. Sans elle, impossible de la placer dans le fil.
-- ----------------------------------------------------------------------------
alter table public.admin_prospects
  add column if not exists converted_at timestamptz;

-- Les fiches déjà converties prennent leur date d'ouverture comme repère.
update public.admin_prospects
   set converted_at = coalesce(opened_at, created_at)
 where converted_client_id is not null
   and converted_at is null;
