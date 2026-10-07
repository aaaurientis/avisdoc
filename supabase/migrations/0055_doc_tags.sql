-- ============================================================================
-- Tags standardisés des documents.
--
-- En plus de la nomenclature (catégorie › sous-catégorie), un document peut
-- porter plusieurs tags, choisis dans une liste standardisée gérée dans les
-- Réglages. Les tags du document sont stockés en tableau sur admin_documents ;
-- la liste de référence vit dans admin_doc_tags.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

-- 1. Liste de référence des tags.
create table if not exists public.admin_doc_tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- 2. Tags portés par chaque document (tableau de libellés).
alter table public.admin_documents
  add column if not exists tags text[] not null default '{}';

-- 3. RLS : mêmes règles que le reste de l'admin (@avisdoc.fr).
alter table public.admin_doc_tags enable row level security;
drop policy if exists "avisdoc_all" on public.admin_doc_tags;
create policy "avisdoc_all" on public.admin_doc_tags
  for all to authenticated
  using (public.is_avisdoc_user())
  with check (public.is_avisdoc_user());

-- 4. Tags par défaut (modifiables ensuite).
insert into public.admin_doc_tags (name) values
  ('À valider'), ('Validé'), ('Signé'), ('Confidentiel'),
  ('Modèle'), ('Prioritaire'), ('Archivé')
on conflict (name) do nothing;

-- 5. Supprimer un tag le retire aussi des documents qui le portaient.
--    SECURITY INVOKER (défaut) → soumis à la RLS de l'appelant.
create or replace function public.retirer_doc_tag(p_name text)
returns void
language sql
as $$
  update public.admin_documents
    set tags = array_remove(tags, p_name)
    where tags @> array[p_name];
  delete from public.admin_doc_tags where name = p_name;
$$;

-- 6. Temps réel.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'admin_doc_tags'
  ) then
    alter publication supabase_realtime add table public.admin_doc_tags;
  end if;
end $$;
