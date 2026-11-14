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
