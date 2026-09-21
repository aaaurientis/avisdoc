-- ============================================================================
-- 0023 — Les colonnes du Pipeline deviennent modifiables
-- ----------------------------------------------------------------------------
-- Jusqu'ici les quatre étapes (Nouveau, Qualifié, Proposition, Signé) étaient
-- écrites en dur : dans une contrainte CHECK, dans le type TypeScript et dans
-- les couleurs. L'équipe doit pouvoir ajouter, renommer, réordonner et
-- supprimer ses colonnes sans qu'on touche au code.
--
-- • `admin_pipeline_stages` porte désormais les colonnes (libellé, ordre, teinte) ;
-- • `admin_clients.stage` reste du texte — il cite le libellé de l'étape — mais
--   sa contrainte CHECK disparaît : elle refuserait toute nouvelle colonne.
-- • Renommer une colonne met à jour les fiches qui la citent (fait par
--   l'application, en une requête).
-- • L'historique (`admin_client_stage_history`, migration 0013) est déjà en
--   texte libre : son déclencheur continue de fonctionner sans changement.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

create table if not exists public.admin_pipeline_stages (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique,
  position   int  not null,
  -- Teinte de la colonne, parmi celles du design system (voir src/admin/lib/ui-tokens.ts).
  tone       text not null default 'slate'
    check (tone in ('slate', 'teal', 'coral', 'emerald', 'violet', 'rose')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pipeline_stages_ordre on public.admin_pipeline_stages (position);

drop trigger if exists trg_pipeline_stages_updated on public.admin_pipeline_stages;
create trigger trg_pipeline_stages_updated
  before update on public.admin_pipeline_stages
  for each row execute function public.set_updated_at();

-- Les quatre étapes existantes, dans leur ordre et avec leurs couleurs actuelles.
insert into public.admin_pipeline_stages (label, position, tone) values
  ('Nouveau',     1, 'slate'),
  ('Qualifié',    2, 'teal'),
  ('Proposition', 3, 'coral'),
  ('Signé',       4, 'emerald')
on conflict (label) do nothing;

-- Toute étape déjà citée par une fiche mais absente de la liste est rattrapée,
-- pour qu'aucune fiche ne se retrouve sans colonne.
insert into public.admin_pipeline_stages (label, position, tone)
select distinct c.stage,
       (select coalesce(max(position), 0) from public.admin_pipeline_stages) + row_number() over (order by c.stage),
       'slate'
from public.admin_clients c
where c.stage is not null
  and not exists (select 1 from public.admin_pipeline_stages s where s.label = c.stage)
on conflict (label) do nothing;

-- La contrainte figée disparaît : c'est elle qui interdisait toute nouvelle colonne.
alter table public.admin_clients drop constraint if exists admin_clients_stage_check;

-- ----------------------------------------------------------------------------
-- Sécurité — comme les autres tables admin_*.
-- ----------------------------------------------------------------------------
alter table public.admin_pipeline_stages enable row level security;

drop policy if exists "pipeline_stages_equipe" on public.admin_pipeline_stages;
create policy "pipeline_stages_equipe" on public.admin_pipeline_stages
  for all to authenticated
  using (public.is_avisdoc_user())
  with check (public.is_avisdoc_user());
