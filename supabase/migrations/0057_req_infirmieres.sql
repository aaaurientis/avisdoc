-- ============================================================================
-- Inscription & validation des infirmières requérantes — SOCLE (Lot 1).
--
-- Spec : docs/infirmieres-requerantes-plan.md. Réutilise le projet admin.
-- Tables préfixées `req_` (distinctes des `admin_*`).
--
-- Auth : sans Pro Santé Connect dans un premier temps → identité par la voie de
-- secours (RPPS saisi + pièce filigranée contrôlée à la main). `identite_source`
-- vaut donc 'secours' pour l'instant ; 'psc' sera branché plus tard (Lot 5).
--
-- Toute TRANSITION d'état passe par une Edge Function (service_role) : les
-- infirmières n'ont ici qu'un accès LECTURE à leur propre dossier ; les écritures
-- se font côté serveur. L'admin (@avisdoc.fr) a l'accès complet.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Inscriptions (machine à états).
-- ----------------------------------------------------------------------------
create table if not exists public.req_inscriptions (
  id                 uuid primary key default gen_random_uuid(),
  nom                text not null,
  prenom             text not null,
  email              text not null,
  rpps               text,
  identite_source    text check (identite_source in ('psc', 'secours')),
  etat               text not null default 'invitee' check (etat in (
                       'invitee', 'identite_a_controler', 'identite_verifiee',
                       'pieces_a_valider', 'a_completer', 'pret_a_signer',
                       'contrat_envoye', 'active', 'suspendue',
                       'refusee', 'resiliee', 'abandonnee')),
  motif              text,                 -- refus / résiliation / suspension
  auth_user_id       uuid,                 -- lié à auth.users après connexion
  invite_token       text unique,          -- lien d'invitation à usage unique
  invite_expire_le   timestamptz,
  derniere_action_le timestamptz not null default now(), -- règle « 90 jours »
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_req_inscriptions_etat on public.req_inscriptions (etat);
create index if not exists idx_req_inscriptions_auth on public.req_inscriptions (auth_user_id);

drop trigger if exists trg_req_inscriptions_updated on public.req_inscriptions;
create trigger trg_req_inscriptions_updated before update on public.req_inscriptions
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Pièces (versionnées, jamais modifiées : un nouveau dépôt = nouvelle version).
-- ----------------------------------------------------------------------------
create table if not exists public.req_pieces (
  id                 uuid primary key default gen_random_uuid(),
  inscription_id     uuid not null references public.req_inscriptions (id) on delete cascade,
  type               text not null check (type in ('rcp', 'urssaf', 'identite')),
  version            int not null default 1,
  etat               text not null default 'deposee' check (etat in (
                       'deposee', 'validee', 'refusee', 'expiree', 'remplacee')),
  storage_path       text,
  -- Champs de validation (RI-04 / RI-05)
  assureur           text,                 -- RCP
  police             text,                 -- RCP
  date_emission      date,                 -- URSSAF (fin = émission + 6 mois)
  date_fin           date,                 -- fin de validité
  code_urssaf_verifie boolean,             -- RI-05
  motif              text,                 -- refus (RI-06, liste fermée)
  deposee_le         timestamptz not null default now(),
  controlee_le       timestamptz,
  controlee_par      text,                 -- email admin
  remplace_piece_id  uuid references public.req_pieces (id)
);
create index if not exists idx_req_pieces_inscription on public.req_pieces (inscription_id);

-- ----------------------------------------------------------------------------
-- 3. Contrats (modèle figé à l'envoi, statut Yousign).
-- ----------------------------------------------------------------------------
create table if not exists public.req_contrats (
  id                 uuid primary key default gen_random_uuid(),
  inscription_id     uuid not null references public.req_inscriptions (id) on delete cascade,
  modele_version     text not null,
  statut             text not null default 'envoye' check (statut in (
                       'envoye', 'signe', 'refuse', 'expire')),
  yousign_request_id text,
  signed_path        text,                 -- contrat signé archivé
  preuve_path        text,                 -- dossier de preuve Yousign
  envoye_le          timestamptz not null default now(),
  signe_le           timestamptz,
  expire_le          timestamptz
);
create index if not exists idx_req_contrats_inscription on public.req_contrats (inscription_id);

-- ----------------------------------------------------------------------------
-- 4. Historique (traçabilité des transitions et contrôles).
-- ----------------------------------------------------------------------------
create table if not exists public.req_historique (
  id             uuid primary key default gen_random_uuid(),
  inscription_id uuid not null references public.req_inscriptions (id) on delete cascade,
  at             timestamptz not null default now(),
  acteur         text,                      -- email admin, 'infirmiere' ou 'systeme'
  action         text not null,
  piece_id       uuid,
  detail         jsonb
);
create index if not exists idx_req_historique_inscription on public.req_historique (inscription_id, at desc);

-- ----------------------------------------------------------------------------
-- 5. RLS.
--    • Admin @avisdoc.fr : accès complet.
--    • Infirmière : LECTURE de son seul dossier (auth_user_id = auth.uid()) ;
--      les écritures passent par les Edge Functions (service_role, hors RLS).
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['req_inscriptions', 'req_pieces', 'req_contrats', 'req_historique'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "req_admin_all" on public.%I;', t);
    execute format(
      'create policy "req_admin_all" on public.%I for all to authenticated
         using (public.is_avisdoc_user()) with check (public.is_avisdoc_user());', t);
  end loop;
end $$;

-- Lecture « mon dossier » pour l'infirmière.
drop policy if exists "req_self_read" on public.req_inscriptions;
create policy "req_self_read" on public.req_inscriptions
  for select to authenticated
  using (auth_user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['req_pieces', 'req_contrats', 'req_historique'] loop
    execute format('drop policy if exists "req_self_read" on public.%I;', t);
    execute format(
      'create policy "req_self_read" on public.%I for select to authenticated
         using (exists (select 1 from public.req_inscriptions i
                        where i.id = inscription_id and i.auth_user_id = auth.uid()));', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 6. Storage : deux buckets privés. Lecture admin ; écritures par les fonctions
--    (service_role) ou via URL signée. La pièce d'identité (voie de secours) est
--    isolée dans son bucket (purge courte — RI-03, gérée au Lot 6).
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('req-pieces', 'req-pieces', false),
  ('req-identite', 'req-identite', false)
on conflict (id) do nothing;

drop policy if exists "req_storage_admin_read" on storage.objects;
create policy "req_storage_admin_read" on storage.objects
  for select to authenticated
  using (bucket_id in ('req-pieces', 'req-identite') and public.is_avisdoc_user());

-- ----------------------------------------------------------------------------
-- 7. Temps réel (back-office).
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['req_inscriptions', 'req_pieces', 'req_contrats', 'req_historique'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;
