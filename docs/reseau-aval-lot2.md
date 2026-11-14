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
