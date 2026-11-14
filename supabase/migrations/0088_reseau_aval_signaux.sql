-- ============================================================================
-- 0088 — Réseau d'aval, lot 2 : signaux sourcés, fiche Google Maps, recherche
--        assistée par IA, ajout par RPPS
-- ----------------------------------------------------------------------------
-- Réf. : docs/reseau-aval-lot0.md (§6, §8 bis) et docs/reseau-aval-lot2.md.
--
-- Règles :
--   • toute information porte sa source : un signal sans URL http(s) est refusé
--     par la base (recette 4 du brief) ;
--   • rien n'est inventé : une proposition de l'IA n'entre qu'après un contrôle
--     automatique de sa source, et ne compte qu'après validation humaine ;
--   • aucun verbatim conservé : l'extrait qui justifie une proposition sert au
--     contrôle et à l'opérateur, puis il est effacé dès la décision ;
--   • fiche Google : seul l'identifiant (place_id) est conservé, jamais le contenu
--     (conditions de Google Maps Platform).
--
-- Additif et rejouable. À exécuter dans le SQL Editor du projet admin
-- (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

-- ── 1. Signaux ──────────────────────────────────────────────────────────────
create table if not exists public.admin_reseau_signaux (
  id            uuid primary key default gen_random_uuid(),
  praticien_id  uuid not null references public.admin_reseau_praticiens (id) on delete cascade,
  type          text not null check (type in (
                  'orientation', 'nouveaux_patients', 'motif_exerese', 'dermoscopie',
                  'chirurgie_sur_place', 'circuit_rapide', 'prevention', 'plaintes_delais',
                  'du_dermoscopie', 'signal_depart', 'teleexpertise')),
  valeur        text not null,
  url           text not null check (url ~ '^https?://[^ ]+$'),
  origine       text not null check (origine in ('operateur', 'ia')),
  statut        text not null default 'propose' check (statut in ('propose', 'valide', 'rejete', 'remplace')),
  -- Phrase exacte de la page, contrôlée automatiquement. Effacée dès la décision.
  extrait       text,
  propose_par   text not null,
  propose_le    timestamptz not null default now(),
  decide_par    text,
  decide_le     timestamptz,
  constraint admin_reseau_signaux_extrait_temporaire check (statut = 'propose' or extrait is null),
  constraint admin_reseau_signaux_decision check (statut = 'propose' or (decide_par is not null and decide_le is not null))
);
create index if not exists idx_admin_reseau_signaux_prat on public.admin_reseau_signaux (praticien_id, type, statut);

-- Un seul signal validé par type et par praticien : le nouveau remplace l'ancien.
create unique index if not exists uq_admin_reseau_signaux_valide
  on public.admin_reseau_signaux (praticien_id, type) where statut = 'valide';

-- ── 2. Fiche Google Maps : l'identifiant seul ───────────────────────────────
alter table public.admin_reseau_praticiens
  add column if not exists google_place_id     text,
  add column if not exists google_aucune_fiche boolean not null default false,
  add column if not exists google_rattache_par text,
  add column if not exists google_rattache_le  timestamptz;

-- ── 3. Recherches assistées par IA (journal et suivi des coûts) ─────────────
create table if not exists public.admin_reseau_recherches_ia (
  id             uuid primary key default gen_random_uuid(),
  type           text not null check (type in ('praticien', 'mg_derm_departement')),
  praticien_id   uuid references public.admin_reseau_praticiens (id) on delete cascade,
  departement    text,
  lance_par      text not null,
  debut          timestamptz not null default now(),
  fin            timestamptz,
  statut         text not null default 'en_cours' check (statut in ('en_cours', 'termine', 'echec')),
  -- { propositions, retenues, ecartees: [{ motif, url }], crees }
  resultat       jsonb,
  -- { input_tokens, output_tokens, web_searches, modele }
  usage          jsonb,
  erreur         text
);
create index if not exists idx_admin_reseau_recherches_prat on public.admin_reseau_recherches_ia (praticien_id, debut desc);
create index if not exists idx_admin_reseau_recherches_dep on public.admin_reseau_recherches_ia (departement, debut desc);

-- ── 4. Compteur quotidien des appels Google (quota de la clé serveur) ───────
create table if not exists public.admin_reseau_appels_google (
  jour        date not null,
  type        text not null check (type in ('recherche', 'details', 'details_avis')),
  nombre      int  not null default 0,
  primary key (jour, type)
);

-- Incrément atomique, appelé par la fonction serveur (service_role) avant chaque appel.
create or replace function public.admin_reseau_compter_appel_google(t text, plafond int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  insert into public.admin_reseau_appels_google (jour, type, nombre)
  values (current_date, t, 1)
  on conflict (jour, type) do update set nombre = admin_reseau_appels_google.nombre + 1
  returning nombre into n;
  if n > plafond then
    update public.admin_reseau_appels_google set nombre = nombre - 1 where jour = current_date and type = t;
    return false;
  end if;
  return true;
end;
$$;
revoke all on function public.admin_reseau_compter_appel_google(text, int) from public, anon, authenticated;

-- ── 5. RLS : lecture pour le module « sante », aucune écriture côté front ───
do $$
declare t text;
begin
  foreach t in array array['admin_reseau_signaux', 'admin_reseau_recherches_ia', 'admin_reseau_appels_google'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "reseau_lecture" on public.%I;', t);
    execute format(
      'create policy "reseau_lecture" on public.%I for select to authenticated
         using (public.a_le_module(''sante''));', t);
  end loop;
end $$;

comment on table public.admin_reseau_signaux is
  'Réseau d''aval : signaux sourcés (URL obligatoire). Proposés par l''IA ou saisis par un opérateur ; seuls les validés comptent.';
