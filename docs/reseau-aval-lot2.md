# Réseau d'aval — Lot 2 : signaux sourcés, fiche Google, recherche IA, score

Réf. : [note du lot 0](reseau-aval-lot0.md) (décisions du 14/11, §6 et §8 bis),
[lot 1](reseau-aval-lot1.md), [fiche de registre RGPD](reseau-aval-registre-rgpd.md).
Livré le 14 novembre 2026.

## Ce que fait le lot 2

Dans **Trouver des médecins › un département › une fiche praticien** :

1. **Score.** La fiche affiche la probabilité d'adhésion au réseau, avec le détail du
   calcul : la base, chaque contribution et sa source, la somme `z`, et la formule
   1 / (1 + e^(−z)). Le calcul se refait à la main. La liste du département est triée
   par score.

   Ce pourcentage est une **estimation a priori, non calibrée** : les pondérations sont
   celles proposées le 14/11, en attente de validation. Elles se trouvent dans
   `SCORE_CONFIG` (`supabase/functions/_shared/reseau-signaux.ts`). Seuls les signaux
   validés comptent, et « inconnu » vaut 0.

   Trois critères éliminatoires mettent le score à 0 % et affichent leur motif :
   - le praticien est exclu ;
   - son activité est à dominante esthétique ;
   - il n'apparaît plus dans l'extraction RPPS.
2. **Signaux.** La grille comprend onze signaux : les dix du brief, plus la
   télé-expertise. Chacun est :
   - **saisi par un opérateur**, avec l'URL de la page source, obligatoire et
     contrôlée par la base ;
   - **ou proposé par l'IA**, puis validé ou rejeté par un opérateur.

   Il n'y a qu'un signal validé par type ; le suivant remplace le précédent, qui reste
   dans l'historique. Une télé-expertise validée « oui » ajoute le rôle « Futur
   requérant ».
3. **Recherche assistée par IA (praticien).** Le bouton « Lancer la recherche »
   déclenche une recherche web par l'API Claude. Doctolib, LinkedIn, Google et les sites
   d'avis sont exclus. Pour chaque information, l'IA doit fournir l'URL et la phrase
   exacte de la page. Le serveur charge la page et vérifie deux choses :
   - la page nomme bien le praticien ;
   - la phrase y figure mot pour mot.

   Si l'une manque, la proposition est **écartée d'office**, et la fiche dit pourquoi.
   Ce qui passe arrive dans « À valider » avec l'extrait et le lien. L'extrait est
   effacé dès que l'opérateur décide.
4. **Fiche Google Maps.** « Trouver la fiche » propose les fiches candidates, et
   l'opérateur choisit la bonne (ou « Aucune ne correspond », ce qui ne pénalise pas).
   Seul l'identifiant de la fiche est enregistré. « Afficher la fiche » charge en direct
   le téléphone, le site, les horaires et la note ; « Voir les avis » charge les avis à
   la demande. Rien de ce contenu n'est écrit en base. Un quota quotidien protège le
   budget.
5. **Ajout par RPPS.** Depuis l'écran du département, « Ajouter par RPPS » contrôle le
   numéro dans l'extraction RPPS. Il refuse :
   - un non-médecin ;
   - une spécialité hors réseau ;
   - un praticien exclu.

   Un généraliste entre comme « Généraliste formé à la dermoscopie ». Tous ses lieux
   d'exercice sont repris, dans chaque département.
6. **Généralistes formés à la dermoscopie (IA, département).** Le bouton « Chercher les
   généralistes formés à la dermoscopie » lance une recherche web à l'échelle du
   département. Chaque médecin trouvé passe :
   - le contrôle de la phrase sur la page ;
   - le rapprochement avec le RPPS : généraliste du département, nom et prénom
     identiques, un seul candidat (s'il y a des homonymes, la commune départage, sinon
     on s'abstient).

   Ceux qui passent sont **ajoutés directement à la liste des candidats**. Leur signal
   « DU ou formation en dermoscopie » (et « télé-expertise » s'il est trouvé) reste à
   valider.

## Suivre l'avancement d'une recherche IA

Ajouté le 14/11 à la demande d'Arthur, migration `0089_reseau_aval_avancement_ia.sql`.
Pendant une recherche, sur la fiche praticien comme sur l'écran du département, l'écran
se rafraîchit toutes les 3 secondes et affiche :

- l'étape en cours, par exemple « Recherche sur le web (2/5) » ou « Vérification des
  sources (3/4) » ;
- une barre de progression et la durée écoulée ;
- le journal : chaque recherche web lancée par l'IA (avec ses mots-clés, annoncée dès son
  lancement grâce au mode flux), le nombre de pages trouvées, chaque source vérifiée ou
  écartée avec son motif, chaque généraliste ajouté ou écarté.

Une fois la recherche terminée, le journal reste consultable (« Voir le journal »). Il
contient des adresses de pages et des motifs, jamais d'extrait de page.

## Recherche automatique de la fiche Google

Ajoutée le 14/11 à la demande d'Arthur (migration `0090_reseau_aval_google_auto.sql`).

- **Quand.** Dès qu'un praticien entre dans le tableau : à la fin de chaque import RPPS,
  après un ajout par RPPS, et après la recherche IA des généralistes. Le bouton « Chercher
  maintenant » relance la recherche pour ceux qui restent.
- **Comment.** Une recherche Google Places par praticien (« Dr Prénom Nom, spécialité,
  commune »). La fiche est **rattachée d'office seulement si un seul résultat porte le nom
  du praticien ET le code postal d'un de ses lieux d'exercice RPPS**, et n'est pas fermée.
  Sinon le praticien passe « À confirmer » (plusieurs fiches possibles) ou « Introuvable ».
  Un choix fait par un opérateur n'est jamais écrasé.
- **Dans le tableau.** La colonne « Google » indique le statut : fiche confirmée, fiche
  trouvée, à confirmer, introuvable, pas de fiche, ou à chercher. Elle a son filtre, et
  devient un pictogramme coloré quand une fiche est ouverte. Sur la fiche, « C'est la bonne
  fiche » confirme une fiche trouvée automatiquement.
- **Suivi.** La recherche des fiches d'un département s'affiche comme une recherche IA :
  étape, pourcentage, journal.
- **Budget.** Une recherche par praticien. Le plafond quotidien passe à 200 recherches
  (`RESEAU_GOOGLE_PLAFOND_RECHERCHE`). Au-delà, la suite reprend le lendemain ou au clic
  sur « Chercher maintenant ». Un lot traite au plus 150 praticiens. Pour un gros
  département comme Paris (≈ 1 600 praticiens), comptez une dizaine de jours, ou
  relevez le plafond en connaissant le coût (voir l'estimation de la note du lot 0).

## Liens, carte et recherches groupées (14/11, migration 0091)

### Fiches Google : département, plusieurs fiches, force de la correspondance

- **France et département seulement.** La recherche cible le département. Seules les
  fiches dont l'adresse est en France, avec un code postal du département, sont gardées.
- **Plusieurs fiches par praticien** (cabinet, hôpital…). Sur la fiche, l'opérateur coche
  une ou plusieurs fiches puis clique sur « Rattacher ».
- **Force de la correspondance**, affichée pour chaque résultat :

  | Force | Condition | Effet |
  |---|---|---|
  | certaine | nom du praticien + adresse RPPS (code postal **et** rue) | validée d'office (« Fiche confirmée ») |
  | forte | nom + code postal d'un lieu RPPS | rattachée, à vérifier (« Fiche trouvée ») |
  | moyenne | nom, autre commune du département | proposée (« À confirmer ») |
  | faible | le nom n'y figure pas | masquée par défaut, jamais mise en avant |

  Si un praticien n'a que des correspondances faibles, il passe « Introuvable ».
- **Affichage direct.** À l'ouverture d'une fiche praticien, ses fiches Google rattachées
  s'affichent d'elles-mêmes, pour valider d'un coup d'œil. Chaque affichage est une
  consultation Google, comptée dans le quota quotidien.

### Doctolib

Le Hub ne lit jamais une page Doctolib : pas d'API publique, collecte automatisée
interdite par ses conditions, et règle 2 du brief.

- **Lien cherché automatiquement.** Une recherche web limitée à doctolib.fr renvoie des
  adresses, et seules ces adresses sont examinées. Une adresse n'est rattachée d'office
  que si c'est la seule au format `doctolib.fr/<spécialité>/<ville>/<prénom-nom>` avec
  le bon nom, le bon prénom et une commune d'exercice. Sinon le praticien passe
  « À confirmer », ou « Introuvable » s'il n'existe aucune adresse à son nom. Une adresse
  absente des résultats n'est jamais retenue. Quota : 200 recherches par jour
  (`RESEAU_DOCTOLIB_PLAFOND`).
- **Sur la fiche.** On trouve :
  - le lien direct ;
  - « C'est la bonne fiche » pour confirmer ;
  - « Changer de lien » ;
  - « Chercher sur Doctolib », qui ouvre une recherche web ;
  - « Coller le lien » ;
  - « Pas sur Doctolib ».
- **Premier créneau.** L'opérateur ouvre la fiche Doctolib, puis relève le premier
  créneau en un clic : moins de 7 jours, 7 à 30 jours, plus de 30 jours, ou aucun pour un
  nouveau patient. Le relevé est un signal sourcé (lien, date, auteur), **périmé au bout
  de 14 jours**. Il compte dans le score : +0,5, +0,2, −0,5 ou −0,8 (pondérations a priori
  à valider).
- **Dans le tableau.** Une colonne « Doctolib », cliquable quand un lien existe, avec son
  filtre. L'écran affiche aussi une synthèse : fiches liées, et répartition des créneaux
  relevés.

### Relever une fiche Doctolib en un clic (favori, 14/11, migration 0092)

> **À faire valider par le DPO avant usage courant** (décision d'Arthur du 14/11 : option
> « favori », avec réserve). La règle 2 du brief (Doctolib en lecture humaine) est
> respectée dans l'esprit : une page à la fois, ouverte par l'opérateur, au rythme humain,
> sans parcours automatique. Mais le texte de la page est lu par le navigateur, puis
> analysé par le Hub.

- **Installation.** Sur l'écran « Trouver des médecins », on glisse une fois le bouton
  « Relever sur Doctolib » dans la barre de favoris.
- **Usage.** On ouvre la fiche d'un praticien sur Doctolib, puis on clique sur le favori.
  Le Hub s'ouvre (écran « Relevé d'une fiche Doctolib ») avec le texte de cette page
  seulement. Le message n'est accepté que s'il vient de doctolib.fr.
- **Analyse** (`_shared/doctolib-fiche.ts`, logique pure testée) :
  - premier créneau, réparti en moins de 7 jours, 7 à 30 jours, plus de 30 jours, ou
    aucun ;
  - nouveaux patients, et fiches réservées aux patients déjà suivis ;
  - spécialité ;
  - expertises, actes et symptômes ;
  - conventionnement, carte Vitale, tarifs, langues ;
  - téléconsultation, adresses, présentation.

  Une rubrique introuvable reste vide, « non reconnue », et n'est jamais déduite.
- **Vérification.** L'opérateur choisit le praticien, retrouvé par son lien Doctolib ou
  par son nom. Il relit l'analyse et coche les signaux proposés, chacun avec le passage de
  la page qui le justifie : créneau, nouveaux patients, dermoscopie, exérèse, chirurgie sur
  place. L'enregistrement fait alors trois choses :
  - les informations relevées vont dans `doctolib_infos`, avec la date et l'auteur ;
  - le lien Doctolib passe « confirmé » ;
  - les signaux cochés sont validés au nom de l'opérateur, avec la fiche comme source.
- **Secours.** Si le favori est bloqué, la même page accepte un copier-coller du texte de
  la fiche et de son adresse.
- **Limite.** L'analyse repose sur les intitulés de Doctolib (« Expertises, actes et
  symptômes », « Tarifs », « Langues parlées »…). Elle est écrite sans accès à Doctolib
  et sera à ajuster après les premiers relevés réels si Doctolib emploie d'autres
  intitulés.

### Carte

Le bouton « Carte » affiche la liste filtrée du département sur une carte. Chaque lieu
d'exercice est un point, coloré selon la population et cerclé de vert en cas d'accord ;
un clic ouvre la fiche. Les adresses sont géocodées par l'API Adresse (BAN, gratuite) au
cours de la recherche des liens.

### Recherches groupées, en file

Les travaux longs d'un département passent par une **file** (fonction `reseau-file`).
Chaque appel traite plusieurs praticiens en parallèle pendant quelques minutes, puis se
relance de lui-même jusqu'au bout. L'avancement s'affiche, et un bouton « Arrêter » met
fin à la tâche ; ce qui est fait reste fait.

- **Carte, fiches Google et Doctolib.** Ce travail se lance automatiquement après chaque
  import, et par « Chercher maintenant ». Après un ajout par RPPS ou la recherche IA des
  généralistes, il est lancé pour les nouveaux venus.
- **Recherche IA de toutes les fiches.** Une fenêtre de confirmation affiche le nombre de
  praticiens, le coût estimé (environ 0,25 € par praticien, à ajuster sur les factures)
  et la durée. Par défaut, elle exclut les fiches recherchées ces 30 derniers jours.
  Chaque praticien garde son propre suivi sur sa fiche.

## Fichiers

| Fichier | Rôle |
|---|---|
| `supabase/migrations/0088_reseau_aval_signaux.sql` | Signaux, colonnes Google, journal des recherches IA, compteur d'appels Google |
| `supabase/functions/_shared/reseau-signaux.ts` | Grille, contrôle des extraits, domaines exclus, score (logique pure, testée) |
| `supabase/functions/_shared/tabulaire-rpps.ts` | Accès commun à l'extraction RPPS (département, RPPS, nom) |
| `supabase/functions/_shared/enregistrer-praticien.ts` | Création d'un candidat hors import (mêmes règles) |
| `supabase/functions/reseau-action/` | Plus : signaux, rattachement Google, ajout par RPPS |
| `supabase/functions/reseau-google/` | Fiches candidates et fiche en direct (API Places) |
| `supabase/functions/reseau-ia/` | Recherches IA, en tâche de fond |
| `src/admin/pages/reseau/FichePraticien.tsx` | La fiche praticien complète |

## Mise en production

1. **Migration.** Exécuter `supabase/migrations/0088_reseau_aval_signaux.sql` dans le
   SQL Editor du projet admin, **avant** le déploiement : l'écran lit les nouvelles
   tables. Elle est additive et rejouable.
2. **Déploiement.** La fusion dans `main` déploie les fonctions et le front
   automatiquement.
3. **Secrets.** Aucun nouveau secret n'est obligatoire :
   - `ANTHROPIC_API_KEY` et `GOOGLE_MAPS_KEY` existent déjà (Merx) ;
   - `GOOGLE_PLACES_KEY` est facultatif : c'est la clé serveur dédiée, utilisée en
     priorité si elle existe ;
   - `RESEAU_MODEL_RECHERCHE` est facultatif : il change le modèle d'IA (par défaut
     `claude-opus-5-5`) ;
   - `RESEAU_GOOGLE_PLAFOND_RECHERCHE`, `_DETAILS` et `_AVIS` sont facultatifs. Ce sont
     les quotas quotidiens, par défaut 100, 300 et 100.
4. **Console Google Cloud.** Régler le plafond de 50 € par mois et les alertes à 50 % et
   90 % (décision du 14/11).

## Vérifications faites avant livraison

| Vérification | Résultat |
|---|---|
| Tests (`npm run test`) | 108 au vert, dont 24 pour le réseau d'aval : score recalculé à la main, extraits vérifiés, domaines exclus, URL obligatoire, ajout par RPPS |
| Vérification de types des quatre fonctions (Deno) | OK |
| Build du front | OK |
| Migration 0088 sur Postgres 16, deux fois | OK. Signal sans URL refusé ; extrait interdit une fois la décision prise ; deux signaux validés du même type refusés ; quota Google respecté |
| Requêtes réelles à l'API tabulaire | Recherche par RPPS et par nom d'exercice : OK |
| Écrans dans un navigateur, données fictives | Fiche complète, score expliqué, propositions, fiche Google : OK |

**Non vérifié ici** : les appels réels à l'API Claude et à l'API Google Places, faute de
clé dans l'environnement de développement. Ils se vérifient à la recette.

## Plan de recette

| N° | Étape | Résultat attendu |
|---|---|---|
| L2-1 | Ouvrir un dermatologue, « Trouver la fiche » | Des fiches candidates ; en choisir une. « Afficher la fiche » montre téléphone, site, horaires, note, avec le lien Google Maps |
| L2-2 | « Voir les avis », puis saisir « Plaintes sur les délais » avec l'URL de la fiche | Le signal apparaît validé avec sa source ; le score change |
| L2-3 | Saisir un signal sans URL, ou avec une URL incomplète | Bouton inactif avec son motif ; la fonction refuse aussi (recette 4 du brief) |
| L2-4 | « Lancer la recherche » IA | En une à deux minutes, des propositions avec extrait et lien, ou aucune ; les écartées sont listées avec leur motif |
| L2-5 | Ouvrir la source d'une proposition | La phrase citée figure bien sur la page ; valider, puis vérifier que l'extrait a disparu de la base |
| L2-6 | Recalculer le score à la main depuis le détail affiché (recette 5 du brief) | Même résultat |
| L2-7 | « Ajouter par RPPS » avec le RPPS d'un généraliste du département | Il entre comme généraliste formé à la dermoscopie, avec tous ses lieux |
| L2-8 | « Ajouter par RPPS » avec un RPPS exclu, puis avec celui d'un non-médecin | Refus avec le motif, la fenêtre reste ouverte |
| L2-9 | « Chercher les généralistes formés à la dermoscopie (IA) » | Quelques minutes après : trouvés, ajoutés, déjà là, écartés. Les ajoutés portent « Repéré par l'IA » et un signal « DU » à valider |
| L2-10 | Valider une télé-expertise « oui » | Le rôle « Futur requérant » apparaît sur la fiche |
| L2-11 | Couper l'API (clé retirée) et relancer une recherche IA | Message clair (« la clé de l'IA… » ou « l'IA refuse l'accès… »), rien d'enregistré |

## Fiche praticien : sections repliables et validation Google (15/11)

- La fiche est découpée en sections repliables : probabilité d'adhésion, recherche IA (ouverte d'office s'il y a des propositions ou une recherche en cours), signaux validés (repliée par défaut), **adresses et fiches en ligne** (lieux d'exercice RPPS, fiches Google Maps et Doctolib regroupés). L'état ouvert ou replié est retenu d'une fiche à l'autre (navigateur de l'opérateur). Les spécialités RPPS passent sous le nom.
- Une fiche « À confirmer » affiche d'elle-même les fiches Google possibles. Si l'une est au nom ET à l'adresse RPPS (code postal + voie), elle est validée d'office lors de cette recherche (décision du 14/11), comme pour la recherche automatique. Cas corrigé : fiches restées « À confirmer » alors que l'adresse Google était celle du RPPS.

## Doctolib « non réservable » et tuiles de recherche (15/11)

- **Page Doctolib sans rendez-vous en ligne** (« Dr X n'est pas sur Doctolib — Ce soignant n'est pas réservable en ligne ») : repérée par le relevé (favori) ou signalée d'un clic sur la fiche (« Non réservable en ligne »). Picto Doctolib **rouge** dans le tableau, badge « Non réservable » sur la fiche. Stocké dans `doctolib_infos.reservable = false` (pas de migration). Aucun poids dans le score tant que les pondérations ne sont pas validées.
- **Tuiles de recherche** du département, chacune avec son statut en clair et une pastille (vert = à jour, orange = à faire, bleu = en cours, rouge = échec) : fiches Google Maps, rapprochement Google / RPPS, Doctolib, généralistes dermoscopie (IA), recherche IA des fiches.
- **Rapprochement Google / RPPS** : revérifie les fiches non tranchées (trouvées, à confirmer, introuvables) par une nouvelle recherche Google (une par praticien, sous quota). Au nom et à l'adresse RPPS : validée d'office ; au nom et au code postal : rattachée à vérifier. Rien n'est retiré ni rétrogradé. Techniquement : file `google_departement` avec `resultat.volet` = `google` | `doctolib` | `rapprochement` | `tout`.

## Rapprochement Google / RPPS : correction et vérification par IA (15/11)

- **Correction** : une adresse RPPS avec complément après une virgule (« 21 RUE DE SARLIEVE, LE TRIANGLE ») n'était jamais reconnue : la virgule était effacée avant le découpage, et « triangle » était exigé dans l'adresse Google.
- **Vérification par IA** (modèle léger, `RESEAU_MODEL_VERIF`, défaut `claude-haiku-5-5`, sans recherche web) : quand une fiche porte le nom du praticien mais que l'adresse n'est pas reconnue mot à mot (abréviations, complément, bis/ter…), l'IA compare la fiche aux lieux RPPS et rend un verdict motivé. Elle ne peut que **confirmer** (nom ET même adresse postale) ; jamais rétrograder, jamais retenir une fiche sans le nom. Appliquée à la recherche automatique, au rapprochement, à « Voir les fiches du département » et à l'affichage des fiches « trouvées ». La raison donnée par l'IA est affichée et tracée dans l'historique (`google_fiche_verifiee`).
- Plusieurs fiches rattachées : chacune est vérifiée à l'affichage ; le statut passe à « confirmée » quand toutes le sont.
- Données envoyées à l'IA : nom, prénom, spécialité et lieux RPPS (publics), nom et adresse des fiches Google affichées. Rien n'est conservé côté IA par le Hub.

## Tri, filtre « non réservable » et présence en ligne dans le score (15/11)

- **Tri** : chaque en-tête du tableau est cliquable (praticien, population, commune, exercice, état, Google, Doctolib, score) ; deuxième clic = sens inverse. Par défaut : score décroissant.
- **Filtre Doctolib** : nouvelle valeur « Non réservable ».
- **Score v0.1 (présence en ligne, a priori, à valider avec les autres poids)** : fiche Google confirmée +0,3 (trouvée, à vérifier +0,2) ; lien Doctolib avec prise de rendez-vous en ligne confirmé +0,3 (trouvé, à vérifier +0,2) ; page Doctolib « non réservable » : 0. Chaque point s'affiche dans le détail du score avec son lien.
- **Plafonds quotidiens** (budget Google) : 200 recherches de fiches, 300 affichages de fiches, 100 affichages d'avis, 200 recherches Doctolib ; remise à zéro à minuit UTC (1 h à Paris). Compteur du jour affiché sur les tuiles. Modifiables par les variables `RESEAU_GOOGLE_PLAFOND_RECHERCHE`, `RESEAU_GOOGLE_PLAFOND_DETAILS`, `RESEAU_GOOGLE_PLAFOND_AVIS`, `RESEAU_DOCTOLIB_PLAFOND` (et `PLAFONDS_JOUR` côté écran).

## Favori Doctolib v2 : « Voir plus » et créneaux (15/11)

- **« Voir plus »** : sur la page ouverte par l'opérateur, le favori clique lui-même les boutons qui déplient du contenu sur place (« Voir plus », « Afficher plus », « Lire la suite », « +10 »… ; 15 au plus), lit la page après chacun, referme les fenêtres (Échap), puis envoie le tout. Il ne suit aucun lien et ne quitte jamais la page. Les états successifs sont séparés (`§§avisdoc§§`) pour ne pas mélanger les rubriques ; un passage tronqué est remplacé par sa version dépliée.
- **Créneaux** : l'opérateur ouvre lui-même « Prendre rendez-vous » et choisit le motif, puis clique sur le favori. Le Hub reconnaît la page (adresse `…/booking/…` ou horaires affichés), compte les horaires sous chaque jour, le total sur 7 jours et le premier créneau, et propose le signal « premier créneau ». Écran de vérification avec le détail par jour, à comparer à l'écran Doctolib. Enregistré dans `doctolib_infos.disponibilites` (action `doctolib_creneaux`) ; le lien enregistré reste celui de la fiche.
- Le favori a changé : les opérateurs doivent le **réinstaller**. Validation DPO toujours requise (extension du relevé manuel, aucun parcours automatique).

## Validation Google par la position (16/11)

- Les lieux RPPS sont géocodés par l'API Adresse avec leur précision (`geo_type`, `geo_score`, migration 0094). Les lieux géocodés avant le 16/11 sont recomplétés à la volée (recherche, rapprochement, affichage d'une fiche).
- La position des fiches Google (`location`) est demandée dans la recherche et l'affichage (même famille de champs, pas de surcoût annoncé par Google pour ce champ dans ces requêtes — à surveiller sur la facture).
- **Règle** : fiche au nom du praticien, ouverte, à **50 m au plus** d'un lieu RPPS géocodé **au numéro** (`housenumber`) → validée d'office. Un point au centre d'une rue ou d'une commune ne sert jamais. Le nom reste exigé (un confrère du même immeuble ne doit pas être validé).
- Affichage : « À 18 m d'un lieu RPPS (positions GPS) » sur la fiche ; distance dans la liste des fiches possibles.
- Tableau : la colonne « Lieu d'exercice » devient « Ville » (villes seulement ; les structures restent sur la fiche).

## Export / import des liens Doctolib (16/11)

- Page « Trouver des médecins » : **Exporter les liens Doctolib** (tous départements, praticiens non exclus ayant un lien ; CSV « ; » pour Excel, UTF-8) et **Importer les résultats**.
- Colonnes à remplir : `reservable` (oui/non), `nouveaux_patients` (oui/non), `premier_creneau` (date), `creneaux_7j` (nombre), `releve_le` (date, obligatoire). `rpps` et `url_doctolib` (la source) obligatoires. Lignes non remplies ignorées ; valeurs illisibles signalées ligne par ligne, jamais devinées.
- Aperçu avant envoi. À l'enregistrement (action `doctolib_import`) : lien confirmé, `reservable` et `disponibilites` mis à jour, signaux « premier créneau » (délai entre relevé et premier créneau) et « nouveaux patients » validés au nom de l'importateur, **datés du relevé** (péremption du créneau à 14 jours), source = la fiche.
- Les relevés du fichier doivent être faits à la main, fiche par fiche (pas de collecte automatisée de Doctolib).

## En-tête de fiche : adresses normalisées et téléphones (16/11)

- Sous le nom : chaque adresse d'exercice, normalisée par la Base Adresse Nationale (`geo_label`, migration 0094), avec « vérifiée » si elle a été trouvée au numéro, sinon l'adresse RPPS telle quelle et « non vérifiée ».
- Téléphones dédoublonnés, chacun avec sa source : RPPS, et Google pour les fiches confirmées ou trouvées (lu à l'affichage, jamais enregistré). Cliquables (appel).
- 16/11 : l'import accepte « inconnu » (= case vide), une valeur suivie d'un commentaire entre parenthèses (« non (bloqué…) » = non ; « (parcours interrompu…) » = vide), une date avec heure, et une colonne facultative `statut_fiche` (« non relevé » ignoré, « page inexistante » signalé). Import ponctuel d'un fichier de 53 lignes issu d'une collecte automatisée, décidé par l'utilisateur en connaissance de cause (CGU Doctolib, validation DPO à obtenir) ; aucun outil de collecte n'est fourni par le Hub.

## Points à valider (16/11)

- Par praticien (logique pure `src/admin/reseau/aValider.ts`, testée) : propositions IA en attente ; fiche Google « trouvée » à confirmer ; lien Doctolib « trouvé » à confirmer ou « fiche à choisir » ; hors cible repéré sur Doctolib ; premier créneau Doctolib périmé (> 14 jours) ; absent de la dernière extraction RPPS. Une fiche Doctolib déjà renseignée (relevé, import) n'est plus à confirmer.
- Tableau : la colonne « État » est remplacée par « À valider » (« 2 points à valider », détail au survol ; « À jour » sinon ; « Exclu » reste affiché). Tri et filtre « À valider ». L'état reste sur la fiche et dans le filtre État.
- Fiche : encadré « N points à valider » en tête ; un clic ouvre la section concernée et y descend.
- Doctolib : « À confirmer » devient « Fiche à choisir » (plusieurs fiches à son nom, aucune sûre), et ne s'affiche plus dès qu'une information a été récupérée : « Fiche relevée ».
- 16/11 (suite) : l'import CSV Doctolib ne valide plus rien d'office. « Premier créneau » et « nouveaux patients » arrivent en **propositions** (origine opérateur, `propose_par` « … (import) », `propose_le` = date du relevé, extrait = valeur lue), visibles dans les points à valider de chaque fiche. Une proposition identique d'un import précédent est remplacée. À la validation, un créneau garde la date du relevé (péremption à 14 jours). Le bilan d'import liste les praticiens concernés avec un lien vers leur fiche. « Réservable » et les compteurs de créneaux restent appliqués directement (informations affichées, sans poids propre hors présence en ligne).
- 16/11 (suite) : à l'import, un signal déjà validé avec la même valeur n'est pas redemandé (compté « déjà validé » dans le bilan) ; pour le premier créneau, un relevé plus récent rafraîchit seulement sa date et son lien. Une valeur différente reste proposée à la validation.
- 16/11 (suite) : bouton « N'existe plus » sur le lien Doctolib (page « Cette page n'existe plus ») : lien retiré, statut « Pas sur Doctolib », ancien lien gardé dans `doctolib_infos.pages_disparues` et l'historique, jamais reproposé par la recherche automatique.
- 16/11 (suite) : plafonds Google relevés à **10 000 par jour** et par type (recherches, affichages de fiches, avis) — simple garde-fou contre un emballement ; le budget se pilote dans la console Google Cloud (alerte de budget, quotas de l'API Places). Doctolib (recherche web par l'IA) reste à 200 par jour. Les variables `RESEAU_GOOGLE_PLAFOND_*`, si elles sont définies dans les secrets Supabase, priment sur ces valeurs.
- 16/11 (suite) : plafond Doctolib (recherche des liens par l'IA) relevé à 10 000 par jour, comme Google. Le coût IA se pilote dans la console Anthropic (limites de dépense).
- 16/11 (suite) : correctif — des informations Doctolib partielles (import CSV, boutons) faisaient planter la fiche (« reading 'join' ») ; elles sont désormais normalisées au chargement (`normaliserInfosDoctolib`).
- Statut Doctolib : dès que la page a été chargée (favori ou import), le badge devient « Relevée le JJ/MM » (bleu plein) ; « Lien confirmé » signifie seulement « lien vérifié, page pas encore relevée ».
- Export CSV : colonne `dernier_releve` (date du dernier chargement de la page), informative ; l'import ne la lit pas et accepte les fichiers exportés avant son ajout.
- 16/11 (suite) : recherche Google en plusieurs requêtes. Si « Dr Prénom Nom, spécialité, commune, département » ne ramène aucune fiche au nom du praticien, le serveur relance avec le nom de famille + spécialité **autour du point GPS de chaque lieu RPPS** (rayon 3 km), puis « nom spécialité commune » pour les autres communes (5 requêtes au plus, chacune comptée dans le plafond). Cas d'origine : « Cabinet Dermatologie Dr VENAULT - Pôle Santé » (Blavozy) absent de la première requête.
- 16/11 (suite) : fiche — section « Doctolib » séparée de « Adresses et Google Maps » (chaque section affiche son statut replié ; les points Doctolib ouvrent la section Doctolib). En-tête : site web de la fiche Google retenue (un lien Doctolib n'est pas repris comme site).
- 16/11 (fin) : **retour à la validation d'office pour l'import Doctolib**, à la demande de l'utilisateur. « Premier créneau » et « nouveaux patients » sont enregistrés validés au nom de l'importateur (« … (import) »), datés du relevé, source = la fiche ; même valeur déjà validée : inchangée (créneau : date rafraîchie). Bouton « Valider les N propositions des imports précédents » (action `valider_propositions_import`) pour solder celles laissées en attente, tracées dans l'historique.
- 16/11 (suite) : **validation des fiches Google « trouvées » sans ouvrir la fiche**. Volet de file `validation` : pour chaque praticien « trouvé », chaque fiche rattachée est lue chez Google (champs `id, displayName, formattedAddress, location, businessStatus, primaryTypeDisplayName`, comptés en « affichages », rien n'est enregistré) puis comparée aux lieux RPPS (même rue, ou ≤ 50 m d'un lieu géocodé au numéro, sinon IA). Toutes vérifiées → « confirmée » (historique `google_fiche_verifiee`, `google_valide_adresse_rpps`, acteur « automatique »). Lancé tout seul à l'ouverture d'un département s'il reste des fiches trouvées (une fois par visite) ; aussi inclus dans « Revérifier ».
