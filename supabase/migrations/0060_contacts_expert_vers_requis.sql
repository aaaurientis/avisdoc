-- Lot 7 — « Expert » devient « Requis » dans l'annuaire des contacts médicaux.
-- Renommage de la valeur stockée (type + rôles multiples), avec mise à jour de
-- la contrainte. Non destructif : les contacts « Requérant » restent intacts
-- (le menu Requérants provient désormais du parcours infirmières).
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).

-- La contrainte interdit encore « Requis » : on la retire le temps de migrer.
alter table public.admin_network_contacts
  drop constraint if exists admin_network_contacts_type_check;

-- Rôle principal.
update public.admin_network_contacts set type = 'Requis' where type = 'Expert';

-- Rôles multiples (tableau).
update public.admin_network_contacts
   set types = array_replace(types, 'Expert', 'Requis')
 where types is not null and 'Expert' = any(types);

-- Nouvelle liste de valeurs autorisées.
alter table public.admin_network_contacts
  add constraint admin_network_contacts_type_check
  check (type in ('Requérant', 'Requis', 'Réseau d''Aval'));
