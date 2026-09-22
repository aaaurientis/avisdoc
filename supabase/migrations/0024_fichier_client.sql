-- ============================================================================
-- 0024 — Le fichier client (onglet « Clients »)
-- ----------------------------------------------------------------------------
-- Un tableur commun à l'équipe : chacun ajoute, renomme, déplace ou masque des
-- colonnes sans qu'on touche au code. Trois colonnes sont protégées, parce que
-- tout le reste s'y rattache : Établissement, Date (devenu client) et Secteur.
-- Les autres valeurs vivent dans `data`, en JSON, sous la clé de leur colonne.
--
-- Une entreprise passée en « Signé » dans le Pipeline arrive ici UNE fois ;
-- `client_id` garde le lien vers son affaire. La ressortir de « Signé » ne
-- supprime pas le client.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Les colonnes du fichier
-- ----------------------------------------------------------------------------
create table if not exists public.admin_account_fields (
  id         uuid primary key default gen_random_uuid(),
  -- Clé technique, jamais affichée : c'est elle qui range la valeur dans `data`.
  key        text not null unique,
  label      text not null,
  type       text not null default 'texte'
    check (type in ('texte', 'nombre', 'date', 'email', 'telephone', 'lien', 'multiligne')),
  position   int  not null,
  -- Colonne du socle : renommable, mais ni supprimable ni déplaçable hors des trois premières.
  protege    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_account_fields_ordre on public.admin_account_fields (position);

drop trigger if exists trg_account_fields_updated on public.admin_account_fields;
create trigger trg_account_fields_updated
  before update on public.admin_account_fields
  for each row execute function public.set_updated_at();

insert into public.admin_account_fields (key, label, type, position, protege) values
  ('etablissement', 'Établissement', 'texte', 1, true),
  ('date_client',   'Date',          'date',  2, true),
  ('secteur',       'Secteur',       'texte', 3, true)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- Les fiches
-- ----------------------------------------------------------------------------
create table if not exists public.admin_accounts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,                -- Établissement
  signed_on  date,                         -- Date (devenu client)
  sector     text,                         -- Secteur
  -- Toutes les autres colonnes, sous la clé de leur champ.
  data       jsonb not null default '{}',
  -- L'affaire d'où vient la fiche, quand elle est née d'un passage en « Signé ».
  client_id  uuid references public.admin_clients (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_accounts_nom on public.admin_accounts (lower(name));
-- Une affaire ne crée qu'une seule fiche client.
create unique index if not exists idx_accounts_client on public.admin_accounts (client_id) where client_id is not null;

drop trigger if exists trg_accounts_updated on public.admin_accounts;
create trigger trg_accounts_updated
  before update on public.admin_accounts
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Sécurité — comme les autres tables admin_*.
-- ----------------------------------------------------------------------------
alter table public.admin_account_fields enable row level security;
alter table public.admin_accounts       enable row level security;

drop policy if exists "account_fields_equipe" on public.admin_account_fields;
create policy "account_fields_equipe" on public.admin_account_fields
  for all to authenticated
  using (public.is_avisdoc_user())
  with check (public.is_avisdoc_user());

drop policy if exists "accounts_equipe" on public.admin_accounts;
create policy "accounts_equipe" on public.admin_accounts
  for all to authenticated
  using (public.is_avisdoc_user())
  with check (public.is_avisdoc_user());
