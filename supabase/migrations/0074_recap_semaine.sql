-- ============================================================================
-- 0074 — Le récap de la semaine : un mail aux associés, le vendredi à 19 h (Paris)
-- ----------------------------------------------------------------------------
-- Olivier, 20/10 : « tous les vendredis soirs, un mail de récap à l'ensemble des
-- associés d'AvisDoc » (destinataires dans la fonction recap-semaine).
--
-- 1. « Déplacé » : chaque report d'une action programmée est noté (date quittée,
--    nouvelle date) dans admin_echanges_reports ; `deplace_de` garde la date d'avant le
--    dernier report. Le récap de chaque semaine quittée montre l'action « Déplacé »,
--    même reportée plusieurs fois.
-- 2. Le secret et la tâche planifiée, comme le récap du soir (0071) : la tâche passe
--    le vendredi à 17 h et à 18 h UTC ; la fonction n'envoie qu'à 19 h à Paris, une
--    fois par semaine.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

alter table public.admin_echanges add column if not exists deplace_de timestamptz;

create table if not exists public.admin_echanges_reports (
  id          uuid primary key default gen_random_uuid(),
  echange_id  uuid not null references public.admin_echanges(id) on delete cascade,
  de          timestamptz not null,
  vers        timestamptz not null,
  le          timestamptz not null default now()
);
create index if not exists admin_echanges_reports_de_idx on public.admin_echanges_reports (de);

alter table public.admin_echanges_reports enable row level security;
drop policy if exists "reports_lecture" on public.admin_echanges_reports;
create policy "reports_lecture" on public.admin_echanges_reports
  for select to authenticated using (public.is_avisdoc_user());

-- security definer : le report s'écrit même si l'équipe n'a que la lecture sur l'historique.
create or replace function public.admin_echanges_deplace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Seule une action programmée et pas encore faite se déplace (0073 fige le reste).
  if old.prevu and old.traite_le is null and new.au is distinct from old.au then
    new.deplace_de := old.au;
    insert into public.admin_echanges_reports (echange_id, de, vers) values (old.id, old.au, new.au);
  end if;
  return new;
end;
$$;

drop trigger if exists admin_echanges_deplace on public.admin_echanges;
create trigger admin_echanges_deplace
  before update on public.admin_echanges
  for each row execute function public.admin_echanges_deplace();

insert into public.admin_secrets_internes (cle, valeur)
values ('recap_semaine', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (cle) do nothing;

insert into public.admin_secrets_internes (cle, valeur)
values ('recap_semaine_dernier', '')
on conflict (cle) do nothing;

select cron.unschedule('recap-semaine')
 where exists (select 1 from cron.job where jobname = 'recap-semaine');

select cron.schedule('recap-semaine', '0 17,18 * * 5', $$
  select net.http_post(
    url := 'https://wtovhzxymlqnfxyjxrdq.supabase.co/functions/v1/recap-semaine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-secret', (select valeur from public.admin_secrets_internes where cle = 'recap_semaine')
    ),
    body := '{}'::jsonb
  );
$$);
