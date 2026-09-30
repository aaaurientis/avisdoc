-- ============================================================================
-- 0049 — Les pipelines, créés à la main et visibles par tous
-- ----------------------------------------------------------------------------
-- « Dans Pipeline, je veux pouvoir créer des pipelines. Par commerciaux ou par
--   secteur. » Puis, devant un menu qui se remplissait tout seul : « qui a
--   décidé de la création de ces pipelines ? Et si je veux en créer deux pour
--   moi ? Je veux Ajouter un pipeline et c'est moi qui le crée. »
--
-- Un pipeline est une vue nommée : un nom, et les filtres tels qu'ils étaient
-- au moment où on l'a enregistré. Les affaires ne sont pas dupliquées — une
-- affaire déplacée dans un pipeline bouge partout, il n'y a qu'un seul Kanban.
--
-- Aucun pipeline n'est privé, et c'est délibéré : « si le commercial se barre,
-- on ne récupère pas son pipeline ». Tout le monde voit tout, tout le monde
-- peut reprendre. On garde seulement le nom de celui qui l'a créé, pour
-- l'information — pas comme une permission.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

create table if not exists public.admin_pipelines (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  -- Les filtres du Pipeline tels quels : {referent, journees, montant, contact, departement}.
  -- En jsonb pour qu'un filtre ajouté plus tard n'oblige pas à toucher la table.
  filtres jsonb not null default '{}'::jsonb,
  cree_par text,
  created_at timestamptz not null default now()
);

comment on table public.admin_pipelines is
  'Vues nommées du Pipeline, créées à la main. Toujours visibles par toute l''équipe : un commercial qui part ne doit pas emporter ses pipelines.';

alter table public.admin_pipelines enable row level security;

drop policy if exists "pipelines_lecture_equipe" on public.admin_pipelines;
drop policy if exists "pipelines_creation" on public.admin_pipelines;
drop policy if exists "pipelines_modification" on public.admin_pipelines;
drop policy if exists "pipelines_suppression" on public.admin_pipelines;

create policy "pipelines_lecture_equipe" on public.admin_pipelines
  for select to authenticated using (public.is_avisdoc_user());

-- Créer, renommer, supprimer : ouvert à toute l'équipe, pour la même raison.
create policy "pipelines_creation" on public.admin_pipelines
  for insert to authenticated with check (public.is_avisdoc_user());

create policy "pipelines_modification" on public.admin_pipelines
  for update to authenticated
  using (public.is_avisdoc_user()) with check (public.is_avisdoc_user());

create policy "pipelines_suppression" on public.admin_pipelines
  for delete to authenticated using (public.is_avisdoc_user());
