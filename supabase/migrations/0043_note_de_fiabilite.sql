-- ============================================================================
-- 0043 — Deux notes : le potentiel, et la confiance
-- ----------------------------------------------------------------------------
-- « On met une note sur le prospect pour savoir si ça peut être un très bon
--   client. Et on rajoute une note de fiabilité sur les informations données.
--   On ne donne pas de fausses informations, ça c'est primordial. »
--
-- La note sur cent dit si l'entreprise vaut le déplacement. Elle ne dit rien de
-- la solidité de ce qu'on affiche — et c'est justement ce qui a manqué : BB GR
-- sortait avec une note de cinquante sur une adresse strasbourgeoise fermée
-- depuis octobre 2000. Excellente note, information fausse.
--
-- La seconde note, sur dix, ne juge que les sources. Le registre de l'État et le
-- site de l'entreprise engagent : deux points. Une page web réellement consultée
-- est un indice : un point. Une affirmation sans source ne vaut rien : zéro. La
-- note est la moyenne des informations PRÉSENTES — une fiche courte tenue par le
-- registre vaut dix sur dix ; qu'elle dise peu se lit dans « Approfondie ».
--
-- Le détail est conservé ligne par ligne : le commercial doit pouvoir savoir
-- laquelle de ses informations est sûre avant de décrocher son téléphone.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

alter table public.admin_prospects
  add column if not exists reliability smallint
    check (reliability is null or (reliability between 0 and 10)),
  add column if not exists reliability_detail jsonb;

comment on column public.admin_prospects.reliability is
  'Fiabilité des informations affichées, sur 10 : moyenne des sources des renseignements présents. Ne mesure pas la complétude.';
comment on column public.admin_prospects.reliability_detail is
  'Le détail par information : [{quoi, dit, sur}] — « Téléphone », « fiche d''établissement Google », 2.';

-- Les fiches déjà créées : tout ce qu'elles avancent vient du registre officiel
-- (identité, implantation, activité, effectif) ou de l'approfondissement, qui ne
-- retient qu'une source vérifiée. Celles qui portent un interlocuteur ou un
-- contact sans qu'on sache d'où il vient restent sans note plutôt que d'en
-- recevoir une inventée : on ne note pas ce qu'on n'a pas mesuré.
update public.admin_prospects
set reliability = 10,
    reliability_detail = jsonb_build_array(
      jsonb_build_object('quoi', 'Identité',     'dit', 'annuaire officiel de l’État', 'sur', 2),
      jsonb_build_object('quoi', 'Implantation', 'dit', 'annuaire officiel de l’État', 'sur', 2),
      jsonb_build_object('quoi', 'Activité',     'dit', 'annuaire officiel de l’État', 'sur', 2)
    )
where reliability is null
  and enriched_at is null
  and contact_name is null
  and contact_email is null
  and city is not null
  and activity is not null;
