-- ============================================================================
-- 0083 — Admin › Réglages : qui voit chaque CRM et chaque veille, et qui en reçoit les mails
-- ----------------------------------------------------------------------------
-- Olivier, 09/11 : dans Réglages, un bloc CRM et un bloc Veille ; pour chaque CRM
-- (Entreprise, Collectivités Locales, Assurance Mutuelle, Intermédiaire) et pour la
-- Veille Marché, on coche les collaborateurs qui le voient et ceux qui reçoivent ses mails.
--
--   espace       « crm:demarcher », « crm:collectivites », « crm:mutuelles »,
--                « crm:intermediaires », « crm:synthese » (vue seule : seul « voit » compte) ou « veille:marche »
--   voit         faux : l'espace disparaît du menu de cette personne (rien d'autre n'est bloqué)
--   recoit_mails vrai : les mails de cet espace lui sont envoyés (alertes, récapitulatifs)
--   recoit_weekly vrai : le Weekly de cet espace lui est envoyé (un Weekly par CRM, un pour la Veille Marché)
--
-- Sans ligne, une personne voit l'espace et n'en reçoit pas les mails.
-- Lecture : tout compte @avisdoc.fr. Écriture : porteurs du module Admin.
-- Idempotent : rejouable sans effet.
-- ============================================================================

create table if not exists public.admin_espaces_membres (
  espace       text not null,
  email        text not null check (email = lower(email)),
  voit         boolean not null default true,
  recoit_mails boolean not null default false,
  recoit_weekly boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (espace, email)
);

-- Les espaces permis (la CRM Synthèse, vue seule, n'a que « voit »). Rejouable.
alter table public.admin_espaces_membres drop constraint if exists admin_espaces_membres_espace_check;
alter table public.admin_espaces_membres add constraint admin_espaces_membres_espace_check
  check (espace in ('crm:demarcher', 'crm:collectivites', 'crm:mutuelles', 'crm:intermediaires', 'crm:synthese', 'veille:marche'));

-- Rejouable sur une table créée avant la colonne du Weekly.
alter table public.admin_espaces_membres add column if not exists recoit_weekly boolean not null default false;

alter table public.admin_espaces_membres enable row level security;
grant select, insert, update, delete on public.admin_espaces_membres to authenticated;
grant select on public.admin_espaces_membres to service_role;

drop policy if exists "espaces_membres_lecture" on public.admin_espaces_membres;
create policy "espaces_membres_lecture" on public.admin_espaces_membres
  for select to authenticated using (public.is_avisdoc_user());

drop policy if exists "espaces_membres_ecriture" on public.admin_espaces_membres;
create policy "espaces_membres_ecriture" on public.admin_espaces_membres
  for all to authenticated using (public.a_le_module('admin')) with check (public.a_le_module('admin'));

drop trigger if exists admin_espaces_membres_updated_at on public.admin_espaces_membres;
create trigger admin_espaces_membres_updated_at before update on public.admin_espaces_membres
  for each row execute function public.set_updated_at();
