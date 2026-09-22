-- ============================================================================
-- 0026 — Du prospect à l'affaire, de l'affaire au client
-- ----------------------------------------------------------------------------
-- Les trois écrans du commercial se suivent : Merx trouve un prospect, un humain
-- décide d'en faire une affaire (Pipeline), et l'affaire gagnée devient un
-- client (fichier client).
--
-- Rien n'est automatique et rien ne se perd : le prospect garde le lien vers son
-- affaire (`converted_client_id`), l'affaire garde le lien vers sa fiche client
-- (`admin_accounts.client_id`, migration 0024). Sortir une affaire de l'étape
-- « gagnée » ne supprime pas le client ; écarter un prospect ne supprime pas
-- l'affaire.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

alter table public.admin_prospects
  add column if not exists converted_client_id uuid references public.admin_clients (id) on delete set null;

-- Une affaire ne naît qu'une fois du même prospect.
create unique index if not exists idx_prospects_converti
  on public.admin_prospects (converted_client_id)
  where converted_client_id is not null;
