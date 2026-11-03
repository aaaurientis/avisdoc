-- ============================================================================
-- 0079 — Droits à 8 blocs : renommage des modules dans admin_droits
-- ----------------------------------------------------------------------------
-- Le menu passe à 8 blocs, 1 droit par bloc. Les anciens modules sont remappés
-- sans perte d'accès :
--   crm, merx        → commercial   (+ on ajoute « demarche », le démarchage
--                                      étant une activité commerciale)
--   contacts         → sante
--   veille           → veille        (inchangé — devient « Veille Marché »)
--   finance, documents, admin        → inchangés
--   marketing        → retiré        (le bloc Marketing disparaît)
--
-- Idempotent : rejouable sans effet (les modules déjà au nouveau nom restent).
-- Les super-admins (admin_superadmins) ont tous les modules quoi qu'il arrive.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

update public.admin_droits d
set modules = coalesce(sub.new_modules, array[]::text[]),
    updated_at = now()
from (
  select
    email,
    (
      select array_agg(distinct x order by x)
      from unnest(
        -- 1. remappe chaque module existant (marketing → NULL, ignoré ensuite)
        array(
          select case m
            when 'crm'         then 'commercial'
            when 'merx'        then 'commercial'
            when 'contacts'    then 'sante'
            when 'infirmieres' then 'sante'  -- au cas où 0078 n'a pas encore été jouée
            when 'marketing'   then null
            else m
          end
          from unnest(modules) m
        )
        -- 2. ajoute « demarche » si l'utilisateur avait un accès commercial
        || case
             when 'crm' = any(modules) or 'merx' = any(modules)
               then array['demarche']
             else array[]::text[]
           end
      ) x
      where x is not null
    ) as new_modules
  from public.admin_droits
) sub
where d.email = sub.email;
