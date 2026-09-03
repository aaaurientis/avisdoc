-- ============================================================================
-- AvisDoc — Module de prospection (prospection.avisdoc.fr)
-- Projet Supabase VITRINE (fmchuaxxchghfagfpvwn), schéma dédié « prospection ».
--
-- Pourquoi ce projet et pas celui de la plateforme : la plateforme héberge des
-- données de santé nominatives et porte le dossier HDS. La prospection B2B est
-- un traitement distinct (base légale, finalité, durée, personnes concernées).
-- Aucune table de ce schéma n'est référencée depuis le domaine téléexpertise,
-- et réciproquement.
--
-- Principes :
--   - RLS sur toutes les tables, accès réservé aux membres @avisdoc.fr ;
--   - le front ne modifie JAMAIS contact.statut : un trigger le refuse, seule
--     prospection.transition_contact() (fonction serveur) peut le faire ;
--   - interactions et relances ne s'écrivent que par fonctions serveur
--     (marquer_envoye, enregistrer_reponse, ajouter_note) ;
--   - aucun champ libre non borné : les notes sont typées et limitées ;
--   - aucune donnée de santé, aucune inférence sur la santé.
--
-- À exécuter via le SQL Editor du projet VITRINE, ou `supabase db push` avec
-- `--workdir supabase-prospection`. Idempotent.
-- ============================================================================

create schema if not exists prospection;

-- ----------------------------------------------------------------------------
-- Types
-- ----------------------------------------------------------------------------
do $$ begin
  create type prospection.type_compte as enum
    ('courtier', 'qvct', 'evenementiel', 'entreprise', 'mutuelle', 'grossiste');
exception when duplicate_object then null; end $$;

do $$ begin
  create type prospection.statut_compte as enum ('a_qualifier', 'cible', 'ecarte');
exception when duplicate_object then null; end $$;

do $$ begin
  create type prospection.statut_contact as enum
    ('a_qualifier', 'a_contacter', 'invite', 'accepte', 'en_conversation',
     'partenaire', 'refus', 'arrete');
exception when duplicate_object then null; end $$;

do $$ begin
  create type prospection.niveau_contact as enum
    ('associe', 'directeur', 'vp', 'responsable', 'charge');
exception when duplicate_object then null; end $$;

do $$ begin
  create type prospection.canal as enum ('linkedin', 'email', 'telephone', 'salon');
exception when duplicate_object then null; end $$;

do $$ begin
  create type prospection.sens as enum ('sortant', 'entrant');
exception when duplicate_object then null; end $$;

do $$ begin
  -- « email » s'ajoute à la liste du brief : un échange email rattaché par
  -- Gmail n'est ni une réponse LinkedIn ni une note interne.
  create type prospection.type_interaction as enum
    ('invitation', 'message_valeur', 'partage_contenu', 'proposition',
     'reponse', 'note', 'email');
exception when duplicate_object then null; end $$;

do $$ begin
  create type prospection.echeance as enum ('j5', 'j12', 'j21');
exception when duplicate_object then null; end $$;

do $$ begin
  create type prospection.etat_relance as enum ('en_attente', 'fait', 'annule');
exception when duplicate_object then null; end $$;

do $$ begin
  create type prospection.motif_exclusion as enum
    ('opposition', 'client_existant', 'portefeuille_tiers', 'autre');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Helpers d'identité
-- ----------------------------------------------------------------------------

-- Email du compte appelant (vide pour la clé service).
create or replace function prospection.acteur()
returns text language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '')
$$;

-- Membre de l'organisation AvisDoc ?
create or replace function prospection.est_membre()
returns boolean language sql stable as $$
  select prospection.acteur() ilike '%@avisdoc.fr'
$$;

-- Membre OU appel serveur (Edge Function avec la clé service_role).
create or replace function prospection.est_membre_ou_service()
returns boolean language sql stable as $$
  select prospection.est_membre()
      or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
$$;

-- ----------------------------------------------------------------------------
-- Normalisation
-- ----------------------------------------------------------------------------

-- URL LinkedIn canonique : https://www.linkedin.com/in/xxx (sans requête, sans
-- barre finale, en minuscules). Sert de clé de dédoublonnage et d'exclusion.
create or replace function prospection.normaliser_linkedin(p text)
returns text language sql immutable as $$
  select case
    when nullif(btrim(coalesce(p, '')), '') is null then null
    else 'https://www.linkedin.com/' || regexp_replace(
      regexp_replace(
        regexp_replace(lower(btrim(p)), '^(https?://)?([a-z]{2,3}\.)?linkedin\.com/', ''),
        '[?#].*$', ''),
      '/+$', '')
  end
$$;

create or replace function prospection.normaliser_email(p text)
returns text language sql immutable as $$
  select nullif(lower(btrim(coalesce(p, ''))), '')
$$;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- Trace d'origine de chaque ligne (exigée par le registre RGPD).
create table if not exists prospection.import (
  id               uuid primary key default gen_random_uuid(),
  libelle_liste    text not null check (char_length(libelle_liste) between 1 and 120),
  fichier_nom      text not null check (char_length(fichier_nom) <= 255),
  lignes_lues      integer not null default 0,
  lignes_creees    integer not null default 0,
  lignes_maj       integer not null default 0,
  lignes_ignorees  integer not null default 0,
  detail_ignorees  jsonb not null default '{}'::jsonb,
  importe_le       timestamptz not null default now(),
  importe_par      text not null default prospection.acteur()
);

create table if not exists prospection.compte (
  id            uuid primary key default gen_random_uuid(),
  nom           text not null check (char_length(nom) between 1 and 160),
  type          prospection.type_compte not null default 'entreprise',
  effectif_min  integer check (effectif_min >= 0),
  effectif_max  integer check (effectif_max >= 0),
  secteur       text check (char_length(secteur) <= 120),
  expose        boolean not null default false,
  region        text check (char_length(region) <= 80),
  site_web      text check (char_length(site_web) <= 255),
  linkedin_url  text check (char_length(linkedin_url) <= 255),
  cercle        smallint check (cercle between 1 and 3),
  score         integer not null default 0,
  statut        prospection.statut_compte not null default 'a_qualifier',
  import_id     uuid references prospection.import (id) on delete set null,
  cree_le       timestamptz not null default now(),
  maj_le        timestamptz not null default now()
);
create unique index if not exists compte_linkedin_url_unq
  on prospection.compte (linkedin_url) where linkedin_url is not null;
create unique index if not exists compte_nom_unq
  on prospection.compte (lower(nom));

create table if not exists prospection.contact (
  id                     uuid primary key default gen_random_uuid(),
  compte_id              uuid references prospection.compte (id) on delete set null,
  prenom                 text not null default '' check (char_length(prenom) <= 80),
  nom                    text not null check (char_length(nom) between 1 and 80),
  fonction               text check (char_length(fonction) <= 120),
  niveau                 prospection.niveau_contact,
  linkedin_url           text check (char_length(linkedin_url) <= 255),
  email                  text check (char_length(email) <= 255),
  anciennete_poste_mois  integer check (anciennete_poste_mois >= 0),
  -- Signaux déclaratifs, datés : [{code:'PR-03', constate_le:'2026-09-01', detail?:'...'}]
  signaux                jsonb not null default '[]'::jsonb,
  -- Cache de tri : la vérité est la fonction de score rejouée à l'affichage.
  score                  integer not null default 0,
  statut                 prospection.statut_contact not null default 'a_qualifier',
  import_id              uuid references prospection.import (id) on delete set null,
  -- Jeton du lien d'opposition (dans chaque email) ; opaque, sans donnée.
  jeton_opposition       uuid not null default gen_random_uuid(),
  cree_le                timestamptz not null default now(),
  maj_le                 timestamptz not null default now()
);
create unique index if not exists contact_linkedin_url_unq
  on prospection.contact (linkedin_url) where linkedin_url is not null;
create unique index if not exists contact_email_unq
  on prospection.contact (email) where email is not null;
create unique index if not exists contact_jeton_unq
  on prospection.contact (jeton_opposition);
create index if not exists contact_statut_idx on prospection.contact (statut);
create index if not exists contact_compte_idx on prospection.contact (compte_id);

create table if not exists prospection.interaction (
  id                uuid primary key default gen_random_uuid(),
  contact_id        uuid not null references prospection.contact (id) on delete cascade,
  canal             prospection.canal not null,
  sens              prospection.sens not null,
  type              prospection.type_interaction not null,
  -- Texte des messages sortants que nous avons rédigés (600 caractères max).
  -- Pour un email entrant : un résumé court, jamais le corps.
  contenu           text not null default '' check (char_length(contenu) <= 600),
  objet             text check (char_length(objet) <= 200),
  email_thread_id   text check (char_length(email_thread_id) <= 120),
  email_message_id  text check (char_length(email_message_id) <= 120),
  -- Réponse entrante prise en compte par l'équipe (écran du jour).
  traitee_le        timestamptz,
  survenu_le        timestamptz not null default now(),
  cree_par          text not null default prospection.acteur(),
  cree_le           timestamptz not null default now()
);
create unique index if not exists interaction_email_message_unq
  on prospection.interaction (email_message_id) where email_message_id is not null;
create index if not exists interaction_contact_idx
  on prospection.interaction (contact_id, survenu_le desc);
create index if not exists interaction_invitations_jour_idx
  on prospection.interaction (cree_par, survenu_le) where type = 'invitation' and sens = 'sortant';

create table if not exists prospection.relance (
  id              uuid primary key default gen_random_uuid(),
  contact_id      uuid not null references prospection.contact (id) on delete cascade,
  echeance        prospection.echeance not null,
  du_le           date not null,
  etat            prospection.etat_relance not null default 'en_attente',
  interaction_id  uuid references prospection.interaction (id) on delete set null,
  cree_le         timestamptz not null default now(),
  unique (contact_id, echeance)
);
create index if not exists relance_a_faire_idx
  on prospection.relance (du_le) where etat = 'en_attente';

-- Liste d'exclusion : consultée à l'import et bloquante. Une opposition est
-- définitive ; un contact exclu n'est jamais recréé.
create table if not exists prospection.exclusion (
  id            uuid primary key default gen_random_uuid(),
  linkedin_url  text check (char_length(linkedin_url) <= 255),
  email         text check (char_length(email) <= 255),
  motif         prospection.motif_exclusion not null,
  cree_le       timestamptz not null default now(),
  check (linkedin_url is not null or email is not null)
);
create unique index if not exists exclusion_linkedin_unq
  on prospection.exclusion (linkedin_url) where linkedin_url is not null;
create unique index if not exists exclusion_email_unq
  on prospection.exclusion (email) where email is not null;

-- Journal : transitions, purges, oppositions, imports. Aucune donnée personnelle
-- en clair : identifiants et compteurs.
create table if not exists prospection.journal (
  id          uuid primary key default gen_random_uuid(),
  evenement   text not null check (char_length(evenement) <= 60),
  detail      jsonb not null default '{}'::jsonb,
  acteur      text not null default prospection.acteur(),
  survenu_le  timestamptz not null default now()
);

-- Synthèse hebdomadaire, générée le lundi matin, consultable et exportable.
create table if not exists prospection.synthese_hebdo (
  id                       uuid primary key default gen_random_uuid(),
  semaine                  date not null unique,          -- lundi de la semaine
  invitations              integer not null default 0,
  acceptations             integer not null default 0,
  taux_acceptation         numeric(5, 2),
  conversations_ouvertes   integer not null default 0,
  partenariats             integer not null default 0,
  relances_oubliees        integer not null default 0,
  par_cercle               jsonb not null default '[]'::jsonb,
  genere_le                timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Triggers : normalisation, bornes, garde du statut
-- ----------------------------------------------------------------------------

create or replace function prospection.set_maj_le()
returns trigger language plpgsql as $$
begin
  new.maj_le = now();
  return new;
end $$;

-- Codes de signaux admis (PR-01 à PR-10). Les critères structurels PR-2x se
-- déduisent du compte et du contact, ils ne se déclarent pas.
create or replace function prospection.valider_signaux(p jsonb)
returns boolean language plpgsql immutable as $$
declare s jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' then return false; end if;
  for s in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(s) <> 'object' then return false; end if;
    if not (s ->> 'code') ~ '^PR-(0[1-9]|10)$' then return false; end if;
    if (s ->> 'constate_le') is null or not (s ->> 'constate_le') ~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
    if char_length(coalesce(s ->> 'detail', '')) > 120 then return false; end if;
  end loop;
  return true;
end $$;

create or replace function prospection.avant_ecriture_contact()
returns trigger language plpgsql as $$
begin
  new.linkedin_url = prospection.normaliser_linkedin(new.linkedin_url);
  new.email = prospection.normaliser_email(new.email);
  new.prenom = btrim(coalesce(new.prenom, ''));
  new.nom = btrim(new.nom);
  if not prospection.valider_signaux(new.signaux) then
    raise exception 'signaux_invalides'
      using detail = 'Chaque signal porte un code PR-01 à PR-10, une date de constat et un détail de 120 caractères au plus.';
  end if;
  if tg_op = 'UPDATE' then
    -- Le statut ne change que par prospection.transition_contact().
    if new.statut is distinct from old.statut
       and coalesce(current_setting('prospection.transition', true), '') <> 'on' then
      raise exception 'statut_non_modifiable'
        using detail = 'Le statut change uniquement par la fonction serveur transition_contact.';
    end if;
    new.jeton_opposition = old.jeton_opposition;
    new.cree_le = old.cree_le;
  end if;
  new.maj_le = now();
  return new;
end $$;

drop trigger if exists trg_contact_avant_ecriture on prospection.contact;
create trigger trg_contact_avant_ecriture
  before insert or update on prospection.contact
  for each row execute function prospection.avant_ecriture_contact();

create or replace function prospection.avant_ecriture_compte()
returns trigger language plpgsql as $$
begin
  new.linkedin_url = prospection.normaliser_linkedin(new.linkedin_url);
  new.nom = btrim(new.nom);
  if tg_op = 'UPDATE' then new.cree_le = old.cree_le; end if;
  new.maj_le = now();
  return new;
end $$;

drop trigger if exists trg_compte_avant_ecriture on prospection.compte;
create trigger trg_compte_avant_ecriture
  before insert or update on prospection.compte
  for each row execute function prospection.avant_ecriture_compte();

create or replace function prospection.avant_ecriture_exclusion()
returns trigger language plpgsql as $$
begin
  new.linkedin_url = prospection.normaliser_linkedin(new.linkedin_url);
  new.email = prospection.normaliser_email(new.email);
  if new.linkedin_url is null and new.email is null then
    raise exception 'exclusion_vide' using detail = 'Une exclusion porte une URL LinkedIn ou un email.';
  end if;
  return new;
end $$;

drop trigger if exists trg_exclusion_avant_ecriture on prospection.exclusion;
create trigger trg_exclusion_avant_ecriture
  before insert or update on prospection.exclusion
  for each row execute function prospection.avant_ecriture_exclusion();

-- ----------------------------------------------------------------------------
-- Machine à états du contact
-- ----------------------------------------------------------------------------
--   a_qualifier → a_contacter → invite → accepte → en_conversation → partenaire
--                                     ↘ refus (depuis invite, accepte, en_conversation)
--                                     ↘ arrete (fin de séquence : depuis invite, accepte)
--   a_contacter → arrete (disqualification manuelle)
-- Toute autre transition est refusée avec un motif nommé.

create or replace function prospection.transition_autorisee(
  p_de prospection.statut_contact, p_vers prospection.statut_contact)
returns boolean language sql immutable as $$
  select (p_de::text, p_vers::text) in (
    ('a_qualifier', 'a_contacter'),
    ('a_contacter', 'invite'),
    ('invite', 'accepte'),
    ('accepte', 'en_conversation'),
    ('en_conversation', 'partenaire'),
    ('invite', 'refus'),
    ('accepte', 'refus'),
    ('en_conversation', 'refus'),
    ('invite', 'arrete'),
    ('accepte', 'arrete'),
    ('a_contacter', 'arrete')
  )
$$;

create or replace function prospection.transition_contact(
  p_contact_id uuid, p_vers prospection.statut_contact)
returns prospection.statut_contact
language plpgsql security definer set search_path = prospection, public as $$
declare v_de prospection.statut_contact;
begin
  if not prospection.est_membre_ou_service() then
    raise exception 'acces_refuse';
  end if;
  select statut into v_de from prospection.contact where id = p_contact_id for update;
  if not found then raise exception 'contact_introuvable'; end if;
  if v_de = p_vers then return v_de; end if;
  if not prospection.transition_autorisee(v_de, p_vers) then
    raise exception 'transition_refusee'
      using detail = format('%s vers %s', v_de, p_vers);
  end if;
  perform set_config('prospection.transition', 'on', true);
  update prospection.contact set statut = p_vers where id = p_contact_id;
  perform set_config('prospection.transition', '', true);
  -- Fin de parcours : plus aucune relance en attente.
  if p_vers in ('refus', 'arrete', 'partenaire') then
    update prospection.relance set etat = 'annule'
      where contact_id = p_contact_id and etat = 'en_attente';
  end if;
  insert into prospection.journal (evenement, detail)
    values ('transition', jsonb_build_object('contact_id', p_contact_id, 'de', v_de, 'vers', p_vers));
  return p_vers;
end $$;

-- ----------------------------------------------------------------------------
-- Plafond quotidien d'invitations (15 par jour et par identité)
-- ----------------------------------------------------------------------------
create or replace function prospection.plafond_invitations()
returns integer language sql immutable as $$ select 15 $$;

create or replace function prospection.invitations_du_jour()
returns integer language sql stable security definer set search_path = prospection, public as $$
  select count(*)::integer
  from prospection.interaction
  where type = 'invitation' and sens = 'sortant'
    and cree_par = prospection.acteur()
    and (survenu_le at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date
$$;

-- ----------------------------------------------------------------------------
-- Historisation d'un envoi (manuel, déclaratif) et armement des relances
-- ----------------------------------------------------------------------------
-- p_type : invitation | message_valeur (J+5) | partage_contenu (J+12) | proposition (J+21)
-- L'envoi lui-même est fait à la main dans LinkedIn ; ici on trace et on arme.
create or replace function prospection.marquer_envoye(
  p_contact_id uuid,
  p_type prospection.type_interaction,
  p_contenu text,
  p_survenu_le timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = prospection, public as $$
declare
  v_statut prospection.statut_contact;
  v_interaction_id uuid;
  v_echeance prospection.echeance;
  v_jour date := (p_survenu_le at time zone 'Europe/Paris')::date;
  v_maj integer;
begin
  if not prospection.est_membre() then raise exception 'acces_refuse'; end if;
  if p_type not in ('invitation', 'message_valeur', 'partage_contenu', 'proposition') then
    raise exception 'type_envoi_invalide' using detail = p_type::text;
  end if;
  if char_length(coalesce(p_contenu, '')) > 600 then
    raise exception 'contenu_trop_long' using detail = '600 caractères au plus.';
  end if;

  select statut into v_statut from prospection.contact where id = p_contact_id for update;
  if not found then raise exception 'contact_introuvable'; end if;

  if p_type = 'invitation' then
    if v_statut <> 'a_contacter' then
      raise exception 'transition_refusee' using detail = format('%s vers invite', v_statut);
    end if;
    if prospection.invitations_du_jour() >= prospection.plafond_invitations() then
      raise exception 'plafond_invitations_atteint'
        using detail = format('%s invitations par jour et par identité.', prospection.plafond_invitations());
    end if;
    insert into prospection.interaction (contact_id, canal, sens, type, contenu, survenu_le)
      values (p_contact_id, 'linkedin', 'sortant', 'invitation', coalesce(p_contenu, ''), p_survenu_le)
      returning id into v_interaction_id;
    perform prospection.transition_contact(p_contact_id, 'invite');
    -- Trois échéances : J+5, J+12, J+21. Deux relances effectives au maximum,
    -- la proposition J+21 clôt la séquence.
    insert into prospection.relance (contact_id, echeance, du_le) values
      (p_contact_id, 'j5',  v_jour + 5),
      (p_contact_id, 'j12', v_jour + 12),
      (p_contact_id, 'j21', v_jour + 21)
    on conflict (contact_id, echeance) do nothing;
  else
    if v_statut not in ('invite', 'accepte') then
      raise exception 'relance_hors_sequence'
        using detail = format('Le contact est « %s », la séquence de relances ne s''applique plus.', v_statut);
    end if;
    v_echeance := case p_type
      when 'message_valeur' then 'j5'::prospection.echeance
      when 'partage_contenu' then 'j12'::prospection.echeance
      else 'j21'::prospection.echeance end;
    insert into prospection.interaction (contact_id, canal, sens, type, contenu, survenu_le)
      values (p_contact_id, 'linkedin', 'sortant', p_type, coalesce(p_contenu, ''), p_survenu_le)
      returning id into v_interaction_id;
    update prospection.relance set etat = 'fait', interaction_id = v_interaction_id
      where contact_id = p_contact_id and echeance = v_echeance and etat = 'en_attente';
    get diagnostics v_maj = row_count;
    if v_maj = 0 then
      raise exception 'relance_introuvable'
        using detail = format('Aucune relance %s en attente pour ce contact.', v_echeance);
    end if;
    -- Après la proposition, la séquence s'arrête définitivement.
    if p_type = 'proposition' then
      perform prospection.transition_contact(p_contact_id, 'arrete');
    end if;
  end if;

  return jsonb_build_object(
    'interaction_id', v_interaction_id,
    'statut', (select statut from prospection.contact where id = p_contact_id),
    'invitations_restantes', prospection.plafond_invitations() - prospection.invitations_du_jour());
end $$;

-- Note interne typée et bornée (280 caractères). Jamais de donnée de santé.
create or replace function prospection.ajouter_note(
  p_contact_id uuid, p_canal prospection.canal, p_contenu text)
returns uuid
language plpgsql security definer set search_path = prospection, public as $$
declare v_id uuid;
begin
  if not prospection.est_membre() then raise exception 'acces_refuse'; end if;
  if char_length(coalesce(p_contenu, '')) not between 1 and 280 then
    raise exception 'note_hors_bornes' using detail = 'Entre 1 et 280 caractères.';
  end if;
  if not exists (select 1 from prospection.contact where id = p_contact_id) then
    raise exception 'contact_introuvable';
  end if;
  insert into prospection.interaction (contact_id, canal, sens, type, contenu)
    values (p_contact_id, p_canal, 'sortant', 'note', p_contenu)
    returning id into v_id;
  return v_id;
end $$;

-- Réponse entrante (LinkedIn saisie à la main, ou email rattaché par Gmail).
-- Annule les relances restantes et fait avancer le statut.
create or replace function prospection.enregistrer_reponse(
  p_contact_id uuid,
  p_canal prospection.canal,
  p_contenu text default '',
  p_survenu_le timestamptz default now(),
  p_objet text default null,
  p_email_thread_id text default null,
  p_email_message_id text default null)
returns jsonb
language plpgsql security definer set search_path = prospection, public as $$
declare
  v_statut prospection.statut_contact;
  v_id uuid;
begin
  if not prospection.est_membre_ou_service() then raise exception 'acces_refuse'; end if;
  if char_length(coalesce(p_contenu, '')) > 600 then
    raise exception 'contenu_trop_long' using detail = '600 caractères au plus.';
  end if;
  select statut into v_statut from prospection.contact where id = p_contact_id for update;
  if not found then raise exception 'contact_introuvable'; end if;
  if v_statut in ('a_qualifier', 'a_contacter') then
    raise exception 'reponse_hors_sequence'
      using detail = format('Le contact est « %s » : aucune sollicitation n''a été tracée.', v_statut);
  end if;
  if p_email_message_id is not null and exists (
      select 1 from prospection.interaction where email_message_id = p_email_message_id) then
    return jsonb_build_object('deja_connue', true, 'statut', v_statut);
  end if;

  insert into prospection.interaction
    (contact_id, canal, sens, type, contenu, objet, email_thread_id, email_message_id, survenu_le, cree_par)
  values
    (p_contact_id, p_canal, 'entrant',
     case when p_canal = 'email' then 'email'::prospection.type_interaction else 'reponse'::prospection.type_interaction end,
     coalesce(p_contenu, ''), p_objet, p_email_thread_id, p_email_message_id, p_survenu_le,
     case when prospection.acteur() = '' then 'gmail' else prospection.acteur() end)
  returning id into v_id;

  -- Une réponse annule automatiquement les relances restantes.
  update prospection.relance set etat = 'annule'
    where contact_id = p_contact_id and etat = 'en_attente';

  if v_statut = 'invite' then
    perform prospection.transition_contact(p_contact_id, 'accepte');
    perform prospection.transition_contact(p_contact_id, 'en_conversation');
  elsif v_statut = 'accepte' then
    perform prospection.transition_contact(p_contact_id, 'en_conversation');
  end if;

  return jsonb_build_object(
    'interaction_id', v_id,
    'statut', (select statut from prospection.contact where id = p_contact_id));
end $$;

-- Marque une réponse entrante comme prise en compte (écran du jour).
create or replace function prospection.marquer_traitee(p_interaction_id uuid)
returns void language plpgsql security definer set search_path = prospection, public as $$
begin
  if not prospection.est_membre() then raise exception 'acces_refuse'; end if;
  update prospection.interaction set traitee_le = now()
    where id = p_interaction_id and sens = 'entrant' and traitee_le is null;
  if not found then raise exception 'interaction_introuvable'; end if;
end $$;

-- ----------------------------------------------------------------------------
-- Import multi-listes : aperçu chiffré (p_ecrire = false) puis écriture
-- ----------------------------------------------------------------------------
-- p_lignes : [{ compte: {nom, type, linkedin_url, site_web, region, secteur,
--                        effectif_min, effectif_max, cercle},
--               contact: {prenom, nom, fonction, niveau, linkedin_url, email,
--                         anciennete_poste_mois, score} }]
-- Dédoublonnage : linkedin_url d'abord, puis (prénom, nom, compte).
-- Un doublon complète les champs vides, n'écrase rien, ne régresse aucun statut.
-- Les lignes en exclusion sont ignorées et comptées.

create or replace function prospection.importer_compte(p jsonb, p_import_id uuid)
returns uuid language plpgsql security definer set search_path = prospection, public as $$
declare
  v_nom text := nullif(btrim(coalesce(p ->> 'nom', '')), '');
  v_li text := prospection.normaliser_linkedin(p ->> 'linkedin_url');
  v_id uuid;
  v_type prospection.type_compte;
begin
  if v_nom is null and v_li is null then return null; end if;
  begin
    v_type := coalesce(p ->> 'type', 'entreprise')::prospection.type_compte;
  exception when invalid_text_representation then
    v_type := 'entreprise';
  end;
  select id into v_id from prospection.compte
    where (v_li is not null and linkedin_url = v_li)
       or (v_nom is not null and lower(nom) = lower(v_nom))
    limit 1;
  if v_id is not null then
    update prospection.compte set
      linkedin_url  = coalesce(linkedin_url, v_li),
      site_web      = coalesce(site_web, nullif(p ->> 'site_web', '')),
      region        = coalesce(region, nullif(p ->> 'region', '')),
      secteur       = coalesce(secteur, nullif(p ->> 'secteur', '')),
      effectif_min  = coalesce(effectif_min, (nullif(p ->> 'effectif_min', ''))::integer),
      effectif_max  = coalesce(effectif_max, (nullif(p ->> 'effectif_max', ''))::integer),
      cercle        = coalesce(cercle, (nullif(p ->> 'cercle', ''))::smallint)
    where id = v_id;
    return v_id;
  end if;
  insert into prospection.compte
    (nom, type, linkedin_url, site_web, region, secteur, effectif_min, effectif_max, cercle, expose, import_id)
  values
    (coalesce(v_nom, v_li), v_type, v_li,
     nullif(p ->> 'site_web', ''), nullif(p ->> 'region', ''), nullif(p ->> 'secteur', ''),
     (nullif(p ->> 'effectif_min', ''))::integer, (nullif(p ->> 'effectif_max', ''))::integer,
     (nullif(p ->> 'cercle', ''))::smallint,
     coalesce((p ->> 'expose')::boolean, false), p_import_id)
  returning id into v_id;
  return v_id;
end $$;

create or replace function prospection.importer(
  p_libelle text, p_fichier text, p_lignes jsonb, p_ecrire boolean default false)
returns jsonb
language plpgsql security definer set search_path = prospection, public as $$
declare
  l jsonb; c jsonb; k jsonb;
  v_import_id uuid;
  v_lues integer := 0; v_creees integer := 0; v_maj integer := 0;
  v_excl integer := 0; v_inval integer := 0;
  v_li text; v_em text; v_nom text; v_prenom text; v_cnom text;
  v_contact_id uuid; v_compte_id uuid;
  v_niveau prospection.niveau_contact;
  v_vus text[] := '{}';
  v_cle text;
begin
  if not prospection.est_membre() then raise exception 'acces_refuse'; end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' then
    raise exception 'lignes_invalides' using detail = 'Un tableau de lignes est attendu.';
  end if;
  if p_ecrire then
    insert into prospection.import (libelle_liste, fichier_nom, lignes_lues)
      values (p_libelle, coalesce(p_fichier, ''), jsonb_array_length(p_lignes))
      returning id into v_import_id;
  end if;

  for l in select * from jsonb_array_elements(p_lignes) loop
    v_lues := v_lues + 1;
    c := coalesce(l -> 'contact', '{}'::jsonb);
    k := coalesce(l -> 'compte', '{}'::jsonb);
    v_li := prospection.normaliser_linkedin(c ->> 'linkedin_url');
    v_em := prospection.normaliser_email(c ->> 'email');
    v_prenom := nullif(btrim(coalesce(c ->> 'prenom', '')), '');
    v_nom := nullif(btrim(coalesce(c ->> 'nom', '')), '');
    v_cnom := nullif(btrim(coalesce(k ->> 'nom', '')), '');

    -- Ligne inexploitable : ni URL LinkedIn, ni couple (nom, compte).
    if v_nom is null or (v_li is null and v_cnom is null) then
      v_inval := v_inval + 1; continue;
    end if;

    -- Exclusion : bloquante, comptée.
    if exists (
      select 1 from prospection.exclusion e
      where (v_li is not null and e.linkedin_url = v_li)
         or (v_em is not null and e.email = v_em)) then
      v_excl := v_excl + 1; continue;
    end if;

    begin
      v_niveau := nullif(c ->> 'niveau', '')::prospection.niveau_contact;
    exception when invalid_text_representation then
      v_niveau := null;
    end;

    v_cle := coalesce(v_li, lower(coalesce(v_prenom, '') || '|' || v_nom || '|' || coalesce(v_cnom, '')));

    select ct.id into v_contact_id from prospection.contact ct
      where (v_li is not null and ct.linkedin_url = v_li)
         or (v_em is not null and ct.email = v_em)
         or (v_li is null and lower(ct.nom) = lower(v_nom)
             and lower(ct.prenom) = lower(coalesce(v_prenom, ''))
             and v_cnom is not null
             and exists (select 1 from prospection.compte co
                         where co.id = ct.compte_id and lower(co.nom) = lower(v_cnom)))
      limit 1;

    if v_contact_id is not null or v_cle = any (v_vus) then
      v_maj := v_maj + 1;
      if p_ecrire and v_contact_id is not null then
        v_compte_id := prospection.importer_compte(k, v_import_id);
        update prospection.contact set
          prenom                = case when prenom = '' then coalesce(v_prenom, '') else prenom end,
          fonction              = coalesce(fonction, nullif(c ->> 'fonction', '')),
          niveau                = coalesce(niveau, v_niveau),
          linkedin_url          = coalesce(linkedin_url, v_li),
          email                 = coalesce(email, v_em),
          anciennete_poste_mois = coalesce(anciennete_poste_mois, (nullif(c ->> 'anciennete_poste_mois', ''))::integer),
          compte_id             = coalesce(compte_id, v_compte_id)
        where id = v_contact_id;
      end if;
    else
      v_creees := v_creees + 1;
      v_vus := v_vus || v_cle;
      if p_ecrire then
        v_compte_id := prospection.importer_compte(k, v_import_id);
        insert into prospection.contact
          (compte_id, prenom, nom, fonction, niveau, linkedin_url, email,
           anciennete_poste_mois, score, import_id)
        values
          (v_compte_id, coalesce(v_prenom, ''), v_nom, nullif(c ->> 'fonction', ''), v_niveau,
           v_li, v_em, (nullif(c ->> 'anciennete_poste_mois', ''))::integer,
           coalesce((nullif(c ->> 'score', ''))::integer, 0), v_import_id);
      end if;
    end if;
  end loop;

  if p_ecrire then
    update prospection.import set
      lignes_creees = v_creees, lignes_maj = v_maj, lignes_ignorees = v_excl + v_inval,
      detail_ignorees = jsonb_build_object('exclusion', v_excl, 'invalide', v_inval)
    where id = v_import_id;
    insert into prospection.journal (evenement, detail)
      values ('import', jsonb_build_object('import_id', v_import_id, 'lues', v_lues,
              'creees', v_creees, 'mises_a_jour', v_maj, 'exclusion', v_excl, 'invalide', v_inval));
  end if;

  return jsonb_build_object(
    'import_id', v_import_id, 'ecrit', p_ecrire,
    'lues', v_lues, 'creees', v_creees, 'mises_a_jour', v_maj,
    'ignorees', jsonb_build_object('exclusion', v_excl, 'invalide', v_inval));
end $$;

-- ----------------------------------------------------------------------------
-- Droit d'opposition (lien dans chaque email) — appelé par la fonction serveur
-- publique prospection-opposition avec la clé service, jamais par le front.
-- ----------------------------------------------------------------------------
create or replace function prospection.opposition(p_jeton uuid)
returns boolean
language plpgsql security definer set search_path = prospection, public as $$
declare v_contact prospection.contact%rowtype;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'acces_refuse';
  end if;
  select * into v_contact from prospection.contact where jeton_opposition = p_jeton for update;
  if not found then return false; end if;
  if v_contact.linkedin_url is not null or v_contact.email is not null then
    insert into prospection.exclusion (linkedin_url, email, motif)
      values (v_contact.linkedin_url, v_contact.email, 'opposition')
      on conflict do nothing;
  end if;
  update prospection.relance set etat = 'annule'
    where contact_id = v_contact.id and etat = 'en_attente';
  -- Fin de tout traitement : la fiche est supprimée, l'exclusion la remplace.
  delete from prospection.contact where id = v_contact.id;
  insert into prospection.journal (evenement, detail, acteur)
    values ('opposition', jsonb_build_object('contact_id', v_contact.id), 'personne_concernee');
  return true;
end $$;

-- ----------------------------------------------------------------------------
-- Purge : trois ans sans interaction, automatique et journalisée
-- ----------------------------------------------------------------------------
create or replace function prospection.purger_inactifs()
returns integer
language plpgsql security definer set search_path = prospection, public as $$
declare v_ids uuid[]; v_comptes integer;
begin
  if not prospection.est_membre_ou_service()
     and coalesce(auth.jwt() ->> 'role', current_user) <> 'postgres' then
    raise exception 'acces_refuse';
  end if;
  with derniers as (
    select ct.id,
           greatest(ct.maj_le, coalesce(max(i.survenu_le), ct.cree_le)) as dernier
    from prospection.contact ct
    left join prospection.interaction i on i.contact_id = ct.id
    group by ct.id, ct.maj_le, ct.cree_le
  ), supprimes as (
    delete from prospection.contact
    where id in (select id from derniers where dernier < now() - interval '3 years')
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_ids from supprimes;

  delete from prospection.compte co
    where co.maj_le < now() - interval '3 years'
      and not exists (select 1 from prospection.contact ct where ct.compte_id = co.id);
  get diagnostics v_comptes = row_count;

  insert into prospection.journal (evenement, detail, acteur)
    values ('purge', jsonb_build_object('contacts', coalesce(array_length(v_ids, 1), 0),
            'contact_ids', to_jsonb(v_ids), 'comptes', v_comptes),
            case when prospection.acteur() = '' then 'planificateur' else prospection.acteur() end);
  return coalesce(array_length(v_ids, 1), 0);
end $$;

-- ----------------------------------------------------------------------------
-- Synthèse hebdomadaire (lundi matin) et vue par cercle
-- ----------------------------------------------------------------------------
create or replace function prospection.generer_synthese_hebdo(p_lundi date default null)
returns prospection.synthese_hebdo
language plpgsql security definer set search_path = prospection, public as $$
declare
  v_lundi date := coalesce(p_lundi, (date_trunc('week', (now() at time zone 'Europe/Paris')::date - 7))::date);
  v_fin date := v_lundi + 7;
  v_row prospection.synthese_hebdo%rowtype;
  v_inv integer; v_acc integer; v_conv integer; v_part integer; v_oubli integer;
  v_cercles jsonb;
begin
  if not prospection.est_membre_ou_service()
     and coalesce(auth.jwt() ->> 'role', current_user) <> 'postgres' then
    raise exception 'acces_refuse';
  end if;
  select count(*) into v_inv from prospection.interaction
    where type = 'invitation' and sens = 'sortant'
      and survenu_le >= v_lundi and survenu_le < v_fin;
  select count(*) into v_acc from prospection.journal
    where evenement = 'transition' and detail ->> 'vers' = 'accepte'
      and survenu_le >= v_lundi and survenu_le < v_fin;
  select count(*) into v_conv from prospection.journal
    where evenement = 'transition' and detail ->> 'vers' = 'en_conversation'
      and survenu_le >= v_lundi and survenu_le < v_fin;
  select count(*) into v_part from prospection.journal
    where evenement = 'transition' and detail ->> 'vers' = 'partenaire'
      and survenu_le >= v_lundi and survenu_le < v_fin;
  select count(*) into v_oubli from prospection.relance
    where etat = 'en_attente' and du_le >= v_lundi and du_le < v_fin;
  select coalesce(jsonb_agg(jsonb_build_object('cercle', cercle, 'statut', statut, 'nombre', nombre)
                            order by cercle, statut), '[]'::jsonb)
    into v_cercles
    from (select coalesce(co.cercle, 0) as cercle, ct.statut, count(*) as nombre
          from prospection.contact ct left join prospection.compte co on co.id = ct.compte_id
          group by coalesce(co.cercle, 0), ct.statut) s;

  insert into prospection.synthese_hebdo
    (semaine, invitations, acceptations, taux_acceptation, conversations_ouvertes,
     partenariats, relances_oubliees, par_cercle, genere_le)
  values
    (v_lundi, v_inv, v_acc,
     case when v_inv > 0 then round(100.0 * v_acc / v_inv, 2) else null end,
     v_conv, v_part, v_oubli, v_cercles, now())
  on conflict (semaine) do update set
    invitations = excluded.invitations, acceptations = excluded.acceptations,
    taux_acceptation = excluded.taux_acceptation,
    conversations_ouvertes = excluded.conversations_ouvertes,
    partenariats = excluded.partenariats, relances_oubliees = excluded.relances_oubliees,
    par_cercle = excluded.par_cercle, genere_le = now()
  returning * into v_row;
  return v_row;
end $$;

-- ----------------------------------------------------------------------------
-- Vues de travail (security_invoker : la RLS des tables s'applique)
-- ----------------------------------------------------------------------------

-- « Qui relancer aujourd'hui » : une relance échue non faite reste visible et vieillit.
create or replace view prospection.v_relances_a_faire
with (security_invoker = true) as
  select r.id, r.contact_id, r.echeance, r.du_le, r.etat,
         (current_date - r.du_le) as retard_jours,
         c.prenom, c.nom, c.fonction, c.statut, c.linkedin_url, c.score,
         co.nom as compte_nom, co.cercle
  from prospection.relance r
  join prospection.contact c on c.id = r.contact_id
  left join prospection.compte co on co.id = c.compte_id
  where r.etat = 'en_attente' and r.du_le <= current_date;

-- Réponses entrantes non traitées.
create or replace view prospection.v_reponses_non_traitees
with (security_invoker = true) as
  select i.id, i.contact_id, i.canal, i.type, i.objet, i.contenu, i.survenu_le,
         c.prenom, c.nom, c.fonction, c.statut, co.nom as compte_nom, co.cercle
  from prospection.interaction i
  join prospection.contact c on c.id = i.contact_id
  left join prospection.compte co on co.id = c.compte_id
  where i.sens = 'entrant' and i.traitee_le is null;

-- Où en est chacun des trois cercles.
create or replace view prospection.v_par_cercle
with (security_invoker = true) as
  select coalesce(co.cercle, 0)::integer as cercle, ct.statut, count(*)::integer as nombre
  from prospection.contact ct
  left join prospection.compte co on co.id = ct.compte_id
  group by coalesce(co.cercle, 0), ct.statut;

-- ----------------------------------------------------------------------------
-- RLS et privilèges
-- ----------------------------------------------------------------------------
alter table prospection.import         enable row level security;
alter table prospection.compte         enable row level security;
alter table prospection.contact        enable row level security;
alter table prospection.interaction    enable row level security;
alter table prospection.relance        enable row level security;
alter table prospection.exclusion      enable row level security;
alter table prospection.journal        enable row level security;
alter table prospection.synthese_hebdo enable row level security;

do $$
declare t text;
begin
  foreach t in array array['import', 'compte', 'contact', 'interaction', 'relance',
                           'exclusion', 'journal', 'synthese_hebdo'] loop
    execute format('drop policy if exists membres_lecture on prospection.%I', t);
    execute format(
      'create policy membres_lecture on prospection.%I for select to authenticated using (prospection.est_membre())', t);
  end loop;
  -- Écriture directe : uniquement les fiches (compte, contact) et les exclusions
  -- manuelles. Tout le reste passe par fonction serveur.
  foreach t in array array['compte', 'contact'] loop
    execute format('drop policy if exists membres_insertion on prospection.%I', t);
    execute format(
      'create policy membres_insertion on prospection.%I for insert to authenticated with check (prospection.est_membre())', t);
    execute format('drop policy if exists membres_modification on prospection.%I', t);
    execute format(
      'create policy membres_modification on prospection.%I for update to authenticated using (prospection.est_membre()) with check (prospection.est_membre())', t);
  end loop;
  drop policy if exists membres_insertion on prospection.exclusion;
  create policy membres_insertion on prospection.exclusion
    for insert to authenticated with check (prospection.est_membre());
end $$;

grant usage on schema prospection to authenticated, service_role;
grant select on all tables in schema prospection to authenticated;
grant insert, update on prospection.compte, prospection.contact to authenticated;
grant insert on prospection.exclusion to authenticated;
grant all on all tables in schema prospection to service_role;

revoke all on all functions in schema prospection from public;
grant execute on all functions in schema prospection to service_role;
grant execute on function
  prospection.acteur(), prospection.est_membre(), prospection.est_membre_ou_service(),
  prospection.normaliser_linkedin(text), prospection.normaliser_email(text),
  prospection.transition_autorisee(prospection.statut_contact, prospection.statut_contact),
  prospection.transition_contact(uuid, prospection.statut_contact),
  prospection.plafond_invitations(), prospection.invitations_du_jour(),
  prospection.marquer_envoye(uuid, prospection.type_interaction, text, timestamptz),
  prospection.ajouter_note(uuid, prospection.canal, text),
  prospection.enregistrer_reponse(uuid, prospection.canal, text, timestamptz, text, text, text),
  prospection.marquer_traitee(uuid),
  prospection.importer(text, text, jsonb, boolean),
  prospection.generer_synthese_hebdo(date)
  to authenticated;
-- opposition() et purger_inactifs() : service et planificateur uniquement.

-- Exposition du schéma à l'API PostgREST. Supabase écrit ce même paramètre
-- depuis Dashboard → Settings → API → « Exposed schemas » : vérifier qu'il
-- contient bien « prospection » après application.
do $$ begin
  execute format('alter role authenticator set pgrst.db_schemas = %L', 'public, graphql_public, prospection');
  notify pgrst, 'reload config';
exception when others then
  raise notice 'pgrst.db_schemas non modifié ici (%) : à régler dans le Dashboard.', sqlerrm;
end $$;

-- ----------------------------------------------------------------------------
-- Planification (pg_cron) : purge quotidienne, synthèse le lundi 06:00 (Paris)
-- ----------------------------------------------------------------------------
do $$ begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname in ('prospection_purge', 'prospection_synthese_hebdo');
  perform cron.schedule('prospection_purge', '0 3 * * *', $c$ select prospection.purger_inactifs() $c$);
  perform cron.schedule('prospection_synthese_hebdo', '0 4 * * 1', $c$ select prospection.generer_synthese_hebdo() $c$);
exception when others then
  raise notice 'pg_cron indisponible ici (%) : planifier purger_inactifs() et generer_synthese_hebdo() dans le Dashboard.', sqlerrm;
end $$;
