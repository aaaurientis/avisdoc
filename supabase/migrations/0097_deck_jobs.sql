-- Mise à la charte des présentations (commande deck, décision du 19/11).
-- Depuis le module Documents, « Mettre à la charte » sur un PPTX crée une ligne ici ; un
-- webhook Supabase (INSERT) appelle le service de génération (POST /deck), qui range la
-- présentation refaite dans Documents, à côté de la source (jamais modifiée), avec son rapport.

create table if not exists public.admin_deck_jobs (
  id                     uuid primary key default gen_random_uuid(),
  document_id            uuid not null references public.admin_documents (id) on delete cascade,
  statut                 text not null default 'en_attente'
                         check (statut in ('en_attente', 'en_cours', 'termine', 'echec')),
  modele                 boolean not null default true,   -- mode modèle (repli sur les règles)
  fond                   text not null default 'creme' check (fond in ('creme', 'blanc')),
  mode                   text,                            -- mode réellement utilisé
  resultat_document_id   uuid references public.admin_documents (id) on delete set null,
  rapport_path           text,                            -- rapport.md dans admin-documents
  pivot_path             text,                            -- deck.json dans admin-documents
  planche_path           text,                            -- controle.jpg dans admin-documents
  acces                  text,                            -- client | hds (captures non levées)
  erreurs                int,
  avertissements         int,
  rapport                text,                            -- rapport.md, pour l'affichage
  erreur                 text,
  cree_par               text,
  cree_le                timestamptz not null default now(),
  demarre_le             timestamptz,
  fini_le                timestamptz
);
create index if not exists idx_deck_jobs_document on public.admin_deck_jobs (document_id, cree_le desc);

alter table public.admin_deck_jobs enable row level security;

drop policy if exists "deck_jobs_lecture" on public.admin_deck_jobs;
create policy "deck_jobs_lecture" on public.admin_deck_jobs for select to authenticated
  using (public.is_avisdoc_user());

drop policy if exists "deck_jobs_creation" on public.admin_deck_jobs;
create policy "deck_jobs_creation" on public.admin_deck_jobs for insert to authenticated
  with check (public.is_avisdoc_user() and statut = 'en_attente');
-- Mises à jour : le service de génération seulement (clé service_role).

comment on table public.admin_deck_jobs is 'Mise à la charte des présentations (commande deck du pack documentaire).';
