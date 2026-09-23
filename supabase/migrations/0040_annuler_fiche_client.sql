-- ============================================================================
-- 0040 — Annuler une fiche client créée par erreur
-- ----------------------------------------------------------------------------
-- Une affaire passée en « Signé » crée sa fiche client toute seule. Si c'était
-- une erreur, la fiche ne doit pas partir à la corbeille : elle n'aurait jamais
-- dû exister. On l'annule, ce qui n'est pas la même chose que la supprimer.
--
-- Deux raisons de passer par une fonction plutôt que par un simple DELETE :
--
--   1. La destruction de `admin_accounts` est réservée au super-admin depuis la
--      migration 0036. Un commercial ne peut donc pas défaire sa propre erreur.
--      Cette fonction lui donne ce droit-là, et rien d'autre : elle ne détruit
--      qu'une fiche issue d'une affaire, jamais une fiche saisie à la main.
--
--   2. `admin_echanges.account_id` est en ON DELETE CASCADE. Détruire la fiche
--      emporterait les appels, rendez-vous et notes qu'on y aurait posés. Ils
--      sont donc rendus à l'affaire AVANT la destruction : rien ne se perd, tout
--      retourne là où le travail continue.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

create or replace function public.annuler_fiche_client(fiche uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affaire uuid;
  rendus integer := 0;
begin
  if not public.is_avisdoc_user() then
    raise exception 'Réservé aux comptes AvisDoc.';
  end if;

  select client_id into affaire from public.admin_accounts where id = fiche;

  if affaire is null then
    raise exception 'Cette fiche ne vient pas d''une affaire du Pipeline : elle ne peut pas être annulée. Supprimez-la si vous voulez vous en séparer, elle passera par la corbeille.';
  end if;

  -- Ce qui a été noté sur la fiche client retourne à l'affaire.
  update public.admin_echanges
     set account_id = null, client_id = affaire
   where account_id = fiche;
  get diagnostics rendus = row_count;

  delete from public.admin_accounts where id = fiche;

  -- Sans cette remise à zéro, une nouvelle signature ne recréerait jamais la fiche.
  update public.admin_clients set fiche_client_creee = false where id = affaire;

  return rendus;
end;
$$;

revoke all on function public.annuler_fiche_client(uuid) from public, anon;
grant execute on function public.annuler_fiche_client(uuid) to authenticated;
