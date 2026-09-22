-- La mémoire du terrain : ce qui bloque, et ce qui fait mouche.
--
-- Un commercial ne remplit pas de formulaire après un rendez-vous. Il dicte, en
-- sortant, ce qui s'est passé — et Merx en tire ce qui servira la prochaine fois.
-- Rien n'est écrit ici sans que quelqu'un l'ait validé à l'écran.

-- ----------------------------------------------------------------------------
-- Ce que Merx a tiré d'un débrief, en attente de validation.
-- ----------------------------------------------------------------------------
alter table public.admin_notes_dictees
  add column if not exists extraction jsonb;

-- Un débrief peut être tapé plutôt que dicté : l'audio devient facultatif, et la
-- note part alors directement à « transcrite ».
comment on column public.admin_notes_dictees.audio_path is
  'Chemin de l''audio dans `admin-dictee`. Vide pour un débrief saisi au clavier.';

-- ----------------------------------------------------------------------------
-- La bibliothèque : une ligne par objection entendue ou par argument qui a porté.
-- ----------------------------------------------------------------------------
create table if not exists public.admin_terrain (
  id           uuid primary key default gen_random_uuid(),
  owner_email  text not null,
  -- Ce qui a bloqué, ou ce qui a ouvert la porte.
  nature       text not null check (nature in ('objection', 'mouche')),
  -- Ce qui a été dit, tel quel : c'est la matière, on ne la reformule pas.
  verbatim     text not null,
  -- Le rangement, pour retrouver les mêmes : « médecine du travail », « prix », « déjà fait »…
  famille      text,
  -- Ce qu'on a répondu, ou pourquoi cela a porté.
  reponse      text,
  -- D'où cela vient, même quand la fiche n'a pas été reconnue.
  entreprise   text,
  secteur      text,
  prospect_id  uuid references public.admin_prospects(id) on delete set null,
  client_id    uuid references public.admin_clients(id)   on delete set null,
  account_id   uuid references public.admin_accounts(id)  on delete set null,
  note_id      uuid references public.admin_notes_dictees(id) on delete set null,
  au           timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  -- Corbeille commune : quinze jours avant de disparaître.
  deleted_at   timestamptz
);

create index if not exists admin_terrain_nature_idx
  on public.admin_terrain (nature, au desc)
  where deleted_at is null;

create index if not exists admin_terrain_famille_idx
  on public.admin_terrain (lower(famille))
  where deleted_at is null and famille is not null;

create index if not exists admin_terrain_secteur_idx
  on public.admin_terrain (secteur)
  where deleted_at is null and secteur is not null;

-- ----------------------------------------------------------------------------
-- Sécurité — la matière du terrain est COMMUNE : ce qu'un commercial apprend
-- sert à toute l'équipe. C'est tout l'intérêt de la bibliothèque.
-- ----------------------------------------------------------------------------
alter table public.admin_terrain enable row level security;

drop policy if exists "terrain_equipe" on public.admin_terrain;
create policy "terrain_equipe" on public.admin_terrain
  for all to authenticated
  using (public.is_avisdoc_user())
  with check (public.is_avisdoc_user());
