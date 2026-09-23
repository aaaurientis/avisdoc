# Merx et le bloc commercial

Module **`merx`** du Hub. Ce qui a commencé comme un agent de prospection couvre maintenant toute
la chaîne commerciale : trouver une entreprise, monter son dossier, la démarcher, noter ce qui
s'est dit, et retrouver ce qu'on a appris. Neuf écrans, une Edge Function, huit tables.

Le CRM existant (`admin_clients`) est repris et étendu, jamais contourné.

## Les écrans

| Route (hash) | Écran | À quoi il sert |
|---|---|---|
| `#/merx` | Merx | La conversation. Merx cherche, relit une fiche, cite ce que le terrain a appris, rédige. |
| `#/prospects` | Prospection | Les entreprises trouvées, en kanban par secteur. Fiche, dossier commercial, « Approfondir », « Écarter ». |
| `#/crm` | Pipeline | Les affaires en cours, colonnes libres, glisser-déposer. |
| `#/fichier-client` | Clients | Le fichier client de l'équipe, colonnes libres, import/export Excel. |
| `#/debrief` | Débrief | Ce que le commercial raconte en sortant d'un rendez-vous, à la voix ou au clavier. Merx range tout seul. |
| `#/dictee` | Dictée | L'enregistreur, pensé pour le téléphone. Dix minutes, hors réseau si besoin. |
| `#/planning` | Planning | La semaine : appels, rendez-vous, e-mails, à-faire. Avec ou sans entreprise. |
| `#/couts` | CAP | Le coût d'acquisition par prospect, demande par demande. |
| `#/corbeille` | Corbeille | Ce qui a été jeté, restaurable trente jours. |

Tous sont sous le module de droits **`merx`**, qui **n'est pas attribué par défaut**
(`src/admin/lib/modules.ts`) : tant qu'il n'est pas ouvert sur un compte, ni l'entrée de menu ni
l'adresse ne donnent accès à quoi que ce soit. Un super-admin a tous les modules d'office.

Pour l'ouvrir à quelqu'un : Admin › Droits d'accès, ou en SQL —
`update public.admin_droits set modules = array_append(modules, 'merx') where lower(email) = '…';`

## Ce que Merx sait faire

**Chercher** (43 s en moyenne, 0,09 $, Sonnet 5) : rend une liste de fiches légères — nom, ville, activité,
secteur, site officiel, pourquoi c'est une cible. **Une entreprise qu'aucune page réellement
consultée ne mentionne est écartée en code** : le modèle ne peut pas inventer une société.

**Approfondir** une fiche (76 s en moyenne, 0,38 $, Opus 5) : l'annuaire public des entreprises, Pappers,
et les liens `mailto:`/`tel:` du site officiel, puis le modèle pour ce qui manque. Produit aussi le
**dossier commercial** : accroche, qui aborder, faits vérifiés, arguments, objections probables,
offre, points à vérifier. Un approfondissement n'efface jamais une donnée déjà présente.

**Converser** (Opus 5) avec trois outils : `lancer_recherche`, `lire_fiche` — il relit la fiche
avant de conseiller sur une entreprise — et `chercher_dans_le_terrain`, qui puise dans les
objections déjà entendues et les arguments qui ont porté.

**Rédiger** un e-mail de premier contact (Sonnet 5), pour un prospect ou pour une fiche client.
Toujours un brouillon, jamais envoyé sans relecture.

**Ranger un débrief** : le commercial dicte ou écrit ce qui s'est passé ; Merx reconnaît
l'entreprise, crée la fiche si elle manque, pose les actions au planning, écrit le compte rendu
dans l'historique et verse les objections et les arguments dans la bibliothèque du terrain.
**Aucune validation à cocher** — c'est classé, et l'écran dit où.

### La règle qui ne bouge pas

Merx **raisonne** — un argument commercial déduit d'un fait vérifié est légitime. Il **n'invente
jamais** un chiffre, un tarif, un fait médical, un témoignage. S'il cite quelque chose, il en donne
le contenu et la source, sinon il n'en parle pas.

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

**Edge Function `merx`** (`supabase/functions/merx/`, ~2 300 lignes), réservée aux comptes
`@avisdoc.fr` **et** au module `merx`. Huit actions : `traiter`, `approfondir`, `email`,
`email_client`, `transcrire`, `transcrire_question`, `debrief`, `chat`.

**Secrets requis** :

| Secret | Sert à | Sans lui |
|---|---|---|
| `ANTHROPIC_API_KEY` | tout ce que fait Merx | « clé non configurée » |
| `OPENAI_API_KEY` | la transcription (`gpt-4o-transcribe`) | les notes dictées restent en attente |
| `PAPPERS_API_KEY` | la donnée légale à l'approfondissement | l'annuaire public prend le relais |

**Modèles** (`supabase/functions/merx/llm.ts`) : Sonnet 5 pour chercher et rédiger, Opus 5 pour
approfondir et converser. Chaque usage a sa variable (`MERX_MODEL_RECHERCHE`,
`MERX_MODEL_APPROFONDISSEMENT`, `MERX_MODEL_CHAT`, `MERX_MODEL_EMAIL`), `MERX_MODEL` règle tout d'un
coup. Aucune n'est posée aujourd'hui : ce sont les défauts du code qui s'appliquent.

Le modèle réellement appelé est **enregistré par demande** (`admin_merx_demandes.model`) : sans
cela, l'écran des coûts compterait tout au tarif du modèle d'origine. Les tarifs sont dans
`src/admin/lib/couts.ts` — s'ils changent, on les corrige là et tout l'écran se recalcule.

**Budget** : 140 s par appel, sous les 150 s d'une Edge Function. Mesuré sur les 24 demandes
réelles : recherche 43 s en moyenne mais **134 s au pire**, approfondissement 76 s, e-mail 6 s. La
marge sur une recherche large est donc mince — c'est le premier endroit à surveiller.

**Audio** : l'enregistreur s'arrête à 24 Mo ou dix minutes, le service en refuse 25 Mo. Le micro
de la conversation, lui, s'arrête à 60 secondes et ne stocke rien. Environ 1,2 Mo la minute sur
iPhone, soit une vingtaine de minutes de marge. Sur un enregistrement vide, le modèle de
transcription recopie la consigne qu'on lui a donnée : c'est détecté et écarté, sinon la consigne
serait rangée comme un compte rendu.

## Les tables

| Table | Contenu | Qui y accède |
|---|---|---|
| `admin_merx_conversations` | les fils de discussion | leur auteur |
| `admin_merx_demandes` | la file des travaux, avec sa consommation | l'équipe |
| `admin_prospects` | les fiches trouvées, note et dossier commercial | l'équipe |
| `admin_clients` | les affaires du Pipeline *(table existante, étendue)* | l'équipe |
| `admin_accounts` | le fichier client | l'équipe |
| `admin_echanges` | appels, rendez-vous, e-mails, à-faire, notes | l'équipe |
| `admin_notes_dictees` | les débriefs, avec l'enregistrement | **son auteur seul** |
| `admin_terrain` | objections et arguments appris sur le terrain | l'équipe |

RLS active sur toutes. Migrations **0022 à 0038**, à exécuter à la main dans le SQL Editor.

## Ce qui protège les données

- **Corbeille de trente jours** sur les prospects, les affaires, le fichier client et les débriefs :
  supprimer pose une date, rien ne part tout de suite, tout se restaure d'un clic.
- **La destruction définitive est réservée au super-admin** sur les prospects, les affaires et le
  fichier client (migration 0036, `public.is_superadmin()`). L'écran cache le bouton aux autres ;
  la base le refuserait de toute façon. La purge des fiches périmées se fait donc quand un
  super-admin ouvre la Corbeille — c'est ce que l'écran annonce.
- **Les débriefs suivent une autre règle**, volontairement : leur politique est par propriétaire
  (migration 0025), si bien qu'un commercial pourrait détruire les siens par un appel direct à
  l'API — mais jamais ceux d'un autre, qu'il ne voit même pas. Le cloisonnement rend la suppression
  massive impossible ; c'est pourquoi la règle de la 0036 ne leur a pas été étendue, ce qui aurait
  par ailleurs empêché toute purge.
- **Un débrief n'appartient qu'à son auteur** (migration 0025) : c'est sa parole, enregistrement
  compris. Personne d'autre ne le lit, même dans l'équipe.
- **Le compartiment `admin-dictee` n'est pas public.** Détruire une note efface son enregistrement.

## Ce qui reste à faire

- L'Annuaire Santé branché comme outil de Merx (« que sais-tu sur ce dermatologue ? »).
- La bibliothèque du terrain est vide tant qu'aucun débrief n'a contenu d'objection : Merx ne peut
  citer que ce qu'on lui a raconté.
- 25 prospects pour 2 dossiers commerciaux — les autres ont été approfondis avant le correctif du
  schéma et gagneraient à l'être de nouveau.
