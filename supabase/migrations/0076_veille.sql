-- ============================================================================
-- 0076 — Veille : l'agent de recherche médicale et concurrentielle (module « veille »)
-- ----------------------------------------------------------------------------
-- On saisit dans le Hub des comptes, des expressions et des rubriques à
-- surveiller. Lundi, mercredi et vendredi, l'agent fouille les sources
-- (PubMed, Europe PMC, flux officiels, appels d'offres, presse via Linkup,
-- Perplexity), vérifie chaque lien, trie, et rédige un rapport qui couvre la
-- période écoulée depuis le rapport précédent. Le mail part à 9 h (Paris).
--
-- Le travail avance par petites étapes (admin_veille_etapes) : chacune tient
-- sous la limite de 150 s d'une fonction, et reprend après une coupure.
--
-- Le module « veille » n'est pas dans les droits par défaut : personne ne voit
-- ces écrans tant qu'il n'est pas ouvert dans Admin › Droits d'accès.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
--
-- Prérequis : pg_cron et pg_net actifs, migration 0069 appliquée (table
-- admin_secrets_internes). Après la migration, la tâche planifiée ne fait RIEN
-- tant que l'adresse de la fonction n'est pas posée ; pour mettre en route :
--   insert into public.admin_veille_reglages (cle, valeur) values
--   ('url_fonction', 'https://wtovhzxymlqnfxyjxrdq.supabase.co/functions/v1/veille');
-- Secrets de la fonction : ANTHROPIC_API_KEY, LINKUP_API_KEY, PERPLEXITY_API_KEY,
-- RESEND_API_KEY, VEILLE_DESTINATAIRES. Jamais VEILLE_HORLOGE_LIBRE en production.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Le droit au module, vérifié dans la base et pas seulement à l'écran.
-- Super-admin : tous les modules. Sinon : le module figure dans sa ligne.
-- ----------------------------------------------------------------------------
create or replace function public.a_le_module(m text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_avisdoc_user() and (
    exists (select 1 from public.admin_superadmins s
             where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    or exists (select 1 from public.admin_droits d
                where lower(d.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
                  and m = any (d.modules))
  )
$$;
revoke all on function public.a_le_module(text) from public, anon;
grant execute on function public.a_le_module(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Ce qu'on surveille
-- ----------------------------------------------------------------------------
create table if not exists public.admin_veille_rubriques (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  description text not null default '',
  ordre       int  not null default 0,
  actif       boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists uq_veille_rubriques_nom on public.admin_veille_rubriques (lower(nom));

create table if not exists public.admin_veille_comptes (
  id           uuid primary key default gen_random_uuid(),
  nom          text not null,
  genre        text not null default 'concurrent'
               check (genre in ('concurrent','client','institution','media','revue','personne','autre')),
  site         text,
  linkedin     text,
  facebook     text,
  rubrique_id  uuid references public.admin_veille_rubriques (id) on delete set null,
  notes        text not null default '',
  actif        boolean not null default true,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.admin_veille_expressions (
  id           uuid primary key default gen_random_uuid(),
  expression   text not null,
  rubrique_id  uuid references public.admin_veille_rubriques (id) on delete set null,
  notes        text not null default '',
  actif        boolean not null default true,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists uq_veille_expressions on public.admin_veille_expressions (lower(expression));

-- Les sources interrogées : on peut en couper une, et l'écran dit si elle répond.
create table if not exists public.admin_veille_sources (
  cle              text primary key,
  nom              text not null,
  genre            text not null check (genre in ('pubmed','europepmc','rss','boamp','medrxiv','clinicaltrials','linkup','perplexity')),
  params           jsonb not null default '{}'::jsonb,
  actif            boolean not null default true,
  dernier_succes   timestamptz,
  derniere_erreur  text,
  derniere_erreur_le timestamptz,
  updated_at       timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Ce que l'agent produit
-- ----------------------------------------------------------------------------
-- Un rapport par échéance. La période est [debut, fin[ : la fin d'un rapport
-- est le début du suivant, rien ne tombe entre deux.
create table if not exists public.admin_veille_rapports (
  id             uuid primary key default gen_random_uuid(),
  periode_debut  timestamptz not null,
  periode_fin    timestamptz not null unique,
  statut         text not null default 'collecte'
                 check (statut in ('collecte','verification','synthese','pret','envoi','envoye','echec')),
  points_cles    jsonb not null default '[]'::jsonb,
  rubriques      jsonb not null default '[]'::jsonb,
  sources_en_panne text[] not null default '{}',
  cout_usd       numeric(10,4) not null default 0,
  modele         text,
  prompt_version text,
  mail_id        text,
  envoye_le      timestamptz,
  alerte_le      timestamptz,
  erreur         text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (periode_fin > periode_debut)
);

-- Les petites étapes du travail. Une étape se prend sous verrou (verrou_jusqua),
-- se rejoue si elle échoue, et abandonne après `max_tentatives`.
create table if not exists public.admin_veille_etapes (
  id               uuid primary key default gen_random_uuid(),
  rapport_id       uuid not null references public.admin_veille_rapports (id) on delete cascade,
  genre            text not null,           -- 'collecte', 'perplexity', 'verification', 'synthese', 'points_cles'
  cle              text not null,           -- ce qui la rend unique dans le rapport (source, lot…)
  params           jsonb not null default '{}'::jsonb,
  statut           text not null default 'a_faire'
                   check (statut in ('a_faire','en_cours','attente','fait','abandon')),
  externe_id       text,                    -- identifiant d'une recherche asynchrone (Perplexity)
  tentatives       int  not null default 0,
  max_tentatives   int  not null default 4,
  prochain_passage timestamptz not null default now(),
  verrou_jusqua    timestamptz,
  cout_usd         numeric(10,4) not null default 0,
  resultat         jsonb,
  erreur           text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (rapport_id, genre, cle)
);
create index if not exists idx_veille_etapes_file on public.admin_veille_etapes (statut, prochain_passage);

-- Les articles trouvés. Un article n'existe qu'une fois (DOI, PMID ou adresse
-- normalisée) ; il est retenu dans un seul rapport, jamais republié.
create table if not exists public.admin_veille_articles (
  id            uuid primary key default gen_random_uuid(),
  cle           text not null unique,
  url           text not null,
  titre         text not null,
  titre_fr      text,                         -- le titre en français, quand l'original est en anglais
  source        text not null,               -- d'où il vient (cle de admin_veille_sources)
  nature        text not null default 'web'
                check (nature in ('etude','preprint','essai','officiel','appel_offres','presse','web')),
  publie_le     timestamptz,
  extrait       text not null default '',
  rapport_id    uuid references public.admin_veille_rapports (id) on delete set null,
  verifie       boolean,                      -- null : pas encore ouvert ; false : lien mort ou contenu absent
  lien_protege  boolean not null default false, -- le site refuse les robots (403) : on propose de copier le lien
  entreprise    text,                         -- signaux d'entreprises : qui…
  ville         text,                         -- …et où
  verdict       text check (verdict in ('retenu','ecarte')),
  raison        text,
  rubrique      text,
  importance    int check (importance between 1 and 3),
  resume        text,
  pour_avisdoc  text,
  premier_vu    timestamptz not null default now()
);
create index if not exists idx_veille_articles_rapport on public.admin_veille_articles (rapport_id);

-- Qui a lu quel rapport (la pastille « non lu » est propre à chacun).
create table if not exists public.admin_veille_lectures (
  rapport_id uuid not null references public.admin_veille_rapports (id) on delete cascade,
  email      text not null,
  lu_le      timestamptz not null default now(),
  primary key (rapport_id, email)
);

-- Réglages : adresse de la fonction, destinataires, plafond de dépense.
-- Lus par la tâche planifiée et par la fonction ; personne d'autre.
create table if not exists public.admin_veille_reglages (
  cle    text primary key,
  valeur text not null
);

do $$
declare t text;
begin
  foreach t in array array['admin_veille_rubriques','admin_veille_comptes','admin_veille_expressions',
                           'admin_veille_sources','admin_veille_rapports','admin_veille_etapes'] loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$s', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$s
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Accès
-- ----------------------------------------------------------------------------
alter table public.admin_veille_rubriques   enable row level security;
alter table public.admin_veille_comptes     enable row level security;
alter table public.admin_veille_expressions enable row level security;
alter table public.admin_veille_sources     enable row level security;
alter table public.admin_veille_rapports    enable row level security;
alter table public.admin_veille_etapes      enable row level security;
alter table public.admin_veille_articles    enable row level security;
alter table public.admin_veille_lectures    enable row level security;
alter table public.admin_veille_reglages    enable row level security;  -- aucune politique : fonction seule

-- Droits sur les tables, posés explicitement (les projets récents ne les donnent plus par défaut).
grant select, insert, update, delete on public.admin_veille_rubriques, public.admin_veille_comptes,
  public.admin_veille_expressions, public.admin_veille_lectures to authenticated;
grant select on public.admin_veille_sources, public.admin_veille_rapports, public.admin_veille_etapes,
  public.admin_veille_articles to authenticated;
grant all on public.admin_veille_rubriques, public.admin_veille_comptes, public.admin_veille_expressions,
  public.admin_veille_sources, public.admin_veille_rapports, public.admin_veille_etapes,
  public.admin_veille_articles, public.admin_veille_lectures, public.admin_veille_reglages to service_role;
grant select on public.admin_secrets_internes to service_role;

-- Ce qu'on surveille : commun à l'équipe qui a le module.
drop policy if exists "veille_rubriques" on public.admin_veille_rubriques;
create policy "veille_rubriques" on public.admin_veille_rubriques for all to authenticated
  using (public.a_le_module('veille')) with check (public.a_le_module('veille'));
drop policy if exists "veille_comptes" on public.admin_veille_comptes;
create policy "veille_comptes" on public.admin_veille_comptes for all to authenticated
  using (public.a_le_module('veille')) with check (public.a_le_module('veille'));
drop policy if exists "veille_expressions" on public.admin_veille_expressions;
create policy "veille_expressions" on public.admin_veille_expressions for all to authenticated
  using (public.a_le_module('veille')) with check (public.a_le_module('veille'));

-- Ce que l'agent produit : en lecture seule pour l'équipe, écrit par la fonction.
drop policy if exists "veille_sources_lecture" on public.admin_veille_sources;
create policy "veille_sources_lecture" on public.admin_veille_sources for select to authenticated
  using (public.a_le_module('veille'));
drop policy if exists "veille_rapports_lecture" on public.admin_veille_rapports;
create policy "veille_rapports_lecture" on public.admin_veille_rapports for select to authenticated
  using (public.a_le_module('veille'));
drop policy if exists "veille_etapes_lecture" on public.admin_veille_etapes;
create policy "veille_etapes_lecture" on public.admin_veille_etapes for select to authenticated
  using (public.a_le_module('veille'));
drop policy if exists "veille_articles_lecture" on public.admin_veille_articles;
create policy "veille_articles_lecture" on public.admin_veille_articles for select to authenticated
  using (public.a_le_module('veille'));

-- Lectures : chacun pose et voit les siennes.
drop policy if exists "veille_lectures" on public.admin_veille_lectures;
create policy "veille_lectures" on public.admin_veille_lectures for all to authenticated
  using (public.a_le_module('veille') and lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (public.a_le_module('veille') and lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- ----------------------------------------------------------------------------
-- Départ : rubriques, sources, concurrents relevés le 17/10/2026
-- ----------------------------------------------------------------------------
insert into public.admin_veille_rubriques (nom, description, ordre) values
  ('Concurrence',                    'Ce que font, annoncent, lèvent ou signent les concurrents d''AvisDoc.', 1),
  ('Santé au travail',               'Prévention en entreprise, médecine du travail, QVT, obligations des employeurs.', 2),
  ('Dermatologie',                   'Actualité de la dermatologie : cancers de la peau, mélanome, dépistage, accès aux dermatologues.', 3),
  ('Recherche médicale',             'Études, essais cliniques et prépublications sur le dépistage et les cancers cutanés.', 4),
  ('Presse et parutions',            'Articles de presse, tribunes et reportages sur le dépistage et la prévention.', 5),
  ('Réglementation et téléexpertise','Décrets, avenants de l''Assurance maladie, recommandations HAS, cadre de la téléexpertise.', 6),
  ('Soleil et métiers d''extérieur', 'Exposition aux UV au travail : BTP, voirie, espaces verts, agriculture, maladies professionnelles.', 7),
  ('Mutuelles et prévoyance',        'Forfaits prévention, offres et partenariats des complémentaires santé et assureurs.', 8),
  ('Collectivités et appels d''offres','Appels d''offres, contrats locaux de santé, campagnes de prévention des collectivités.', 9),
  ('IA et dispositifs de dépistage', 'Applications, IA et appareils de détection des lésions de la peau : marquages, validations.', 10)
on conflict do nothing;

insert into public.admin_veille_sources (cle, nom, genre, params) values
  -- Requêtes resserrées sur ce qui touche AvisDoc : dépistage, prévention, téléexpertise, travail.
  ('pubmed',         'PubMed',                    'pubmed',
     '{"requete":"(melanoma[tiab] OR \"skin cancer\"[tiab] OR \"skin neoplasms\"[mh] OR \"keratinocyte carcinoma\"[tiab]) AND (screening[tiab] OR \"early detection\"[tiab] OR prevention[tiab] OR teledermatology[tiab] OR telemedicine[tiab] OR dermoscopy[tiab] OR occupational[tiab] OR \"sun protection\"[tiab] OR \"artificial intelligence\"[tiab])"}'),
  ('europepmc',      'Europe PMC',                'europepmc',
     '{"requete":"(TITLE:melanoma OR TITLE:\"skin cancer\" OR TITLE:\"keratinocyte carcinoma\" OR TITLE:teledermatology) AND (ABSTRACT:screening OR ABSTRACT:\"early detection\" OR ABSTRACT:prevention OR ABSTRACT:teledermatology OR ABSTRACT:dermoscopy OR ABSTRACT:occupational OR ABSTRACT:\"sun protection\" OR ABSTRACT:\"artificial intelligence\")"}'),
  ('medrxiv',        'medRxiv (prépublications)', 'medrxiv',
     '{"categories":["dermatology","oncology","occupational and environmental health"]}'),
  ('clinicaltrials', 'ClinicalTrials.gov',        'clinicaltrials',
     '{"condition":"melanoma OR skin cancer OR skin neoplasm","pays":"France"}'),
  -- Adresses relevées le 17/10/2026 sur has-sante.fr et ansm.sante.fr (pages « flux RSS »).
  ('rss-has-actu',   'HAS — actualité',           'rss', '{"url":"https://www.has-sante.fr/feed/Rss2.jsp?id=p_3081656"}'),
  ('rss-has-reco',   'HAS — recommandations et guides', 'rss', '{"url":"https://www.has-sante.fr/feed/Rss2.jsp?id=p_3081452"}'),
  ('rss-has-dm',     'HAS — avis sur les dispositifs médicaux', 'rss', '{"url":"https://www.has-sante.fr/feed/Rss2.jsp?id=p_3081446"}'),
  ('rss-ansm-derm',  'ANSM — dermatologie',       'rss', '{"url":"https://ansm.sante.fr/rss/actualites?domainesMedicaux=dermatologie"}'),
  ('rss-ansm-onco',  'ANSM — oncologie',          'rss', '{"url":"https://ansm.sante.fr/rss/actualites?domainesMedicaux=oncologie_radiotherapie"}'),
  ('rss-jaad',       'JAAD',                      'rss', '{"url":"https://www.jaad.org/current.rss"}'),
  ('boamp',          'BOAMP (appels d''offres)',  'boamp',
     '{"mots":["dépistage","cancer de la peau","mélanome","dermatologie","prévention santé","téléexpertise"]}'),
  ('linkup',         'Linkup (presse et web)',    'linkup', '{}'),
  ('perplexity',     'Perplexity (recherche approfondie)', 'perplexity', '{}')
on conflict (cle) do nothing;

insert into public.admin_veille_comptes (nom, genre, site, notes, rubrique_id)
select v.nom, 'concurrent', v.site, v.notes, (select id from public.admin_veille_rubriques where nom = 'Concurrence')
from (values
  ('Anapix Medical (Skinapp)', 'https://anapix-medical.com/entreprise/', 'Dépistage en entreprise par application.'),
  ('Dermatosanté',             null,                                      'Dépistage du mélanome en entreprise par photos, depuis 2016.'),
  ('Elsan Prévention',         'https://www.elsan.care/fr/prevention/depistage', 'Ma Pause Dermato, Ma Capsule d''Expert Dermato.'),
  ('Depist&vous',              'https://www.depistetvous.fr/',            'Dépistage en entreprise.'),
  ('SkinMed',                  null,                                      'Téléexpertise en pharmacie, dermatoscope sur téléphone.'),
  ('PictaDerm',                null,                                      'Téléexpertise dermatologique en pharmacie.'),
  ('DermaScan',                null,                                      'Centres de dépistage à Paris, cartographie du corps.'),
  ('SkinVision',               null,                                      'Application d''analyse de grains de beauté (Pays-Bas).'),
  ('Skin Analytics',           'https://skin-analytics.com/',             'DERM, IA de dépistage (Royaume-Uni).')
) as v(nom, site, notes)
where not exists (select 1 from public.admin_veille_comptes c where lower(c.nom) = lower(v.nom));

-- ----------------------------------------------------------------------------
-- La tâche planifiée : chaque minute, la fonction avance d'un pas. Sans
-- rapport en cours, elle s'arrête aussitôt ; pendant la préparation (8 h - 9 h),
-- elle enchaîne les étapes sans attendre cinq minutes entre deux.
-- L'adresse de la fonction est un réglage : tant qu'il n'est pas posé, la
-- tâche ne fait rien. Rien n'est donc appelé avant qu'on l'ait décidé.
-- ----------------------------------------------------------------------------
insert into public.admin_secrets_internes (cle, valeur)
values ('veille', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (cle) do nothing;

select cron.unschedule('veille')
 where exists (select 1 from cron.job where jobname = 'veille');

select cron.schedule('veille', '* * * * *', $$
  select net.http_post(
    url := r.valeur,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-secret', (select valeur from public.admin_secrets_internes where cle = 'veille')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  )
  from public.admin_veille_reglages r
  where r.cle = 'url_fonction';
$$);

-- ----------------------------------------------------------------------------
-- Prendre la prochaine étape due, d'un seul geste : deux passages simultanés
-- ne prennent jamais la même. Le verrou expire seul si la fonction est coupée.
-- Réservée à la fonction (rôle de service).
-- ----------------------------------------------------------------------------
create or replace function public.veille_prendre_etape(p_rapport uuid, p_genres text[])
returns setof public.admin_veille_etapes
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Une étape coupée à chaque passage finit abandonnée plutôt que reprise sans fin.
  update public.admin_veille_etapes
     set statut = 'abandon', erreur = 'Coupée en route trop de fois.', verrou_jusqua = null
   where rapport_id = p_rapport and statut = 'en_cours'
     and verrou_jusqua < now() and tentatives >= max_tentatives;

  return query
  update public.admin_veille_etapes e
     set statut = 'en_cours',
         tentatives = e.tentatives + 1,
         verrou_jusqua = now() + interval '4 minutes'
   where e.id = (
     select id from public.admin_veille_etapes
      where rapport_id = p_rapport
        and genre = any (p_genres)
        and prochain_passage <= now()
        and (statut in ('a_faire','attente')
             or (statut = 'en_cours' and verrou_jusqua < now() and tentatives < max_tentatives))
      order by prochain_passage
      limit 1
      for update skip locked)
  returning e.*;
end;
$$;
revoke all on function public.veille_prendre_etape(uuid, text[]) from public, anon, authenticated;
grant execute on function public.veille_prendre_etape(uuid, text[]) to service_role;

-- Ajouter une dépense d'un seul geste : deux étapes qui finissent ensemble ne
-- s'écrasent pas l'une l'autre, et le plafond reste juste.
create or replace function public.veille_ajouter_cout(p_rapport uuid, p_montant numeric)
returns void
language sql
security definer
set search_path = public
as $$
  update public.admin_veille_rapports set cout_usd = cout_usd + p_montant where id = p_rapport;
$$;
revoke all on function public.veille_ajouter_cout(uuid, numeric) from public, anon, authenticated;
grant execute on function public.veille_ajouter_cout(uuid, numeric) to service_role;

-- ----------------------------------------------------------------------------
-- Vigile répond aux questions : il cherche parmi les articles retenus de tous ses
-- rapports. Appelée avec le jeton de la personne (security invoker) : les droits
-- d'accès s'appliquent, rien n'est lu au-delà de ce qu'elle peut voir.
-- Un mot trouvé (au début d'un mot) dans le titre, sa traduction, le résumé ou l'extrait suffit ;
-- les accents et la casse sont ignorés.
-- ----------------------------------------------------------------------------
create or replace function public.veille_sans_accent(t text)
returns text
language sql
immutable
as $$
  select translate(lower(coalesce(t, '')),
    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ',
    'aaaaaaceeeeiiiinooooouuuuyyoa')
$$;

-- Publications retirées à la main (voir veille_retirer plus bas).
alter table public.admin_veille_articles add column if not exists retire_le timestamptz;
alter table public.admin_veille_articles add column if not exists retire_par text;
-- Toutes les colonnes ajoutées aux articles au fil des versions, posées ici, avant les fonctions qui les lisent
-- (une fonction SQL est vérifiée à sa création : ses colonnes doivent déjà exister).
alter table public.admin_veille_articles add column if not exists entreprise text;
alter table public.admin_veille_articles add column if not exists ville text;
alter table public.admin_veille_articles add column if not exists rapport_envoye_id uuid references public.admin_veille_rapports (id) on delete set null;
alter table public.admin_veille_articles add column if not exists trie_le timestamptz;
alter table public.admin_veille_articles add column if not exists urgent boolean not null default false;
alter table public.admin_veille_articles add column if not exists urgence text;
alter table public.admin_veille_articles add column if not exists alerte_envoyee_le timestamptz;
alter table public.admin_veille_articles add column if not exists alerte_reservee_le timestamptz;
alter table public.admin_veille_articles add column if not exists alerte_essais int not null default 0;

drop function if exists public.veille_chercher(text[], timestamptz, timestamptz, text, int);
create or replace function public.veille_chercher(
  p_mots text[], p_depuis timestamptz default null, p_jusqua timestamptz default null,
  p_rubrique text default null, p_limite int default 30)
returns table (
  id uuid, titre text, titre_fr text, url text, source text, nature text, publie_le timestamptz,
  rubrique text, importance int, resume text, pour_avisdoc text, lien_protege boolean, rapport_id uuid,
  trouve_le timestamptz, entreprise text, ville text, urgent boolean, urgence text)
language sql
stable
security invoker
set search_path = public
as $$
  -- publie_le reste vide quand la source ne donne pas de date : on ne fait pas passer la date de collecte pour une parution.
  select a.id, a.titre, a.titre_fr, a.url, a.source, a.nature, a.publie_le,
         a.rubrique, a.importance, a.resume, a.pour_avisdoc, a.lien_protege, a.rapport_id, a.premier_vu, a.entreprise, a.ville, a.urgent, a.urgence
    from public.admin_veille_articles a
   where a.verdict = 'retenu' and a.retire_le is null
     and (p_depuis is null or coalesce(a.publie_le, a.premier_vu) >= p_depuis)
     and (p_jusqua is null or coalesce(a.publie_le, a.premier_vu) < p_jusqua)
     and (p_rubrique is null or a.rubrique = p_rubrique)
     and (coalesce(array_length(p_mots, 1), 0) = 0 or exists (
           -- vingt mots au plus, de 2 à 60 caractères : une recherche reste légère
           select 1 from unnest(p_mots[1:20]) m
            where length(trim(m)) between 2 and 60
              -- au début d'un mot : « UV » trouve « UVB », pas « nouveau »
              and public.veille_sans_accent(concat_ws(' ', a.titre, a.titre_fr, a.resume, a.extrait, a.pour_avisdoc, a.entreprise, a.ville))
                  ~ ('\m' || regexp_replace(public.veille_sans_accent(trim(m)), '([.^$|?*+()\[\]{}\\])', '\\\1', 'g'))))
   -- Les « À ne pas rater » d'abord : ce sont eux qu'on doit trouver quand on demande les occasions à saisir.
   order by a.urgent desc, a.importance desc nulls last, coalesce(a.publie_le, a.premier_vu) desc
   limit least(greatest(coalesce(p_limite, 30), 1), 60)
$$;
revoke all on function public.veille_chercher(text[], timestamptz, timestamptz, text, int) from public, anon;
grant execute on function public.veille_chercher(text[], timestamptz, timestamptz, text, int) to authenticated, service_role;
grant execute on function public.veille_sans_accent(text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Les questions posées à Vigile : qui, quand, combien. Sert de plafond par
-- personne (une question coûte quelques centimes) et de suivi des dépenses.
-- ----------------------------------------------------------------------------
create table if not exists public.admin_veille_questions (
  id       uuid primary key default gen_random_uuid(),
  email    text not null,
  pose_le  timestamptz not null default now(),
  cout_usd numeric(10,4) not null default 0
);
create index if not exists idx_veille_questions_email on public.admin_veille_questions (lower(email), pose_le desc);
alter table public.admin_veille_questions enable row level security;
-- Chacun voit et pose les siennes ; la dépense se met à jour par la fonction (clé de service).
drop policy if exists "veille_questions" on public.admin_veille_questions;
create policy "veille_questions" on public.admin_veille_questions for all to authenticated
  using (public.a_le_module('veille') and lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (public.a_le_module('veille') and lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
-- Lecture seule pour chacun : une question ne s'enregistre que par veille_reserver_question, qui tient le plafond.
grant select on public.admin_veille_questions to authenticated;
grant all on public.admin_veille_questions to service_role;

-- Réserver une question d'un seul geste : un verrou par personne, le compte des 24 dernières heures, l'ajout.
-- Deux questions envoyées en même temps ne passent donc pas toutes les deux le plafond. Rend l'id, ou rien si plafond atteint.
create or replace function public.veille_reserver_question(p_max int)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_id uuid;
begin
  if not public.a_le_module('veille') then raise exception 'non autorisé'; end if;
  perform pg_advisory_xact_lock(hashtext('veille-question:' || v_email));
  if (select count(*) from public.admin_veille_questions
       where lower(email) = v_email and pose_le > now() - interval '24 hours') >= greatest(0, least(p_max, 500)) then
    return null;
  end if;
  insert into public.admin_veille_questions (email) values (v_email) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.veille_reserver_question(int) from public, anon;
grant execute on function public.veille_reserver_question(int) to authenticated, service_role;

-- ============================================================================
-- 26/10 — À surveiller en six catégories, et la veille sur les entreprises
-- ============================================================================
-- Les sources se rangent en deux catégories : la presse, et les sources
-- scientifiques et officielles. On peut en ajouter (un site ou un flux), les
-- suspendre (« Non suivi ») ou les supprimer depuis le Hub.
alter table public.admin_veille_sources add column if not exists categorie text not null default 'scientifique'
  check (categorie in ('presse','scientifique'));
alter table public.admin_veille_sources drop constraint if exists admin_veille_sources_genre_check;
alter table public.admin_veille_sources add constraint admin_veille_sources_genre_check
  check (genre in ('pubmed','europepmc','rss','site','boamp','medrxiv','clinicaltrials','linkup','perplexity','gemini'));
alter table public.admin_veille_sources add column if not exists created_by text;
update public.admin_veille_sources set categorie = 'presse' where genre in ('linkup','perplexity');

grant insert, update, delete on public.admin_veille_sources to authenticated;
-- Une base intégrée (PubMed, Perplexity…) se renomme ou se suspend, rien d'autre : son genre, sa clé et ses
-- réglages restent ceux de Vigile. Un site ou un flux ajouté reste un site ou un flux.
create or replace function public.veille_sources_figer()
returns trigger
language plpgsql
as $$
begin
  if old.genre not in ('site','rss') then
    new.genre := old.genre; new.params := old.params; new.cle := old.cle;
  elsif new.genre not in ('site','rss') then
    new.genre := old.genre;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_veille_sources_figer on public.admin_veille_sources;
create trigger trg_veille_sources_figer before update on public.admin_veille_sources
  for each row execute function public.veille_sources_figer();

drop policy if exists "veille_sources_modif" on public.admin_veille_sources;
create policy "veille_sources_modif" on public.admin_veille_sources for update to authenticated
  using (public.a_le_module('veille')) with check (public.a_le_module('veille'));
-- Ajouter ou supprimer : seulement les sites et flux ; les bases intégrées se suspendent, elles ne se suppriment pas.
drop policy if exists "veille_sources_ajout" on public.admin_veille_sources;
create policy "veille_sources_ajout" on public.admin_veille_sources for insert to authenticated
  with check (public.a_le_module('veille') and genre in ('site','rss'));
drop policy if exists "veille_sources_suppression" on public.admin_veille_sources;
create policy "veille_sources_suppression" on public.admin_veille_sources for delete to authenticated
  using (public.a_le_module('veille') and genre in ('site','rss'));

-- Réseaux : pages LinkedIn, Facebook… Vigile ne les lit pas directement ; il cherche ce qui en est indexé.
create table if not exists public.admin_veille_reseaux (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  plateforme  text not null default 'linkedin' check (plateforme in ('linkedin','facebook','instagram','x','youtube','autre')),
  url         text,
  notes       text not null default '',
  actif       boolean not null default true,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists trg_admin_veille_reseaux_updated on public.admin_veille_reseaux;
create trigger trg_admin_veille_reseaux_updated before update on public.admin_veille_reseaux
  for each row execute function public.set_updated_at();
alter table public.admin_veille_reseaux enable row level security;
drop policy if exists "veille_reseaux" on public.admin_veille_reseaux;
create policy "veille_reseaux" on public.admin_veille_reseaux for all to authenticated
  using (public.a_le_module('veille')) with check (public.a_le_module('veille'));
grant select, insert, update, delete on public.admin_veille_reseaux to authenticated;
grant all on public.admin_veille_reseaux to service_role;

-- Comptes : leur blog ou page d'actualités, lu à chaque rapport. Les influenceurs sont les comptes « personne ».
alter table public.admin_veille_comptes add column if not exists blog text;

-- Signaux d'entreprises : qui parle de la santé de ses salariés, et où.

insert into public.admin_veille_rubriques (nom, description, ordre) values
  ('Signaux d''entreprises', 'Une entreprise ou une collectivité (hors concurrents d''AvisDoc) qui dit publiquement se soucier de la santé ou du bien-être de ses salariés : QVT, prévention, semaine de la santé, bilans de santé, arrêts maladie, accidents du travail, travail en extérieur, canicule. Ce sont des clients potentiels pour AvisDoc.', 0)
on conflict do nothing;

insert into public.admin_veille_expressions (expression, rubrique_id)
select e, (select id from public.admin_veille_rubriques where nom = 'Signaux d''entreprises')
from unnest(array[
  'santé des salariés', 'bien-être au travail', 'qualité de vie au travail', 'prévention santé entreprise',
  'semaine de la santé au travail', 'bilan de santé salariés', 'risques professionnels entreprise',
  'salariés travail en extérieur', 'canicule salariés', 'arrêts maladie entreprise', 'accident du travail entreprise'
]) as e
on conflict do nothing;

-- Une seconde recherche approfondie, dédiée aux signaux d'entreprises (validée le 26/10, ≈ 0,9 $ par rapport).
insert into public.admin_veille_sources (cle, nom, genre, categorie, params) values
  ('perplexity-signaux', 'Perplexity — signaux d''entreprises', 'perplexity', 'presse', '{"mode":"signaux"}')
on conflict (cle) do nothing;

-- Sources en plus, relevées le 26/10/2026 : DÉCOCHÉES, c'est à AvisDoc de les cocher.
insert into public.admin_veille_sources (cle, nom, genre, categorie, params, actif) values
  ('rss-spf-cancers', 'Santé publique France — cancers', 'rss', 'scientifique', '{"url":"https://www.santepubliquefrance.fr/rss/1016"}', false),
  -- Les flux « UV » (dernier article en 2021) et « maladies liées au travail » (2025) sont à l'abandon : on cherche sur le site.
  ('site-spf', 'Santé publique France — recherche sur le site', 'site', 'scientifique', '{"url":"https://www.santepubliquefrance.fr"}', false),
  ('rss-inca', 'INCa (cancer.fr) — actualités', 'rss', 'scientifique', '{"url":"https://www.cancer.fr/rss/feed/actualites"}', false),
  ('site-anses', 'Anses', 'site', 'scientifique', '{"url":"https://www.anses.fr"}', false),
  ('site-inrs', 'INRS (santé au travail)', 'site', 'scientifique', '{"url":"https://www.inrs.fr"}', false),
  ('site-ameli', 'Assurance maladie (ameli)', 'site', 'scientifique', '{"url":"https://www.ameli.fr"}', false),
  ('site-sfd', 'Société française de dermatologie', 'site', 'scientifique', '{"url":"https://www.sfdermato.org"}', false),
  ('rss-quotidien', 'Le Quotidien du Médecin', 'rss', 'presse', '{"url":"https://www.lequotidiendumedecin.fr/rss.xml"}', false),
  -- Le flux d'Egora s'est arrêté en septembre 2025 : on cherche sur le site.
  ('site-egora', 'Egora', 'site', 'presse', '{"url":"https://www.egora.fr"}', false),
  ('rss-whatsupdoc', 'What''s up doc', 'rss', 'presse', '{"url":"https://www.whatsupdoc-lemag.fr/rss.xml"}', false),
  ('site-hospimedia', 'Hospimedia', 'site', 'presse', '{"url":"https://www.hospimedia.fr"}', false),
  ('site-ticsante', 'TICsanté', 'site', 'presse', '{"url":"https://www.ticsante.com"}', false),
  ('site-sante-travail', 'Santé & Travail', 'site', 'presse', '{"url":"https://www.sante-et-travail.fr"}', false),
  ('site-argus', 'L''Argus de l''assurance', 'site', 'presse', '{"url":"https://www.argusdelassurance.com"}', false),
  ('site-gazette', 'La Gazette des communes', 'site', 'presse', '{"url":"https://www.lagazettedescommunes.com"}', false)
on conflict (cle) do nothing;

-- Presse locale et régionale (26/10/2026) : 41 sites vérifiés (ils répondent ; ceux en 403 refusent seulement
-- les robots et sont lus par Linkup). Le Maine libre, Presse Océan, Le Courrier de l'Ouest et La Presse de la
-- Manche ne répondent plus : écartés. DÉCOCHÉS : c'est à AvisDoc de choisir.
insert into public.admin_veille_sources (cle, nom, genre, categorie, params, actif) values
  ('site-pqr-ouest-france-fr', 'Ouest-France', 'site', 'presse', '{"url":"https://ouest-france.fr"}', false),
  ('site-pqr-sudouest-fr', 'Sud Ouest', 'site', 'presse', '{"url":"https://sudouest.fr"}', false),
  ('site-pqr-lavoixdunord-fr', 'La Voix du Nord', 'site', 'presse', '{"url":"https://lavoixdunord.fr"}', false),
  ('site-pqr-leparisien-fr', 'Le Parisien', 'site', 'presse', '{"url":"https://leparisien.fr"}', false),
  ('site-pqr-leprogres-fr', 'Le Progrès', 'site', 'presse', '{"url":"https://leprogres.fr"}', false),
  ('site-pqr-ledauphine-com', 'Le Dauphiné libéré', 'site', 'presse', '{"url":"https://ledauphine.com"}', false),
  ('site-pqr-lamontagne-fr', 'La Montagne', 'site', 'presse', '{"url":"https://lamontagne.fr"}', false),
  ('site-pqr-midilibre-fr', 'Midi Libre', 'site', 'presse', '{"url":"https://midilibre.fr"}', false),
  ('site-pqr-ladepeche-fr', 'La Dépêche du Midi', 'site', 'presse', '{"url":"https://ladepeche.fr"}', false),
  ('site-pqr-laprovence-com', 'La Provence', 'site', 'presse', '{"url":"https://laprovence.com"}', false),
  ('site-pqr-nicematin-com', 'Nice-Matin', 'site', 'presse', '{"url":"https://nicematin.com"}', false),
  ('site-pqr-corsematin-com', 'Corse-Matin', 'site', 'presse', '{"url":"https://corsematin.com"}', false),
  ('site-pqr-estrepublicain-fr', 'L''Est Républicain', 'site', 'presse', '{"url":"https://estrepublicain.fr"}', false),
  ('site-pqr-dna-fr', 'Dernières Nouvelles d''Alsace', 'site', 'presse', '{"url":"https://dna.fr"}', false),
  ('site-pqr-lalsace-fr', 'L''Alsace', 'site', 'presse', '{"url":"https://lalsace.fr"}', false),
  ('site-pqr-republicain-lorrain-fr', 'Le Républicain lorrain', 'site', 'presse', '{"url":"https://republicain-lorrain.fr"}', false),
  ('site-pqr-vosgesmatin-fr', 'Vosges Matin', 'site', 'presse', '{"url":"https://vosgesmatin.fr"}', false),
  ('site-pqr-lunion-fr', 'L''Union', 'site', 'presse', '{"url":"https://lunion.fr"}', false),
  ('site-pqr-courrier-picard-fr', 'Courrier picard', 'site', 'presse', '{"url":"https://courrier-picard.fr"}', false),
  ('site-pqr-paris-normandie-fr', 'Paris-Normandie', 'site', 'presse', '{"url":"https://paris-normandie.fr"}', false),
  ('site-pqr-letelegramme-fr', 'Le Télégramme', 'site', 'presse', '{"url":"https://letelegramme.fr"}', false),
  ('site-pqr-lanouvellerepublique-fr', 'La Nouvelle République', 'site', 'presse', '{"url":"https://lanouvellerepublique.fr"}', false),
  ('site-pqr-lechorepublicain-fr', 'L''Écho républicain', 'site', 'presse', '{"url":"https://lechorepublicain.fr"}', false),
  ('site-pqr-larep-fr', 'La République du Centre', 'site', 'presse', '{"url":"https://larep.fr"}', false),
  ('site-pqr-leberry-fr', 'Le Berry républicain', 'site', 'presse', '{"url":"https://leberry.fr"}', false),
  ('site-pqr-lyonne-fr', 'L''Yonne républicaine', 'site', 'presse', '{"url":"https://lyonne.fr"}', false),
  ('site-pqr-lepopulaire-fr', 'Le Populaire du Centre', 'site', 'presse', '{"url":"https://lepopulaire.fr"}', false),
  ('site-pqr-lejsl-com', 'Le Journal de Saône-et-Loire', 'site', 'presse', '{"url":"https://lejsl.com"}', false),
  ('site-pqr-bienpublic-com', 'Le Bien public', 'site', 'presse', '{"url":"https://bienpublic.com"}', false),
  ('site-pqr-charentelibre-fr', 'Charente libre', 'site', 'presse', '{"url":"https://charentelibre.fr"}', false),
  ('site-pqr-larepubliquedespyrenees-fr', 'La République des Pyrénées', 'site', 'presse', '{"url":"https://larepubliquedespyrenees.fr"}', false),
  ('site-pqr-lindependant-fr', 'L''Indépendant', 'site', 'presse', '{"url":"https://lindependant.fr"}', false),
  ('site-pqr-centrepresseaveyron-fr', 'Centre Presse Aveyron', 'site', 'presse', '{"url":"https://centrepresseaveyron.fr"}', false),
  ('site-pqr-actu-fr', 'actu.fr (réseau d''hebdos locaux)', 'site', 'presse', '{"url":"https://actu.fr"}', false),
  ('site-pqr-france3-regions-franceinfo-fr', 'France 3 Régions', 'site', 'presse', '{"url":"https://france3-regions.franceinfo.fr"}', false),
  ('site-pqr-ici-fr', 'ici (ex-France Bleu)', 'site', 'presse', '{"url":"https://ici.fr"}', false),
  ('site-pqr-clicanoo-re', 'Le Journal de l''île de La Réunion', 'site', 'presse', '{"url":"https://clicanoo.re"}', false),
  ('site-pqr-linfo-re', 'Linfo.re (La Réunion)', 'site', 'presse', '{"url":"https://linfo.re"}', false),
  ('site-pqr-lejournaldemayotte-yt', 'Le Journal de Mayotte', 'site', 'presse', '{"url":"https://lejournaldemayotte.yt"}', false),
  ('site-pqr-guadeloupe-franceantilles-fr', 'France-Antilles Guadeloupe', 'site', 'presse', '{"url":"https://guadeloupe.franceantilles.fr"}', false),
  ('site-pqr-martinique-franceantilles-fr', 'France-Antilles Martinique', 'site', 'presse', '{"url":"https://martinique.franceantilles.fr"}', false)
on conflict (cle) do nothing;

-- Les moteurs de recherche (Linkup, Perplexity) ne sont pas de la presse : leur propre catégorie (26/10).
alter table public.admin_veille_sources drop constraint if exists admin_veille_sources_categorie_check;
alter table public.admin_veille_sources add constraint admin_veille_sources_categorie_check
  check (categorie in ('presse','scientifique','moteur'));
update public.admin_veille_sources set categorie = 'moteur' where genre in ('linkup','perplexity');

-- Gemini Deep Research (26/10) : listé pour qu'AvisDoc sache qu'il existe, mais NON ACTIF et non branché.
-- Il ne peut pas être allumé depuis le Hub tant que son appel n'est pas écrit et sa clé posée.
alter table public.admin_veille_sources drop constraint if exists admin_veille_sources_genre_check;
alter table public.admin_veille_sources add constraint admin_veille_sources_genre_check
  check (genre in ('pubmed','europepmc','rss','site','boamp','medrxiv','clinicaltrials','linkup','perplexity','gemini'));
insert into public.admin_veille_sources (cle, nom, genre, categorie, params, actif) values
  ('gemini', 'Gemini Deep Research (Google)', 'gemini', 'moteur',
   '{"note":"Non actif : environ 1 à 3 $ par recherche selon les tarifs publiés par Google (relevés le 17/10/2026), contre 0,16 à 0,87 $ pour Perplexity ; encore en version d''essai chez Google ; pas encore branché à Vigile (il faut une clé Google et son appel). À comparer d''abord avec Perplexity sur une même période avant de décider."}',
   false)
on conflict (cle) do nothing;

create or replace function public.veille_sources_figer()
returns trigger
language plpgsql
as $$
begin
  if old.genre not in ('site','rss') then
    new.genre := old.genre; new.params := old.params; new.cle := old.cle;
  elsif new.genre not in ('site','rss') then
    new.genre := old.genre;
  end if;
  -- Un moteur pas encore branché reste éteint.
  if new.genre = 'gemini' then
    new.actif := false;
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 26/10 — Le rapport en axes, pour agir : À démarcher, À publier, Concurrents,
-- Publications scientifiques, Nouveautés. Chaque rubrique est rattachée à un axe
-- (À publier n'en a pas : ses idées de posts s'appuient sur tous les articles).
-- ----------------------------------------------------------------------------
alter table public.admin_veille_rubriques add column if not exists axe text not null default 'nouveautes'
  check (axe in ('demarcher','concurrents','publications','nouveautes'));
update public.admin_veille_rubriques set axe = 'demarcher'
 where nom in ('Signaux d''entreprises', 'Collectivités et appels d''offres', 'Mutuelles et prévoyance');
update public.admin_veille_rubriques set axe = 'concurrents' where nom = 'Concurrence';
update public.admin_veille_rubriques set axe = 'publications' where nom in ('Recherche médicale', 'Dermatologie');

-- Les idées de posts de chaque rapport (jamais publiées automatiquement).
alter table public.admin_veille_rapports add column if not exists posts jsonb not null default '[]'::jsonb;

-- Une fiche prospect créée depuis le rapport de Vigile le dit dans son historique (« Repérée par Vigile »).
alter table public.admin_prospects add column if not exists origine text;

-- ============================================================================
-- 26/10 — En direct : Vigile cherche aussi entre deux rapports
-- ============================================================================
-- Trois natures de passage :
--   • rapport     — lun/mer/ven 9 h : Perplexity (veille + signaux), puis il reprend tout ce que les tournées
--                   ont trouvé depuis, rédige les points clés et les posts, et part par mail ;
--   • quotidienne — chaque jour 7 h : toutes les sources sauf Perplexity (Linkup compris) ;
--   • legere      — toutes les 3 h : seulement les sources gratuites et illimitées (bases, flux).
-- Une tournée s'arrête après le tri (statut « termine ») : ses articles apparaissent aussitôt « En direct ».
-- Chaque nature a sa propre période : la quotidienne part de la fin de la quotidienne précédente.
alter table public.admin_veille_rapports add column if not exists nature text not null default 'rapport'
  check (nature in ('rapport','quotidienne','legere'));
alter table public.admin_veille_rapports drop constraint if exists admin_veille_rapports_periode_fin_key;
create unique index if not exists uq_veille_rapports_nature_fin on public.admin_veille_rapports (nature, periode_fin);
alter table public.admin_veille_rapports drop constraint if exists admin_veille_rapports_statut_check;
alter table public.admin_veille_rapports add constraint admin_veille_rapports_statut_check
  check (statut in ('collecte','verification','synthese','pret','envoi','envoye','termine','echec'));

-- La provenance (rapport_id : le passage qui a trouvé l'article) et l'inclusion dans un mail
-- (rapport_envoye_id : le rapport qui le reprend) sont deux choses. trie_le : quand l'article est devenu visible.
create index if not exists idx_veille_articles_envoye on public.admin_veille_articles (rapport_envoye_id);
create index if not exists idx_veille_articles_direct on public.admin_veille_articles (trie_le desc) where verdict = 'retenu';
-- Les rapports déjà faits gardent leurs articles.
update public.admin_veille_articles a set rapport_envoye_id = a.rapport_id
 where a.rapport_envoye_id is null and a.verdict = 'retenu'
   and exists (select 1 from public.admin_veille_rapports r where r.id = a.rapport_id and r.nature = 'rapport');
update public.admin_veille_articles set trie_le = premier_vu where trie_le is null and verdict is not null;

-- Le rapport reprend, d'un seul geste, tout ce qui a été retenu et n'est encore dans aucun rapport.
-- Un article trié plus tard ira au rapport suivant : un rapport prêt ou envoyé ne change jamais.
create or replace function public.veille_rattacher(p_rapport uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  with pris as (
    update public.admin_veille_articles a set rapport_envoye_id = p_rapport
     where a.rapport_envoye_id is null and a.verdict = 'retenu' and a.retire_le is null
       and exists (select 1 from public.admin_veille_rapports r
                    where r.id = p_rapport and r.nature = 'rapport' and r.statut = 'synthese')
    returning 1)
  select count(*)::int from pris;
$$;
revoke all on function public.veille_rattacher(uuid) from public, anon, authenticated;
grant execute on function public.veille_rattacher(uuid) to service_role;

-- Ce qui a été confié à un commercial : une fiche, une personne, un seul mail même si l'on reclique.
create table if not exists public.admin_veille_confies (
  id          uuid primary key default gen_random_uuid(),
  article_id  uuid references public.admin_veille_articles (id) on delete set null,
  prospect_id uuid not null,
  referent    text not null,
  par         text not null,
  mail_id     text,
  created_at  timestamptz not null default now(),
  unique (prospect_id, referent)
);
alter table public.admin_veille_confies enable row level security;
drop policy if exists "veille_confies_lecture" on public.admin_veille_confies;
create policy "veille_confies_lecture" on public.admin_veille_confies for select to authenticated using (public.a_le_module('veille'));
grant select on public.admin_veille_confies to authenticated;
grant all on public.admin_veille_confies to service_role;

-- ============================================================================
-- 26/10 — Les collectivités et les déserts médicaux
-- ============================================================================
-- « À démarcher » devient deux cases : les entreprises, et les collectivités (mairies, départements, régions).
alter table public.admin_veille_rubriques drop constraint if exists admin_veille_rubriques_axe_check;
alter table public.admin_veille_rubriques add constraint admin_veille_rubriques_axe_check
  check (axe in ('demarcher','collectivites','mutuelles','evenements','concurrents','publications','nouveautes','nous'));
update public.admin_veille_rubriques set axe = 'collectivites' where nom = 'Collectivités et appels d''offres';

insert into public.admin_veille_rubriques (nom, description, ordre, axe) values
  ('Collectivités et déserts médicaux',
   'Une mairie, une communauté de communes, un département ou une région qui parle de désert médical, du manque de médecins et surtout de dermatologues, ou qui cherche une solution pour que ses habitants se fassent soigner (téléconsultation, centre de santé, contrat local de santé). C''est un client potentiel pour AvisDoc : nommez la collectivité dans « entreprise ».',
   1, 'collectivites')
on conflict do nothing;

-- Une expression se cherche en presse et sur le web, et, si on le veut, aussi sur les réseaux sociaux
-- (six recherches au lieu d'une : au-delà du quota gratuit de Linkup).
alter table public.admin_veille_expressions add column if not exists reseaux boolean not null default true;

insert into public.admin_veille_expressions (expression, rubrique_id, reseaux)
select e, (select id from public.admin_veille_rubriques where nom = 'Collectivités et déserts médicaux'), false
from unnest(array[
  'désert médical dermatologue', 'pénurie de dermatologues', 'accès aux soins dermatologiques',
  'délai rendez-vous dermatologue', 'téléconsultation mairie', 'cabine de téléconsultation commune',
  'centre de santé municipal', 'contrat local de santé', 'maison de santé', 'désert médical département',
  'santé des habitants commune'
]) as e
on conflict do nothing;

-- Le verrou des bases intégrées ne vise que les modifications faites depuis le Hub (rôle authenticated) :
-- une migration (postgres) peut toujours régler leurs paramètres.
create or replace function public.veille_sources_figer()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated' then
    if old.genre not in ('site','rss') then
      new.genre := old.genre; new.params := old.params; new.cle := old.cle;
    elsif new.genre not in ('site','rss') then
      new.genre := old.genre;
    end if;
  end if;
  -- Un moteur pas encore branché reste éteint, quoi qu'il arrive.
  if new.genre = 'gemini' then
    new.actif := false;
  end if;
  return new;
end;
$$;

-- Les appels d'offres : aussi la télémédecine et l'accès aux soins.
update public.admin_veille_sources
   set params = jsonb_set(params, '{mots}', (params->'mots') || '["télémédecine","téléconsultation","télé-expertise","accès aux soins"]'::jsonb)
 where cle = 'boamp' and not ((params->'mots') ? 'télémédecine');

-- ============================================================================
-- 26/10 — « À ne pas rater » : Vigile repère l'urgent et prévient tout de suite
-- ============================================================================
-- urgent : décidé au tri (appel d'offres pour AvisDoc, demande explicite d'une solution, campagne annoncée,
-- concurrent qui signe…) ; urgence : la raison en une phrase ; alerte_envoyee_le : le mail est parti, une seule fois.
-- Une publication lue et sans intérêt se retire : elle disparaît des écrans, des rapports à venir et des réponses de Vigile.
-- Rien n'est effacé : « Annuler » la remet.
create or replace function public.veille_retirer(p_id uuid, p_retirer boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.a_le_module('veille') then raise exception 'non autorisé'; end if;
  update public.admin_veille_articles
     set retire_le = case when p_retirer then now() end,
         retire_par = case when p_retirer then lower(coalesce(auth.jwt() ->> 'email', '')) end
   where id = p_id and verdict = 'retenu';
end;
$$;
revoke all on function public.veille_retirer(uuid, boolean) from public, anon;
grant execute on function public.veille_retirer(uuid, boolean) to authenticated, service_role;

create index if not exists idx_veille_articles_urgent on public.admin_veille_articles (trie_le desc) where urgent and verdict = 'retenu';

-- Qui veut recevoir l'alerte par mail dès qu'un « À ne pas rater » arrive : chacun s'inscrit lui-même.
create table if not exists public.admin_veille_alertes (
  email      text primary key,
  created_at timestamptz not null default now()
);
alter table public.admin_veille_alertes enable row level security;
drop policy if exists "veille_alertes" on public.admin_veille_alertes;
create policy "veille_alertes" on public.admin_veille_alertes for all to authenticated
  using (public.a_le_module('veille') and lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (public.a_le_module('veille') and lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
grant select, insert, update, delete on public.admin_veille_alertes to authenticated;
grant all on public.admin_veille_alertes to service_role;

-- Réserver d'un seul geste les « À ne pas rater » pas encore signalés (triés depuis moins de 24 h) : deux passages
-- simultanés ne prennent pas les mêmes. Une réservation dure 10 minutes ; après 5 essais, on n'insiste plus.
create or replace function public.veille_prendre_alertes()
returns setof uuid
language sql
security definer
set search_path = public
as $$
  update public.admin_veille_articles set alerte_reservee_le = now(), alerte_essais = alerte_essais + 1
   where urgent and verdict = 'retenu' and retire_le is null and alerte_envoyee_le is null
     and trie_le > now() - interval '24 hours' and alerte_essais < 5
     and (alerte_reservee_le is null or alerte_reservee_le < now() - interval '10 minutes')
  returning id;
$$;
revoke all on function public.veille_prendre_alertes() from public, anon, authenticated;
grant execute on function public.veille_prendre_alertes() to service_role;

-- ============================================================================
-- 26/10 — Les événements : salons, congrès, courses contre le cancer
-- ============================================================================
-- Une case de plus : où AvisDoc peut exposer, aller, sponsoriser, ou ce qu'elle peut relayer.
alter table public.admin_veille_rubriques drop constraint if exists admin_veille_rubriques_axe_check;
alter table public.admin_veille_rubriques add constraint admin_veille_rubriques_axe_check
  check (axe in ('demarcher','collectivites','mutuelles','evenements','concurrents','publications','nouveautes','nous'));

insert into public.admin_veille_rubriques (nom, description, ordre, axe) values
  ('Salons et événements',
   'Un salon, un congrès, une conférence, une course ou une journée à venir où AvisDoc peut exposer, aller rencontrer des clients, sponsoriser, ou qu''elle peut relayer : santé et bien-être au travail, QVT, ressources humaines, prévention, dermatologie, courses et journées contre le cancer (Octobre Rose, Movember, prévention des cancers de la peau). Une entreprise qui organise une action pour ses propres salariés reste dans « Signaux d''entreprises ».',
   1, 'evenements')
on conflict do nothing;

insert into public.admin_veille_expressions (expression, rubrique_id, reseaux)
select e, (select id from public.admin_veille_rubriques where nom = 'Salons et événements'), false
from unnest(array[
  'salon santé au travail', 'salon bien-être au travail', 'salon qualité de vie au travail', 'Préventica',
  'congrès dermatologie', 'course contre le cancer', 'sponsoring Octobre Rose',
  'journée nationale de prévention des cancers de la peau'
]) as e
on conflict do nothing;

-- ============================================================================
-- 28/10 — Les conversations avec Vigile : chacun retrouve les siennes, et elles seules
-- ============================================================================
create table if not exists public.admin_veille_conversations (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  titre       text not null,
  messages    jsonb not null default '[]',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_veille_conversations_email on public.admin_veille_conversations (lower(email), updated_at desc);
drop trigger if exists trg_veille_conversations_updated on public.admin_veille_conversations;
create trigger trg_veille_conversations_updated before update on public.admin_veille_conversations
  for each row execute function public.set_updated_at();
alter table public.admin_veille_conversations enable row level security;
drop policy if exists "veille_conversations" on public.admin_veille_conversations;
create policy "veille_conversations" on public.admin_veille_conversations for all to authenticated
  using (public.a_le_module('veille') and lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (public.a_le_module('veille') and lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
grant select, insert, update, delete on public.admin_veille_conversations to authenticated;
grant all on public.admin_veille_conversations to service_role;

-- ============================================================================
-- 30/10 — Ce qu'on dit d'AvisDoc ; supprimer pour de bon ; les pastilles de chaque onglet
-- ============================================================================
-- Une case de plus : ce que les autres disent d'AvisDoc, partout sur le web et les réseaux.
alter table public.admin_veille_rubriques drop constraint if exists admin_veille_rubriques_axe_check;
alter table public.admin_veille_rubriques add constraint admin_veille_rubriques_axe_check
  check (axe in ('demarcher','collectivites','mutuelles','evenements','concurrents','publications','nouveautes','nous'));

insert into public.admin_veille_rubriques (nom, description, ordre, axe) values
  ('Ce qu''on dit d''AvisDoc',
   'Tout ce que d''autres disent d''AvisDoc, la télé-expertise dermatologique : article de presse, avis, commentaire, post ou réponse sur un réseau social, mention par un client, un médecin, un partenaire ou un concurrent, même en passant. Seulement AvisDoc, la société : pas un « avis » de médecin ni un autre service au nom proche. Pas ce qu''AvisDoc publie elle-même (son site, sa page LinkedIn).',
   1, 'nous')
on conflict do nothing;

-- Cherchées partout, réseaux sociaux compris ; on en ajoute depuis l'onglet « Ce qu'on dit de nous ».
insert into public.admin_veille_expressions (expression, rubrique_id, reseaux)
select e, (select id from public.admin_veille_rubriques where nom = 'Ce qu''on dit d''AvisDoc'), true
from unnest(array['AvisDoc', 'avisdoc.fr']) as e
on conflict do nothing;

-- Une publication supprimée l'est pour de bon ; seule sa clé reste, pour qu'aucune tournée ne la ramène.
create table if not exists public.admin_veille_supprimes (
  cle          text primary key,
  supprime_le  timestamptz not null default now(),
  supprime_par text
);
alter table public.admin_veille_supprimes enable row level security;
grant all on public.admin_veille_supprimes to service_role;

create or replace function public.veille_ecarter_supprimes()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.admin_veille_supprimes where cle = new.cle) then return null; end if;
  return new;
end;
$$;
drop trigger if exists trg_veille_ecarter_supprimes on public.admin_veille_articles;
create trigger trg_veille_ecarter_supprimes before insert on public.admin_veille_articles
  for each row execute function public.veille_ecarter_supprimes();

create or replace function public.veille_supprimer(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_cle text;
begin
  if not public.a_le_module('veille') then raise exception 'non autorisé'; end if;
  select cle into v_cle from public.admin_veille_articles where id = p_id and verdict = 'retenu';
  if v_cle is null then return; end if;
  insert into public.admin_veille_supprimes (cle, supprime_par) values (v_cle, lower(coalesce(auth.jwt() ->> 'email', '')))
    on conflict (cle) do nothing;
  delete from public.admin_veille_articles where id = p_id;
end;
$$;
revoke all on function public.veille_supprimer(uuid) from public, anon;
grant execute on function public.veille_supprimer(uuid) to authenticated, service_role;

-- La dernière fois que chacun a ouvert chaque onglet (En direct, Commercial › Veille) : ce qui est arrivé
-- depuis compte dans sa pastille rouge.
create table if not exists public.admin_veille_onglets_vus (
  email   text not null,
  onglet  text not null,
  vu_le   timestamptz not null default now(),
  primary key (email, onglet)
);
alter table public.admin_veille_onglets_vus enable row level security;
drop policy if exists "veille_onglets_vus" on public.admin_veille_onglets_vus;
create policy "veille_onglets_vus" on public.admin_veille_onglets_vus for all to authenticated
  using (public.a_le_module('veille') and lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (public.a_le_module('veille') and lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
grant select, insert, update on public.admin_veille_onglets_vus to authenticated;
grant all on public.admin_veille_onglets_vus to service_role;

-- ============================================================================
-- 30/10 (suite) — Entreprises privées seules à démarcher ; une case Mutuelles ; le coût de la veille (CPR)
-- ============================================================================
alter table public.admin_veille_rubriques drop constraint if exists admin_veille_rubriques_axe_check;
alter table public.admin_veille_rubriques add constraint admin_veille_rubriques_axe_check
  check (axe in ('demarcher','collectivites','mutuelles','evenements','concurrents','publications','nouveautes','nous'));

-- Commercial › Veille ne reçoit que des entreprises privées : les collectivités et établissements publics vont
-- aux collectivités, les mutuelles dans leur propre case.
update public.admin_veille_rubriques set description =
  'Une entreprise privée (société, groupe, PME, start-up, coopérative ; jamais une collectivité, un établissement public, une association, une mutuelle ni un concurrent d''AvisDoc) qui dit publiquement se soucier de la santé ou du bien-être de ses salariés : QVT, prévention, semaine de la santé, bilans de santé, arrêts maladie, accidents du travail, travail en extérieur, canicule. Ce sont des clients potentiels pour AvisDoc.'
 where nom = 'Signaux d''entreprises';
update public.admin_veille_rubriques set description =
  'Appels d''offres, contrats locaux de santé, campagnes de prévention des collectivités et des établissements publics (hôpitaux, Cned, Opco, bailleurs sociaux publics, administrations).'
 where nom = 'Collectivités et appels d''offres';
update public.admin_veille_rubriques set axe = 'mutuelles', description =
  'Tout ce qui concerne les mutuelles, complémentaires santé et assureurs santé : forfaits prévention, offres, contrats collectifs, partenariats, nouveautés.'
 where nom = 'Mutuelles et prévoyance';

-- CPR, le coût de la veille : par jour et par poste, par tournée ou rapport, et les recherches Linkup du mois.
create or replace function public.veille_cpr(p_jours int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_depuis timestamptz := now() - make_interval(days => greatest(1, least(p_jours, 366)));
begin
  if not public.a_le_module('veille') then raise exception 'non autorisé'; end if;
  return jsonb_build_object(
    'jours', (
      select coalesce(jsonb_agg(jsonb_build_object('jour', jour, 'tri', tri, 'rapport', rapport, 'perplexity', perplexity, 'questions', questions) order by jour desc), '[]')
      from (
        select jour,
               coalesce(sum(c) filter (where poste = 'tri'), 0) tri,
               coalesce(sum(c) filter (where poste = 'rapport'), 0) rapport,
               coalesce(sum(c) filter (where poste = 'perplexity'), 0) perplexity,
               coalesce(sum(c) filter (where poste = 'questions'), 0) questions
        from (
          select (e.updated_at at time zone 'Europe/Paris')::date jour,
                 case e.genre when 'tri' then 'tri' when 'points_cles' then 'rapport' else 'perplexity' end poste, e.cout_usd c
            from public.admin_veille_etapes e
           where e.cout_usd > 0 and e.genre in ('tri', 'points_cles', 'perplexity') and e.updated_at >= v_depuis
          union all
          select (q.pose_le at time zone 'Europe/Paris')::date, 'questions', q.cout_usd
            from public.admin_veille_questions q
           where q.cout_usd > 0 and q.pose_le >= v_depuis
        ) p
        group by jour
      ) j),
    'tournees', (
      select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'nature', r.nature, 'fin', r.periode_fin, 'statut', r.statut, 'cout', r.cout_usd,
               'trouves', (select count(*) from public.admin_veille_articles a where a.rapport_id = r.id),
               'gardes', (select count(*) from public.admin_veille_articles a where a.rapport_id = r.id and a.verdict = 'retenu'))
             order by r.periode_fin desc), '[]')
        from public.admin_veille_rapports r
       where r.periode_fin >= v_depuis and r.periode_fin <= now() + interval '1 day'),
    'linkup_mois', (
      select count(*) from public.admin_veille_etapes e
       where e.genre = 'collecte' and (e.params->>'source' in ('linkup', 'web') or e.cle like 'site-%')
         and e.created_at >= date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')
  );
end;
$$;
revoke all on function public.veille_cpr(int) from public, anon;
grant execute on function public.veille_cpr(int) to authenticated, service_role;

-- ============================================================================
-- 30/10 (fin) — Le budget du mois de la veille : un curseur (administrateurs), un mail à 80 % puis à 100 %
-- ============================================================================
-- Une seule ligne. Rien n'est coupé quand le budget est atteint : on prévient (décision d'Olivier, 30/10).
create table if not exists public.admin_veille_budget (
  id            boolean primary key default true check (id),
  montant_usd   numeric not null default 30 check (montant_usd between 0 and 500),
  alerte80_mois text,   -- « 2026-10 » : le mail des 80 % est parti ce mois-là
  alerte100_mois text,
  prevenir      text,   -- qui reçoit les alertes : le dernier administrateur qui a réglé le budget
  updated_at    timestamptz not null default now()
);
insert into public.admin_veille_budget (id) values (true) on conflict do nothing;
alter table public.admin_veille_budget enable row level security;
drop policy if exists "veille_budget_lecture" on public.admin_veille_budget;
create policy "veille_budget_lecture" on public.admin_veille_budget for select to authenticated using (public.a_le_module('veille'));
grant select on public.admin_veille_budget to authenticated;
grant all on public.admin_veille_budget to service_role;

-- Ce que la veille a coûté depuis le 1er du mois (heure de Paris) : tri, rapport, Perplexity, questions à Vigile.
create or replace function public.veille_depense_du_mois()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with debut as (select date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris' d)
  select coalesce((select sum(e.cout_usd) from public.admin_veille_etapes e, debut
                    where e.cout_usd > 0 and e.genre in ('tri', 'points_cles', 'perplexity') and e.updated_at >= debut.d), 0)
       + coalesce((select sum(q.cout_usd) from public.admin_veille_questions q, debut
                    where q.cout_usd > 0 and q.pose_le >= debut.d), 0);
$$;
revoke all on function public.veille_depense_du_mois() from public, anon, authenticated;
grant execute on function public.veille_depense_du_mois() to service_role;

-- Régler le budget : administrateurs seulement. Changer le montant relance les alertes du mois.
create or replace function public.veille_regler_budget(p_montant numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if not (public.is_avisdoc_user() and exists (select 1 from public.admin_superadmins s where lower(s.email) = v_email)) then
    raise exception 'réservé aux administrateurs';
  end if;
  if p_montant is null or p_montant < 0 or p_montant > 500 then raise exception 'montant hors bornes (0 à 500 $)'; end if;
  update public.admin_veille_budget
     set montant_usd = round(p_montant), alerte80_mois = null, alerte100_mois = null, prevenir = v_email, updated_at = now()
   where id;
end;
$$;
revoke all on function public.veille_regler_budget(numeric) from public, anon;
grant execute on function public.veille_regler_budget(numeric) to authenticated, service_role;
