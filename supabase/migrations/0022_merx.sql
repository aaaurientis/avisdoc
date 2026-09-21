-- ============================================================================
-- 0022 — Merx, l'agent commercial de prospection (module « merx »)
-- ----------------------------------------------------------------------------
-- Merx cherche des entreprises sur le web, en rend des fiches notées, et les
-- approfondit à la demande. Reprise de l'outil éprouvé sur la vitrine AvisDoc,
-- adapté aux conventions de ce dépôt : schéma `public`, tables `admin_*`,
-- RLS réservée aux comptes @avisdoc.fr via `is_avisdoc_user()`.
--
-- Trois tables :
--   • admin_merx_conversations — les échanges avec Merx, PRIVÉS à leur auteur ;
--   • admin_merx_demandes      — la file des travaux (recherche, approfondissement) ;
--   • admin_prospects          — les fiches trouvées, PARTAGÉES par l'équipe,
--                                comme le fichier CRM.
--
-- Le module « merx » n'est pas dans les droits par défaut : tant qu'il n'est
-- pas ouvert dans Admin › Droits d'accès, personne ne voit ces écrans.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Conversations avec Merx — chacun retrouve les siennes, et elles seules.
-- ----------------------------------------------------------------------------
create table if not exists public.admin_merx_conversations (
  id          uuid primary key default gen_random_uuid(),
  owner_email text not null,
  title       text not null,
  messages    jsonb not null default '[]',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_merx_conversations_owner
  on public.admin_merx_conversations (lower(owner_email), updated_at desc);

drop trigger if exists trg_merx_conversations_updated on public.admin_merx_conversations;
create trigger trg_merx_conversations_updated
  before update on public.admin_merx_conversations
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Fiches trouvées par Merx — partagées par toute l'équipe.
-- ----------------------------------------------------------------------------
create table if not exists public.admin_prospects (
  id              uuid primary key default gen_random_uuid(),
  owner_email     text not null,              -- qui a lancé la recherche
  -- Fiche légère, rendue par la recherche
  name            text not null,
  city            text,
  department      text,
  activity        text,
  website         text,
  rationale       text,                       -- pourquoi c'est une cible
  sources         text[] not null default '{}', -- pages réellement consultées
  sector          text check (sector in ('btp', 'espaces_verts', 'agriculture', 'collectivites', 'autre')),
  -- Note sur 100 : total et détail par critère, chaque note avec sa justification
  score_total     int,
  score           jsonb not null default '{}',
  -- Approfondissement : registre officiel, coordonnées, angle d'approche
  siren               text,
  legal_name          text,
  headcount_band      text,
  headcount_year      int,
  open_establishments int,
  head_office         jsonb,                  -- adresse, ville, département du siège
  leaders             jsonb,                  -- nom et qualité seulement (minimisation RGPD)
  contact_name        text,
  contact_role        text,
  contact_email       text,
  contact_phone       text,
  contact_source      text,
  site_contacts       jsonb,                  -- e-mails et téléphones lus sur le site officiel
  approach            text,
  enriched_at         timestamptz,
  -- Suivi commercial
  status          text not null default 'a_verifier'
    check (status in ('a_verifier', 'a_contacter', 'contacte', 'relance_1', 'relance_2', 'repondu', 'ecarte')),
  opened_at       timestamptz,                -- première ouverture de la fiche
  last_contacted_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Une même entreprise n'est pas recréée par une seconde recherche.
create unique index if not exists idx_prospects_unique_name
  on public.admin_prospects (lower(name), coalesce(lower(city), ''));

create index if not exists idx_prospects_tri
  on public.admin_prospects (score_total desc nulls last, created_at desc);

drop trigger if exists trg_prospects_updated on public.admin_prospects;
create trigger trg_prospects_updated
  before update on public.admin_prospects
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- File des travaux demandés à Merx.
-- ----------------------------------------------------------------------------
create table if not exists public.admin_merx_demandes (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('recherche', 'approfondissement')),
  request         text not null,              -- la demande en langage courant, ou le nom de la fiche
  prospect_id     uuid references public.admin_prospects (id) on delete cascade,
  conversation_id uuid references public.admin_merx_conversations (id) on delete set null,
  requested_by    text not null,              -- e-mail du demandeur
  status          text not null default 'en_attente'
    check (status in ('en_attente', 'en_cours', 'terminee', 'echec')),
  message         text,                       -- motif d'un échec, ou remarque utile au commercial
  found_count     int,
  usage           jsonb,                      -- consommation mesurée (recherches web, jetons)
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  check ((kind = 'approfondissement') = (prospect_id is not null))
);

create index if not exists idx_merx_demandes_file
  on public.admin_merx_demandes (created_at)
  where status in ('en_attente', 'en_cours');

-- Lien retour : quelle demande a trouvé la fiche.
alter table public.admin_prospects
  add column if not exists found_by uuid references public.admin_merx_demandes (id) on delete set null;

-- ----------------------------------------------------------------------------
-- Sécurité — réservé aux comptes @avisdoc.fr, comme les autres tables admin_*.
-- ----------------------------------------------------------------------------
alter table public.admin_merx_conversations enable row level security;
alter table public.admin_prospects          enable row level security;
alter table public.admin_merx_demandes      enable row level security;

-- Conversations : privées à leur auteur.
drop policy if exists "merx_conversations_proprietaire" on public.admin_merx_conversations;
create policy "merx_conversations_proprietaire" on public.admin_merx_conversations
  for all to authenticated
  using (
    public.is_avisdoc_user()
    and lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  with check (
    public.is_avisdoc_user()
    and lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- Fiches : le fichier de prospection est commun à l'équipe.
drop policy if exists "prospects_equipe" on public.admin_prospects;
create policy "prospects_equipe" on public.admin_prospects
  for all to authenticated
  using (public.is_avisdoc_user())
  with check (public.is_avisdoc_user());

-- Demandes : chacun voit et lance les siennes.
drop policy if exists "merx_demandes_proprietaire" on public.admin_merx_demandes;
create policy "merx_demandes_proprietaire" on public.admin_merx_demandes
  for all to authenticated
  using (
    public.is_avisdoc_user()
    and lower(requested_by) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  with check (
    public.is_avisdoc_user()
    and lower(requested_by) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
