-- ============================================================================
-- 0065 — Importer un fichier de prospection : la pastille « A répondu » et le
--        pipeline de Stéphan
-- ----------------------------------------------------------------------------
-- « Contacté est une colonne, a répondu doit être plutôt une pastille sur les
--   prospects dans la colonne Contacté. RDV est une colonne. » — Olivier, 09/10.
--
-- Le fichier de Stéphan compte 140 entreprises : 125 contactées sans réponse,
-- 10 qui ont répondu, 5 avec un rendez-vous de présentation. Elles entrent dans
-- un pipeline à son nom, à deux colonnes.
--
-- « A répondu » n'est pas une étape : l'affaire reste dans Contacté, la carte
-- porte une pastille. D'où une simple case sur l'affaire.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

-- ── 1. La pastille ──────────────────────────────────────────────────────────
alter table public.admin_clients
  add column if not exists a_repondu boolean not null default false;

comment on column public.admin_clients.a_repondu is
  'Le contact a répondu. Une pastille sur la carte, pas une étape : l''affaire reste dans sa colonne.';

-- ── 2. Le pipeline de Stéphan : Contacté, RDV ───────────────────────────────
-- Rejouable : rien n'est recréé si le pipeline existe déjà.
do $$
declare p uuid;
begin
  select id into p from public.admin_pipelines where nom = 'Stéphan';
  if p is null then
    insert into public.admin_pipelines (nom, assigne_a)
    values ('Stéphan', 'stephan.nacer@avisdoc.fr')
    returning id into p;

    insert into public.admin_pipeline_stages (label, position, tone, pipeline_id) values
      ('Contacté', 1, 'teal',    p),
      ('RDV',      2, 'emerald', p);
  end if;
end $$;
