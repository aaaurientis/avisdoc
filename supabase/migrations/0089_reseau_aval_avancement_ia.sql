-- ============================================================================
-- 0089 — Réseau d'aval : suivre l'avancement d'une recherche IA
-- ----------------------------------------------------------------------------
-- La fonction `reseau-ia` écrit, au fil du travail, l'étape en cours, un
-- pourcentage et un journal court (recherches web lancées, pages vérifiées,
-- propositions retenues ou écartées). L'écran les relit toutes les 3 secondes.
--
-- Additif et rejouable. À exécuter dans le SQL Editor du projet admin
-- (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

alter table public.admin_reseau_recherches_ia
  add column if not exists etape       text,
  add column if not exists progression int not null default 0 check (progression between 0 and 100),
  -- [{ le, texte, niveau: 'info' | 'ok' | 'ecarte' }], 40 lignes au plus
  add column if not exists journal     jsonb not null default '[]'::jsonb;
