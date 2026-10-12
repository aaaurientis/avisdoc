-- ============================================================================
-- 0069 — La fiche « façon Onetip » : actions programmées, comptes rendus, rappels
-- ----------------------------------------------------------------------------
-- « Reprends exactement la fiche client du hub Onetip » — Olivier, 12/10.
--
-- Une action se PROGRAMME (elle est à venir, et part au Planning) ou se NOTE
-- quand elle a eu lieu, avec ce qu'elle a donné, avec qui, et ce qui s'est dit.
-- Une action programmée se clôt par son compte rendu : `traite_le`.
-- Un rendez-vous est en visio (avec son lien) ou sur place ; un mail de rappel
-- part au commercial 15 minutes avant (2 heures pour un rendez-vous sur place).
--
-- Ce qui a été noté ne se réécrit plus : on ajoute une précision en dessous.
--
-- Rien n'est retiré : les colonnes s'ajoutent, les genres d'action existants
-- restent valides. L'écran en ligne aujourd'hui continue de fonctionner.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

alter table public.admin_echanges
  add column if not exists prevu            boolean not null default false,
  add column if not exists traite_le        timestamptz,
  add column if not exists resultat         text,
  add column if not exists avec             text,
  add column if not exists rdv_mode         text,
  add column if not exists rdv_lien         text,
  add column if not exists rappel_envoye_le timestamptz;

alter table public.admin_echanges drop constraint if exists admin_echanges_rdv_mode_check;
alter table public.admin_echanges
  add constraint admin_echanges_rdv_mode_check check (rdv_mode is null or rdv_mode in ('visio', 'sur_place'));

-- Les actions de la fiche Onetip : Présentation, et dans « Autre… » le salon,
-- le SMS ou WhatsApp, le message LinkedIn, le devis envoyé.
alter table public.admin_echanges drop constraint if exists admin_echanges_kind_check;
alter table public.admin_echanges
  add constraint admin_echanges_kind_check check (
    kind in ('appel', 'email', 'rdv', 'note', 'tache', 'presentation', 'salon', 'sms', 'linkedin', 'devis')
  );

-- Ce qui était déjà daté dans le futur était, de fait, programmé.
update public.admin_echanges
   set prevu = true
 where au > now()
   and kind <> 'note'
   and prevu = false;

-- Le mail de rappel cherche ce qui arrive : programmé, pas encore fait, pas rappelé.
create index if not exists admin_echanges_a_rappeler_idx
  on public.admin_echanges (au)
  where prevu and traite_le is null and rappel_envoye_le is null;

-- ----------------------------------------------------------------------------
-- « ✦ Où on en est » : le résumé de TOUTES les actions de la fiche, ouvert à
-- toute l'équipe. Il se range sur la fiche la plus avancée, comme celui des notes.
-- Forme : { texte, empreinte, au } — l'empreinte dit sur quelles actions il a été fait.
-- ----------------------------------------------------------------------------
alter table public.admin_prospects add column if not exists resume_activite jsonb;
alter table public.admin_clients   add column if not exists resume_activite jsonb;
alter table public.admin_accounts  add column if not exists resume_activite jsonb;

-- ----------------------------------------------------------------------------
-- Le secret qui protège la fonction des rappels. Tiré au hasard ici, il ne
-- quitte jamais la base : la tâche planifiée le lit, la fonction le compare.
-- Aucune politique : seul le rôle de service (la fonction) et postgres le lisent.
-- ----------------------------------------------------------------------------
create table if not exists public.admin_secrets_internes (
  cle    text primary key,
  valeur text not null
);
alter table public.admin_secrets_internes enable row level security;

insert into public.admin_secrets_internes (cle, valeur)
values ('rappels_actions', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (cle) do nothing;

-- Toutes les 5 minutes, la fonction regarde ce qui arrive et prévient le commercial.
select cron.unschedule('rappels-actions')
 where exists (select 1 from cron.job where jobname = 'rappels-actions');

select cron.schedule('rappels-actions', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://wtovhzxymlqnfxyjxrdq.supabase.co/functions/v1/rappels-actions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-secret', (select valeur from public.admin_secrets_internes where cle = 'rappels_actions')
    ),
    body := '{}'::jsonb
  );
$$);
