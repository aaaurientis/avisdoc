-- Réseau d'aval : précision du géocodage des lieux RPPS (décision du 16/11).
-- Une fiche Google au nom du praticien, à moins de 50 m d'un lieu RPPS géocodé AU NUMÉRO
-- (type « housenumber » de l'API Adresse), est validée d'office. Un point placé au centre
-- d'une rue ou d'une commune ne sert jamais à valider.

alter table public.admin_reseau_lieux
  add column if not exists geo_type  text,
  add column if not exists geo_score double precision;

comment on column public.admin_reseau_lieux.geo_type is
  'Précision du géocodage (API Adresse) : housenumber, street, locality, municipality. Seul « housenumber » sert à valider une fiche Google.';
