-- ============================================================================
-- 0050 — Un pipeline est un tableau : un nom, un assigné, ses colonnes
-- ----------------------------------------------------------------------------
-- « En quoi c'est compliqué de créer un pipeline ? Le nom du pipeline,
--   Assigné à, les colonnes, et c'est tout. »
--
-- La 0049 avait fait des pipelines une vue filtrée sur un tableau unique. Ce
-- n'est pas ce qui était demandé : un pipeline est un TABLEAU, avec ses propres
-- colonnes et ses propres affaires. On reprend donc au bon endroit.
--
-- Ce que fait cette migration :
--   · `admin_pipelines` perd ses filtres et gagne le commercial assigné ;
--   · une colonne du Kanban appartient désormais à un pipeline ;
--   · une affaire aussi ;
--   · le tableau existant devient un pipeline nommé « Général », qui reçoit ses
--     six colonnes et ses dix-neuf affaires. Rien ne bouge à l'écran.
--
-- L'unique pipeline enregistré à ce jour — « Olivier » — était un essai de la
-- 0049 : il ne retenait aucun filtre et n'a jamais rien affiché. Il est effacé
-- avec la mécanique qui l'a produit.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

-- ── 1. Le pipeline devient un tableau, pas un filtre ────────────────────────
delete from public.admin_pipelines;

alter table public.admin_pipelines drop column if exists filtres;
alter table public.admin_pipelines add column if not exists assigne_a text;

comment on column public.admin_pipelines.assigne_a is
  'Le commercial responsable de ce tableau. Une étiquette, pas une permission : tout le monde voit tous les pipelines, pour qu''un départ ne fasse rien perdre.';

-- ── 2. Colonnes et affaires appartiennent à un pipeline ─────────────────────
alter table public.admin_pipeline_stages
  add column if not exists pipeline_id uuid references public.admin_pipelines(id) on delete cascade;

alter table public.admin_clients
  add column if not exists pipeline_id uuid references public.admin_pipelines(id);

-- ── 3. L'existant entre dans un pipeline « Général » ────────────────────────
do $$
declare p uuid;
begin
  insert into public.admin_pipelines (nom) values ('Général') returning id into p;
  update public.admin_pipeline_stages set pipeline_id = p where pipeline_id is null;
  update public.admin_clients set pipeline_id = p where pipeline_id is null;
end $$;

-- ── 4. Plus jamais de colonne ni d'affaire hors d'un tableau ────────────────
-- Une affaire sans pipeline n'apparaîtrait nulle part : elle serait perdue sans
-- que personne le voie. Le défaut range dans le plus ancien pipeline tout code
-- qui oublierait de le préciser — une conversion de prospect, par exemple.
create or replace function public.pipeline_par_defaut() returns uuid
  language sql stable as $$
  select id from public.admin_pipelines order by created_at limit 1
$$;

alter table public.admin_clients alter column pipeline_id set default public.pipeline_par_defaut();

alter table public.admin_pipeline_stages alter column pipeline_id set not null;
alter table public.admin_clients alter column pipeline_id set not null;

create index if not exists admin_pipeline_stages_pipeline_idx on public.admin_pipeline_stages (pipeline_id, position);
create index if not exists admin_clients_pipeline_idx on public.admin_clients (pipeline_id);
