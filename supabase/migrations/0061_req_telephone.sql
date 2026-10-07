-- Lot — invitation infirmière via l'Annuaire Santé : on connaît le RPPS dès
-- l'invitation (recherche RPPS) et on capture le téléphone.
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).

alter table public.req_inscriptions
  add column if not exists telephone text;
