-- Détails de l'assurance RCP saisis par le requérant (assureur, n° de police,
-- date de fin) — nécessaires pour pouvoir soumettre le dossier. Copiés sur la
-- pièce RCP à la soumission (date_fin sert aux échéances).
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).

alter table public.req_inscriptions
  add column if not exists rcp_assureur text,
  add column if not exists rcp_police   text,
  add column if not exists rcp_date_fin date;
