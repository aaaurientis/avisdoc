-- ============================================================================
-- 0087 — Réseau d'aval, lot 1 : trouver de nouveaux médecins, département par
--        département
-- ----------------------------------------------------------------------------
-- Réf. : docs/reseau-aval-lot0.md (note de constat et décisions du 14/11/2026).
--
-- Les médecins trouvés sont des CANDIDATS : ils vivent dans admin_reseau_praticiens,
-- pas dans la liste existante. Ils rejoignent la liste Réseau Aval
-- (admin_network_contacts) quand ils donnent leur accord (lot 3). Un candidat
-- déjà présent dans la liste (même RPPS) y est relié par contact_id.
--
-- Règles :
--   • aucune donnée de patient ni de santé (hors périmètre HDS) ;
--   • le RPPS est la seule clé du praticien : un praticien n'existe qu'une fois,
--     même s'il exerce dans plusieurs départements ;
--   • l'opposition est définitive : une exclusion ne se modifie ni ne s'efface,
--     et l'import ne recrée jamais un praticien exclu ;
--   • toute transition d'état passe par une Edge Function (service_role). Le front
--     lit seulement : aucune politique d'écriture pour les utilisateurs.
--
-- Additif et rejouable. À exécuter dans le SQL Editor du projet admin
-- (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

-- ── 1. Départements travaillés ──────────────────────────────────────────────
-- L'utilisateur ajoute lui-même un département et en choisit l'état : le module
-- ne décide ni des priorités ni de la couverture (décisions du 14/11).
create table if not exists public.admin_reseau_departements (
  code              text primary key check (code ~ '^(0[1-9]|1[0-9]|2[1-9]|[3-8][0-9]|9[0-5]|2A|2B|97[1-46])$'),
  etat              text not null default 'a_ouvrir' check (etat in (
                      'a_ouvrir', 'importe', 'en_qualification', 'en_contact',
                      'couvert', 'en_veille')),
  ordre             int,
  dernier_import_le timestamptz,
  ajoute_par        text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists trg_admin_reseau_departements_updated on public.admin_reseau_departements;
create trigger trg_admin_reseau_departements_updated before update on public.admin_reseau_departements
  for each row execute function public.set_updated_at();

-- ── 2. Praticiens candidats ─────────────────────────────────────────────────
create table if not exists public.admin_reseau_praticiens (
  id                uuid primary key default gen_random_uuid(),
  rpps              text not null unique check (rpps ~ '^[0-9]{11}$'),
  civilite          text,
  nom               text not null,
  prenom            text not null default '',
  population        text not null check (population in ('DERM', 'ORL', 'PLAST', 'CHIR', 'MG_DERM')),
  -- Rôles attendus d'après la spécialité. Les rôles ACCEPTÉS seront ceux de l'accord (lot 3).
  roles             text[] not null default '{}',
  specialites       text[] not null default '{}',  -- libellés RPPS (type S)
  etat              text not null default 'identifie' check (etat in (
                      'identifie', 'qualifie', 'a_contacter', 'contacte', 'en_discussion',
                      'accord', 'refus', 'injoignable', 'exclu', 'sorti')),
  origine           text not null default 'import_rpps' check (origine in ('import_rpps', 'ia', 'manuel')),
  -- Déjà dans la liste existante (Requis, Réseau Aval…) : relié, jamais dupliqué.
  contact_id        uuid references public.admin_network_contacts (id) on delete set null,
  -- Fraîcheur : date de l'extraction RPPS d'où viennent les données (règle 9 du brief).
  rpps_extrait_le   timestamptz,
  vu_au_dernier_import boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_admin_reseau_praticiens_etat on public.admin_reseau_praticiens (etat);

drop trigger if exists trg_admin_reseau_praticiens_updated on public.admin_reseau_praticiens;
create trigger trg_admin_reseau_praticiens_updated before update on public.admin_reseau_praticiens
  for each row execute function public.set_updated_at();

-- ── 3. Lieux d'exercice (praticien × département, plusieurs à plusieurs) ────
create table if not exists public.admin_reseau_lieux (
  id              uuid primary key default gen_random_uuid(),
  praticien_id    uuid not null references public.admin_reseau_praticiens (id) on delete cascade,
  departement     text not null,
  cle             text not null,           -- identifiant de la structure, ou adresse normalisée
  raison_sociale  text,
  adresse         text,
  code_postal     text,
  commune         text,
  code_commune    text,
  telephone       text,
  mode_exercice   text,                    -- Libéral, Salarié…
  secteur         text,                    -- Cabinet individuel, Établissement public de santé…
  finess          text,
  siret           text,
  rpps_extrait_le timestamptz,
  unique (praticien_id, cle)
);
create index if not exists idx_admin_reseau_lieux_dep on public.admin_reseau_lieux (departement);

-- ── 4. Exclusions (opposition définitive) ───────────────────────────────────
create table if not exists public.admin_reseau_exclusions (
  rpps        text primary key check (rpps ~ '^[0-9]{11}$'),
  motif       text not null check (motif in ('opposition', 'esthetique_dominante', 'n_exerce_plus', 'autre')),
  precision   text,
  auteur      text not null,
  exclu_le    timestamptz not null default now()
);

-- Ni modification ni suppression, même avec la clé service_role.
create or replace function public.admin_reseau_exclusion_intouchable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Une exclusion du réseau d''aval est définitive : elle ne se modifie ni ne se supprime.';
end;
$$;

drop trigger if exists trg_admin_reseau_exclusions_intouchable on public.admin_reseau_exclusions;
create trigger trg_admin_reseau_exclusions_intouchable
  before update or delete on public.admin_reseau_exclusions
  for each row execute function public.admin_reseau_exclusion_intouchable();

-- Un praticien exclu ne peut pas être (re)créé, quel que soit le chemin.
create or replace function public.admin_reseau_refuser_exclu()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.admin_reseau_exclusions e where e.rpps = new.rpps)
     and new.etat <> 'exclu' then
    raise exception 'Le RPPS % est exclu du réseau d''aval : il ne peut pas y revenir.', new.rpps;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_admin_reseau_refuser_exclu on public.admin_reseau_praticiens;
create trigger trg_admin_reseau_refuser_exclu
  before insert or update on public.admin_reseau_praticiens
  for each row execute function public.admin_reseau_refuser_exclu();

-- ── 5. Imports (journal) ────────────────────────────────────────────────────
create table if not exists public.admin_reseau_imports (
  id              uuid primary key default gen_random_uuid(),
  departement     text not null references public.admin_reseau_departements (code),
  lance_par       text not null,
  debut           timestamptz not null default now(),
  fin             timestamptz,
  statut          text not null default 'en_cours' check (statut in ('en_cours', 'termine', 'echec')),
  rpps_extrait_le timestamptz,
  -- { lignes, praticiens, crees, mis_a_jour, exclus_ignores, relies_liste }
  compteurs       jsonb,
  erreur          text
);
create index if not exists idx_admin_reseau_imports_dep on public.admin_reseau_imports (departement, debut desc);

-- ── 6. Historique des transitions ───────────────────────────────────────────
create table if not exists public.admin_reseau_historique (
  id            uuid primary key default gen_random_uuid(),
  praticien_id  uuid references public.admin_reseau_praticiens (id) on delete cascade,
  departement   text,
  acteur        text not null,
  action        text not null,   -- import_cree, import_maj, exclu, departement_etat…
  de            text,
  vers          text,
  detail        jsonb,
  le            timestamptz not null default now()
);
create index if not exists idx_admin_reseau_historique_prat on public.admin_reseau_historique (praticien_id, le desc);

-- ── 7. RLS : lecture pour le module « sante », aucune écriture côté front ───
do $$
declare t text;
begin
  foreach t in array array['admin_reseau_departements', 'admin_reseau_praticiens', 'admin_reseau_lieux',
                           'admin_reseau_exclusions', 'admin_reseau_imports', 'admin_reseau_historique'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "reseau_lecture" on public.%I;', t);
    execute format(
      'create policy "reseau_lecture" on public.%I for select to authenticated
         using (public.a_le_module(''sante''));', t);
  end loop;
end $$;

comment on table public.admin_reseau_praticiens is
  'Réseau d''aval : médecins candidats, un par RPPS. Aucune donnée de patient. Écritures par Edge Function uniquement.';
comment on table public.admin_reseau_exclusions is
  'Réseau d''aval : oppositions et exclusions définitives, contrôlées sur le RPPS à chaque import.';
