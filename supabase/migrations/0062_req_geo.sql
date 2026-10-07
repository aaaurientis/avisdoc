-- Lot 7b — localisation des requérants sur la carte « Contacts médicaux ».
-- Adresse d'exercice (résolue depuis le RPPS via l'Annuaire Santé) + coordonnées
-- géocodées, mises en cache sur l'inscription.
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).

alter table public.req_inscriptions
  add column if not exists adresse     text,
  add column if not exists code_postal text,
  add column if not exists ville       text,
  add column if not exists lat         double precision,
  add column if not exists lng         double precision,
  add column if not exists geocode_le  timestamptz;
