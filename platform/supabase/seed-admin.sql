-- Déclarer un administrateur.
--
-- Prérequis : la personne s'est déjà connectée UNE fois à admin.avisdoc.fr
-- (lien magique) pour créer sa ligne dans auth.users. Elle verra « Accès
-- réservé » tant qu'elle n'est pas dans admins ; c'est normal.
--
-- Remplacer l'adresse ci-dessous, puis exécuter dans le SQL Editor Supabase.

insert into admins (auth_user_id, email)
select id, email
from auth.users
where email = 'prenom@avisdoc.fr'
on conflict (auth_user_id) do nothing;

-- Vérification :
-- select * from admins;
