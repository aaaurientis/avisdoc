-- ============================================================================
-- 0084 — Le Paramétrage de la veille passe dans Admin ; les commerciaux suggèrent
-- ----------------------------------------------------------------------------
-- Olivier, 09/11 (piste de Gemini) : Paramétrage et CPR quittent les pages de la
-- veille pour l'onglet Admin. Ce que Scope suit (rubriques, concurrents et
-- influenceurs, expressions, pages de réseaux sociaux, sites et flux) se LIT
-- toujours avec le module « veille », mais ne se MODIFIE plus qu'avec le module
-- « admin ». Jusqu'ici, toute personne qui avait la veille pouvait modifier ou
-- supprimer les réglages de tout le monde.
--
-- Les commerciaux envoient à la place une suggestion (un mot, un concurrent, un
-- site…) depuis la page de veille de leur CRM ; elle arrive en tête du
-- Paramétrage, où un admin la marque « Fait » ou « Refusé ».
--
-- Idempotent : rejouable sans effet.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Ce que Scope suit : lecture « veille » ou « admin », écriture « admin ».
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['admin_veille_rubriques','admin_veille_comptes','admin_veille_expressions','admin_veille_reseaux'] loop
    execute format('drop policy if exists %I on public.%I', replace(t, 'admin_', ''), t);
    execute format('drop policy if exists %I on public.%I', t || '_lecture', t);
    execute format('drop policy if exists %I on public.%I', t || '_ecriture', t);
    execute format('create policy %I on public.%I for select to authenticated
                    using (public.a_le_module(''veille'') or public.a_le_module(''admin''))', t || '_lecture', t);
    execute format('create policy %I on public.%I for all to authenticated
                    using (public.a_le_module(''admin'')) with check (public.a_le_module(''admin''))', t || '_ecriture', t);
  end loop;
end $$;

-- Les sites et flux : mêmes règles ; seuls les sites et flux ajoutés à la main s'ajoutent ou se suppriment.
drop policy if exists "veille_sources_lecture" on public.admin_veille_sources;
create policy "veille_sources_lecture" on public.admin_veille_sources for select to authenticated
  using (public.a_le_module('veille') or public.a_le_module('admin'));
drop policy if exists "veille_sources_modif" on public.admin_veille_sources;
create policy "veille_sources_modif" on public.admin_veille_sources for update to authenticated
  using (public.a_le_module('admin')) with check (public.a_le_module('admin'));
drop policy if exists "veille_sources_ajout" on public.admin_veille_sources;
create policy "veille_sources_ajout" on public.admin_veille_sources for insert to authenticated
  with check (public.a_le_module('admin') and genre in ('site','rss'));
drop policy if exists "veille_sources_suppression" on public.admin_veille_sources;
create policy "veille_sources_suppression" on public.admin_veille_sources for delete to authenticated
  using (public.a_le_module('admin') and genre in ('site','rss'));

-- ----------------------------------------------------------------------------
-- 2. Les suggestions des commerciaux.
--    espace : le CRM ou la veille d'où elle part (mêmes noms que admin_espaces_membres).
-- ----------------------------------------------------------------------------
create table if not exists public.admin_veille_suggestions (
  id         uuid primary key default gen_random_uuid(),
  espace     text not null check (espace in ('crm:demarcher', 'crm:collectivites', 'crm:mutuelles', 'crm:intermediaires', 'veille:marche')),
  texte      text not null check (length(btrim(texte)) between 2 and 1000),
  email      text not null check (email = lower(email)),
  statut     text not null default 'a_traiter' check (statut in ('a_traiter', 'fait', 'refuse')),
  traite_par text,
  traite_le  timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists admin_veille_suggestions_statut on public.admin_veille_suggestions (statut, created_at desc);

alter table public.admin_veille_suggestions enable row level security;
grant select, insert, update, delete on public.admin_veille_suggestions to authenticated;
grant all on public.admin_veille_suggestions to service_role;

-- Chacun voit les siennes ; les admins voient tout.
drop policy if exists "veille_suggestions_lecture" on public.admin_veille_suggestions;
create policy "veille_suggestions_lecture" on public.admin_veille_suggestions for select to authenticated
  using (public.a_le_module('admin') or (public.a_le_module('veille') and email = lower(coalesce(auth.jwt() ->> 'email', ''))));

-- On suggère en son propre nom, une suggestion neuve.
drop policy if exists "veille_suggestions_ajout" on public.admin_veille_suggestions;
create policy "veille_suggestions_ajout" on public.admin_veille_suggestions for insert to authenticated
  with check (public.a_le_module('veille') and email = lower(coalesce(auth.jwt() ->> 'email', ''))
              and statut = 'a_traiter' and traite_par is null and traite_le is null);

-- Seuls les admins la traitent ou l'effacent.
drop policy if exists "veille_suggestions_traitement" on public.admin_veille_suggestions;
create policy "veille_suggestions_traitement" on public.admin_veille_suggestions for update to authenticated
  using (public.a_le_module('admin')) with check (public.a_le_module('admin'));
drop policy if exists "veille_suggestions_suppression" on public.admin_veille_suggestions;
create policy "veille_suggestions_suppression" on public.admin_veille_suggestions for delete to authenticated
  using (public.a_le_module('admin'));

-- ----------------------------------------------------------------------------
-- 3. CPR est dans Admin : ses lectures (coûts, coût par veille, budget) suivent
--    le module « admin ». On réécrit seulement la garde des deux fonctions.
-- ----------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.veille_cpr(int)', 'public.veille_cout_par_veille()'] loop
    execute replace(pg_get_functiondef(f::regprocedure), 'a_le_module(''veille'')', 'a_le_module(''admin'')');
  end loop;
end $$;
drop policy if exists "veille_budget_lecture" on public.admin_veille_budget;
create policy "veille_budget_lecture" on public.admin_veille_budget for select to authenticated using (public.a_le_module('admin'));
