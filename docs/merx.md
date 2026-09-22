# Merx — l'agent commercial de prospection

Module **`merx`** du Hub : un agent qui cherche sur le web des entreprises à démarcher pour les
campagnes de dépistage, les note sur 100, et les documente à la demande. Deux écrans, une Edge
Function, trois tables. Rien de commun avec le CRM existant, qu'il ne modifie pas.

## Écrans

| Route (hash) | Écran | Contenu |
|---|---|---|
| `#/merx` | Merx | Conversation. Le commercial dit qui il veut démarcher ; Merx lance la recherche et écrit son résultat dans le fil. |
| `#/prospects` | Prospects | Les fiches trouvées, en kanban par secteur. Fiche détaillée, « Approfondir », « Écarter ». |

Les deux pages sont sous le module de droits **`merx`**, qui **n'est pas attribué par défaut**
(`src/admin/lib/modules.ts`) : tant qu'il n'est pas ouvert sur un compte, ni l'entrée de menu ni
l'adresse ne donnent accès à quoi que ce soit. Un super-admin a tous les modules d'office.

Pour l'ouvrir à quelqu'un : Admin › Droits d'accès, ou en SQL —
`update public.admin_droits set modules = array_append(modules, 'merx') where lower(email) = '…';`

## Comment Merx travaille

**Chercher** (≈ 30 s, ≈ 0,05 $) : une requête au modèle, deux recherches web au plus, qui rend une
liste de fiches légères — nom, ville, activité, secteur, site officiel, pourquoi c'est une cible.
**Une entreprise qu'aucune page réellement consultée ne mentionne est écartée en code** : le modèle
ne peut pas inventer une société.

**Approfondir**, à la demande sur une fiche (≈ 30 s, ≈ 0,07 $) : d'abord les deux sources gratuites —
l'annuaire public des entreprises de l'État (identité, effectif, établissements, dirigeants) et les
liens `mailto:`/`tel:` du site officiel — puis le modèle pour ce qui manque (trois recherches web au
plus). Un contact nommé n'est gardé que s'il vient du site de l'entreprise elle-même. Un
approfondissement n'efface jamais une donnée déjà présente.

**Pappers n'est pas utilisé** : l'annuaire de l'État donne la même donnée légale sans coût à l'appel.
Il reste disponible en dernier recours si une fiche résiste.

## La note sur 100

| Catégorie | Critère | Points | Jugé par |
|---|---|---|---|
| Santé | Exposition au soleil | 35 | le modèle, avec justification et source |
| Santé | Sensibilité santé au travail | 10 | le modèle, avec justification et source |
| Commercial | Nombre de salariés | 20 | le code, d'après l'annuaire officiel |
| Commercial | Interlocuteur trouvé | 10 | le code |
| Commercial | Plusieurs sites | 10 | le code |
| Faisabilité | Zone géographique | 15 | le code (Gironde, Île-de-France, Occitanie, PACA) |

Un critère sans information vaut **0 point** et s'affiche « non évalué ». Rien n'est deviné.

## Technique

- **Edge Function `merx`** (`supabase/functions/merx/`) : réservée aux comptes `@avisdoc.fr` **et**
  au module `merx`. Trois actions : `chat`, `traiter`, `approfondir`.
- **Secret requis** : `ANTHROPIC_API_KEY`. Sans lui, la fonction répond « clé non configurée ».
  Modèle dans `MERX_MODEL` (par défaut `claude-haiku-4-5`) ; annuaire dans `ANNUAIRE_ENTREPRISES_URL`.
- **Migration `0022_merx.sql`** : `admin_merx_conversations` (privées à leur auteur),
  `admin_merx_demandes` (la file des travaux), `admin_prospects` (les fiches, partagées par l'équipe
  comme le fichier CRM). RLS `is_avisdoc_user()` sur les trois.
- Une recherche tient largement dans le budget d'une Edge Function (150 s en offre gratuite).

## Ce qui reste à faire

- L'e-mail de premier contact rédigé par Merx (brouillon modifiable, jamais envoyé sans relecture).
- L'Annuaire Santé branché comme outil de Merx (« que sais-tu sur ce dermatologue ? »).
- Le passage d'un prospect en client dans le CRM.
- Le pipeline commercial.
