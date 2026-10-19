-- ============================================================================
-- 0071 — Le récap du soir : un mail à 19 h (heure de Paris), tous les jours
-- ----------------------------------------------------------------------------
-- Olivier, 19/10 : « tous les soirs à 19 h, un récap de tout ce qui s'est passé
-- sur AvisDoc Admin » — pour l'instant à Arthur seul (destinataires dans la
-- fonction recap-du-soir).
--
-- Comme les rappels (0069) : un secret tiré au hasard, qui ne quitte jamais la base.
-- La tâche passe à 17 h et à 18 h UTC ; la fonction n'envoie que si c'est 19 h à
-- Paris (été comme hiver), et une seule fois par jour.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

insert into public.admin_secrets_internes (cle, valeur)
values ('recap_du_soir', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (cle) do nothing;

-- Le dernier récap envoyé (« jour|instant ») : la fonction s'en sert pour ne jamais
-- envoyer deux fois le même jour, et pour reprendre là où le précédent s'était arrêté.
insert into public.admin_secrets_internes (cle, valeur)
values ('recap_du_soir_dernier', '')
on conflict (cle) do nothing;

select cron.unschedule('recap-du-soir')
 where exists (select 1 from cron.job where jobname = 'recap-du-soir');

select cron.schedule('recap-du-soir', '0 17,18 * * *', $$
  select net.http_post(
    url := 'https://wtovhzxymlqnfxyjxrdq.supabase.co/functions/v1/recap-du-soir',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-secret', (select valeur from public.admin_secrets_internes where cle = 'recap_du_soir')
    ),
    body := '{}'::jsonb
  );
$$);
