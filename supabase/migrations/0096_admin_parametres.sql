-- Paramètres d'affichage partagés du Hub (clé / valeur), décision du 17/11.
-- Premier usage : « statistiques_affichage » = { resultatsDermato: bool, noms: "clair" | "flou" | "initiale" },
-- appliqué au module Statistiques. Lecture : tout utilisateur du Hub ; écriture : droit « admin ».

create table if not exists public.admin_parametres (
  cle      text primary key,
  valeur   jsonb not null,
  maj_par  text,
  maj_le   timestamptz not null default now()
);

alter table public.admin_parametres enable row level security;

drop policy if exists "parametres_lecture" on public.admin_parametres;
create policy "parametres_lecture" on public.admin_parametres for select to authenticated using (true);

drop policy if exists "parametres_ecriture" on public.admin_parametres;
create policy "parametres_ecriture" on public.admin_parametres for insert to authenticated
  with check (public.a_le_module('admin'));

drop policy if exists "parametres_maj" on public.admin_parametres;
create policy "parametres_maj" on public.admin_parametres for update to authenticated
  using (public.a_le_module('admin')) with check (public.a_le_module('admin'));

comment on table public.admin_parametres is 'Paramètres d''affichage partagés (clé/valeur). Écriture réservée au droit admin.';
