-- Informations personnelles reprises de l'Annuaire Santé puis complétées/corrigées
-- par l'infirmière à l'étape 1, servant à préremplir le contrat (template Yousign :
-- civilite, name, surname, profession, address, RPPS, birth_date, birth_place).
-- adresse / code_postal / ville existent déjà (0062).
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).

alter table public.req_inscriptions
  add column if not exists civilite       text,  -- « Madame » / « Monsieur »
  add column if not exists profession     text,
  add column if not exists date_naissance date,
  add column if not exists lieu_naissance text,
  add column if not exists infos_completes boolean not null default false;
