-- ============================================================================
-- 0044 — Une note de fiabilité qui distingue enfin les fiches
-- ----------------------------------------------------------------------------
-- « Elles sont toutes à 10/10, ce qui est ridicule, ça ne sert à rien. »
--
-- Il a raison. La première version notait l'ORIGINE des informations : registre
-- officiel, site de l'entreprise, page consultée. Or toutes les fiches du
-- registre ont la même origine — toutes sortaient à dix. Une note que chacun
-- obtient ne dit rien à personne.
--
-- Ce qui distingue vraiment deux fiches, c'est le degré de VÉRIFICATION :
--
--   2 — confirmé POUR CE SITE : établissement ouvert vérifié, effectif de ce
--       site, interlocuteur nommé sur le site de l'entreprise ;
--   1 — officiel mais extrapolé : effectif du groupe appliqué à une agence,
--       dirigeant du siège donné comme interlocuteur, adresse non revérifiée ;
--   0 — rien ne l'appuie, ou rien n'a été cherché.
--
-- La note est la moyenne des informations attendues, sur dix. L'échelle va de
-- cinq (fiche brute du registre, adresse non revérifiée) à neuf ou dix (fiche
-- approfondie dont chaque ligne est tenue par une source nommée).
--
-- Les fiches d'aujourd'hui reçoivent ce calcul, appliqué à ce qu'elles portent.
-- Leur implantation compte pour « extrapolé » et non « confirmé » : elles ont
-- été créées AVANT que l'on écarte les établissements fermés, donc personne n'a
-- vérifié que leur adresse est encore ouverte. Prétendre le contraire serait
-- exactement l'erreur qu'on répare.
--
-- À exécuter dans le SQL Editor du projet admin (wtovhzxymlqnfxyjxrdq).
-- ============================================================================

with note as (
  select
    id,
    -- Identité : le registre l'atteste dès qu'on a le SIREN ou sa fiche publique.
    (case when siren is not null or sources::text like '%annuaire-entreprises%' then 2 else 0 end) as n_identite,
    -- Implantation : jamais revérifiée sur ces fiches. On ne confirme pas ce qu'on n'a pas regardé.
    (case when city is not null then 1 else 0 end) as n_lieu,
    (case when city is not null then 1 else 0 end) as p_lieu,
    (case when activity is not null then 2 else 0 end) as n_activite,
    (case when activity is not null then 1 else 0 end) as p_activite,
    -- Effectif : celui de l'entreprise, jamais celui du site — l'annuaire ne le publiait pas ici.
    (case when headcount_band is not null then 1 else 0 end) as n_effectif,
    (case when headcount_band is not null then 1 else 0 end) as p_effectif,
    (case when website is not null then 2 else 0 end) as n_site,
    (case when website is not null then 1 else 0 end) as p_site,
    -- Interlocuteur : nommé avec sa source, ou dirigeant du registre, ou rien.
    (case when contact_name is not null and contact_source is not null then 2
          when contact_name is not null then 1 else 0 end) as n_contact,
    -- Moyen de contact : e-mail ou téléphone, avec ou sans source.
    (case when (contact_email is not null or contact_phone is not null) and contact_source is not null then 2
          when contact_email is not null or contact_phone is not null then 1 else 0 end) as n_moyen,
    enriched_at
  from public.admin_prospects
)
update public.admin_prospects p
set reliability = round(
      10.0 * (n.n_identite + n.n_lieu + n.n_activite + n.n_effectif + n.n_site + n.n_contact + n.n_moyen)
      / (2.0 * (1 + n.p_lieu + n.p_activite + n.p_effectif + n.p_site + 1 + 1))
    ),
    reliability_detail = (
      select jsonb_agg(d) from (
        select jsonb_build_object('quoi', 'Identité', 'dit',
          case when n.n_identite = 2 then 'SIREN au registre officiel' else 'nom seul, sans identifiant légal' end,
          'sur', n.n_identite) as d
        union all
        select jsonb_build_object('quoi', 'Implantation', 'dit', 'adresse du registre, établissement non revérifié', 'sur', 1)
          where n.p_lieu = 1
        union all
        select jsonb_build_object('quoi', 'Activité', 'dit', 'code d''activité officiel', 'sur', 2)
          where n.p_activite = 1
        union all
        select jsonb_build_object('quoi', 'Effectif', 'dit', 'effectif de l''entreprise entière, site non publié', 'sur', 1)
          where n.p_effectif = 1
        union all
        select jsonb_build_object('quoi', 'Site web', 'dit', 'site officiel relevé', 'sur', 2)
          where n.p_site = 1
        union all
        select jsonb_build_object('quoi', 'Interlocuteur', 'dit',
          case n.n_contact when 2 then 'nommé, avec sa source'
                           when 1 then 'dirigeant au registre — fonction peut-être ancienne'
                           else case when n.enriched_at is null then 'non recherché — fiche non approfondie' else 'aucun interlocuteur trouvé' end end,
          'sur', n.n_contact)
        union all
        select jsonb_build_object('quoi', 'Moyen de contact', 'dit',
          case n.n_moyen when 2 then 'e-mail ou téléphone, avec sa source'
                         when 1 then 'e-mail ou téléphone, sans source nommée'
                         else case when n.enriched_at is null then 'non recherché — fiche non approfondie' else 'aucun moyen de contact trouvé' end end,
          'sur', n.n_moyen)
      ) lignes
    )
from note n
where n.id = p.id;
