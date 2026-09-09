-- ============================================================================
-- Journal d'auditabilité du back-office (RGPD-compatible).
--
-- Objectif : tracer « qui fait quoi », les connexions (y compris les tentatives
-- refusées) et les erreurs applicatives.
--
-- Principes RGPD :
--   • Finalité : sécurité & traçabilité des accès/actions d'administration.
--   • Minimisation : on enregistre opération + entité + id + email + horodatage
--     (+ user-agent), PAS de copie des données métier.
--   • Accès restreint : seul un super-admin (table admin_superadmins) peut LIRE
--     le journal. Les autres comptes @avisdoc.fr peuvent seulement y écrire.
--   • Conservation limitée : purge automatique au-delà de 12 mois (pg_cron).
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Super-admins : profils autorisés à consulter le journal d'audit.
-- ----------------------------------------------------------------------------
create table if not exists public.admin_superadmins (
  email      text primary key,
  created_at timestamptz not null default now()
);

-- Profil initial (modifiable uniquement via SQL, jamais depuis l'app).
insert into public.admin_superadmins (email)
values ('arthur@avisdoc.fr')
on conflict (email) do nothing;

-- Helper : l'utilisateur courant est-il super-admin ?
-- SECURITY DEFINER pour pouvoir lire la table quelles que soient les RLS.
create or replace function public.is_avisdoc_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_superadmins s
    where s.email = coalesce(auth.jwt() ->> 'email', '')
  )
$$;

alter table public.admin_superadmins enable row level security;

-- Chacun ne peut voir QUE sa propre ligne (permet à l'app de savoir si le
-- compte connecté est super-admin, sans exposer la liste complète).
drop policy if exists "superadmin_self_read" on public.admin_superadmins;
create policy "superadmin_self_read" on public.admin_superadmins
  for select to authenticated
  using (email = coalesce(auth.jwt() ->> 'email', ''));
-- Aucune policy d'écriture : la liste se gère au SQL Editor uniquement.

-- ----------------------------------------------------------------------------
-- 2. Journal d'audit (append-only).
-- ----------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  at          timestamptz not null default now(),
  actor_email text not null default '',
  category    text not null check (category in ('auth', 'data', 'error')),
  action      text not null,
  entity      text,
  entity_id   text,
  success     boolean,
  detail      jsonb,
  user_agent  text
);

create index if not exists idx_admin_audit_at on public.admin_audit_log (at desc);
create index if not exists idx_admin_audit_category on public.admin_audit_log (category);
create index if not exists idx_admin_audit_actor on public.admin_audit_log (actor_email);

alter table public.admin_audit_log enable row level security;

-- Lecture : super-admin uniquement.
drop policy if exists "audit_superadmin_read" on public.admin_audit_log;
create policy "audit_superadmin_read" on public.admin_audit_log
  for select to authenticated
  using (public.is_avisdoc_superadmin());

-- Écriture : tout compte authentifié, mais seulement pour SON propre email
-- (indispensable pour journaliser aussi les tentatives de connexion refusées,
--  qui disposent brièvement d'un JWT valide avant d'être déconnectées).
drop policy if exists "audit_self_insert" on public.admin_audit_log;
create policy "audit_self_insert" on public.admin_audit_log
  for insert to authenticated
  with check (actor_email = coalesce(auth.jwt() ->> 'email', ''));

-- Pas de policy UPDATE/DELETE : le journal est inaltérable depuis l'app.
-- Seule la purge planifiée (rôle postgres, hors RLS) peut supprimer.

-- ----------------------------------------------------------------------------
-- 3. « Qui fait quoi » : triggers d'audit sur les tables métier.
--    SECURITY DEFINER pour qu'un échec d'audit ne bloque jamais une écriture
--    légitime, et pour tracer l'email issu du JWT authentifié par la base.
-- ----------------------------------------------------------------------------
create or replace function public.audit_data_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := coalesce(auth.jwt() ->> 'email', 'system');
  v_id    text;
begin
  if (tg_op = 'DELETE') then
    v_id := old.id::text;
  else
    v_id := new.id::text;
  end if;

  insert into public.admin_audit_log (actor_email, category, action, entity, entity_id, success)
  values (v_email, 'data', lower(tg_op), tg_table_name, v_id, true);

  if (tg_op = 'DELETE') then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
  audited text[] := array[
    'admin_network_contacts', 'admin_clients', 'admin_client_contacts',
    'admin_client_docs', 'admin_suivis', 'admin_documents', 'admin_doc_types'
  ];
begin
  foreach t in array audited loop
    execute format('drop trigger if exists trg_audit_%1$s on public.%1$I;', t);
    execute format(
      'create trigger trg_audit_%1$s
         after insert or update or delete on public.%1$I
         for each row execute function public.audit_data_change();',
      t
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 4. Conservation : purge automatique au-delà de 12 mois (pg_cron).
--    Enrobé pour ne PAS faire échouer la migration si pg_cron n'est pas activé
--    (dans ce cas, l'activer via Dashboard → Database → Extensions, puis rejouer
--     ce bloc).
-- ----------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  begin
    perform cron.unschedule('purge-admin-audit');
  exception when others then
    null; -- pas encore planifié
  end;
  perform cron.schedule(
    'purge-admin-audit',
    '0 3 * * *',
    $cron$delete from public.admin_audit_log where at < now() - interval '12 months'$cron$
  );
exception when others then
  raise notice 'pg_cron indisponible — planifier manuellement la purge des logs > 12 mois.';
end $$;
