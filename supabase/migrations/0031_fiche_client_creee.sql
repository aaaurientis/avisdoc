-- ============================================================================
-- 0031 — Une fiche client n'est créée qu'une fois
-- ----------------------------------------------------------------------------
-- Signer fait entrer l'affaire au fichier client. Jusqu'ici, le Hub vérifiait à
-- chaque chargement qu'une affaire signée avait bien sa fiche, et la créait si
-- elle manquait. Deux conséquences fâcheuses :
--
--   • supprimer une fiche ne servait à rien : elle revenait au chargement suivant ;
--   • plusieurs affaires homonymes en créaient une chacune d'un seul coup.
--
-- On enregistre donc que la fiche A ÉTÉ créée, une bonne fois. Si quelqu'un la
-- supprime ensuite, c'est qu'il l'a voulu : on ne la lui rend pas de force.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

alter table public.admin_clients
  add column if not exists fiche_client_creee boolean not null default false;

comment on column public.admin_clients.fiche_client_creee is
  'La fiche du fichier client a déjà été créée pour cette affaire ; ne pas la recréer.';

-- Les affaires qui ont déjà leur fiche, et celles dont une fiche porte le même nom :
-- elles sont en règle, on ne veut pas qu'un rattrapage les double.
update public.admin_clients c
   set fiche_client_creee = true
 where c.fiche_client_creee = false
   and exists (
     select 1
       from public.admin_accounts a
      where a.client_id = c.id
         or lower(trim(a.name)) = lower(trim(c.company))
   );
