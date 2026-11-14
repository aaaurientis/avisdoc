# Réseau d'aval — Lot 1 : import d'un département, écrans, exclusion

Réf. : [note du lot 0](reseau-aval-lot0.md), [fiche de registre RGPD](reseau-aval-registre-rgpd.md).
Livré le 14 novembre 2026.

## Ce que fait le lot 1

Dans **Professionnels de Santé › Trouver des médecins** :

1. **Départements.** L'utilisateur ajoute un département et en choisit l'état. Le tableau
   affiche, par département :
   - le nombre de praticiens ;
   - leur répartition par état ;
   - les accords par rôle ;
   - la date du dernier import, marquée « périmé » au-delà de 90 jours.

   Le module ne décide ni des priorités ni de la couverture.
2. **Département.** Action principale : **Importer depuis le RPPS**, qui devient
   « Rafraîchir l'import » après le premier import. L'écran montre :
   - la source et la date de l'extraction ;
   - le résultat du dernier import ;
   - le contexte du département : effectifs par spécialité, libéraux et salariés ;
   - la liste filtrable (recherche, population, rôle, état) ;
   - la fiche résumée du praticien, avec tous ses lieux d'exercice et la source de ses
     données ;
   - l'exclusion définitive.
3. **Rafraîchir l'import ajoute, il ne remplace jamais** (décision du 14/11) :
   - un nouveau praticien est ajouté ;
   - un praticien déjà présent n'est pas modifié (nom, rôles, population, état, fiche
     Google, signaux) : il est seulement complété de ses nouvelles spécialités, de ses
     nouveaux lieux d'exercice et de la date d'extraction ;
   - aucun lieu n'est supprimé ;
   - un praticien absent de la nouvelle extraction reste dans la liste, avec le badge
     « Absent de la dernière extraction ». S'il n'exerce nulle part ailleurs, son score
     passe à 0 avec ce motif.
4. **Liste existante.** Un praticien importé qui figure déjà dans les contacts (Requis,
   Réseau Aval…) avec le même RPPS y est relié et marqué « Déjà dans la liste ». Il n'est
   jamais dupliqué. Les candidats rejoindront la liste Réseau Aval à leur accord (lot 3).

Hors lot 1 : signaux, fiche Google Maps, recherche IA, score (lot 2) ; contact, accord,
export (lot 3). L'indicateur de tension reste réduit aux effectifs tirés du RPPS : la
densité rapportée à la population et l'évolution (Drees) sont reportées. Ameli n'est pas
utilisé (décision du 14/11).

## Fichiers

| Fichier | Rôle |
|---|---|
| `supabase/migrations/0087_reseau_aval.sql` | Tables `admin_reseau_*`, déclencheurs (exclusion définitive, refus d'un exclu), RLS en lecture seule |
| `supabase/functions/_shared/reseau-rpps.ts` | Logique pure : codes de spécialité, départements, regroupement par RPPS, plan d'import |
| `supabase/functions/_shared/acces-sante.ts` | Contrôle d'accès commun (@avisdoc.fr + droit « sante ») |
| `supabase/functions/reseau-import/` | Import d'un département via l'API tabulaire de data.gouv.fr |
| `supabase/functions/reseau-action/` | Ajouter un département, changer son état, exclure un praticien |
| `src/admin/reseau/` | Libellés, accès aux données, jeu de données fictif, tests |
| `src/admin/pages/ReseauDepartements.tsx`, `ReseauDepartement.tsx` | Les deux écrans |

## Mise en production

Le dépôt n'a qu'un environnement, la production. Dans l'ordre :

1. **Migration.** Exécuter `supabase/migrations/0087_reseau_aval.sql` dans le SQL Editor
   du projet admin (`wtovhzxymlqnfxyjxrdq`). Elle est additive et rejouable, et ne touche
   aucune table existante.
2. **Fonctions.**
   ```bash
   supabase functions deploy reseau-import --project-ref wtovhzxymlqnfxyjxrdq
   ```
   ```bash
   supabase functions deploy reseau-action --project-ref wtovhzxymlqnfxyjxrdq
   ```
   Aucun secret nouveau. L'identifiant du fichier RPPS sur data.gouv.fr peut être changé
   par le secret facultatif `RPPS_RESSOURCE_ID` si l'ANS republie le fichier sous un autre
   identifiant.
3. **Front.** Déploiement habituel du Hub.

## Vérifications faites avant livraison

| Vérification | Résultat |
|---|---|
| Tests unitaires (`npm run test`) | 96 tests au vert, dont 12 pour le réseau d'aval |
| Vérification de types des deux fonctions (Deno) | OK |
| Build du front | OK |
| Migration sur un Postgres 16 local, deux fois de suite | OK, rejouable |
| Déclencheurs en base | Doublon de RPPS refusé ; exclusion impossible à modifier ou supprimer ; praticien exclu impossible à recréer ; codes de département invalides (20, 96, 975, 00) refusés |
| Requêtes réelles à l'API tabulaire, logique d'import comprise | Isère : 167 praticiens (64 DERM, 37 ORL, 24 PLAST, 42 CHIR), identique à la note du lot 0. Corse-du-Sud : 39. Paris : 1 573 en 22 s |
| Écrans dans un navigateur, données fictives | Affichage correct ; une erreur d'import s'affiche sans fermer l'écran |

**Non vérifié** : l'enchaînement complet sur le vrai projet Supabase (base, fonctions
déployées, droits). C'est l'objet de la recette ci-dessous.

## Plan de recette

À dérouler en production après la mise en ligne, avec un compte ayant le droit
« Professionnels de Santé ». Les numéros renvoient à la recette du brief (§11).

| N° | Étape | Résultat attendu |
|---|---|---|
| R1 | Ajouter l'Isère (38), ordre 1 | Le département apparaît « À ouvrir », 0 praticien, dernier import « Jamais » |
| R2 | Ouvrir l'Isère, cliquer « Importer depuis le RPPS » | En moins d'une minute : environ 167 praticiens, l'état passe à « Importé », la date d'extraction s'affiche |
| R3 (brief 1) | Cliquer « Rafraîchir l'import » | Même nombre de praticiens, aucun retiré ; le résultat indique 0 ajouté et des praticiens « déjà présents (complétés) » ; signaux, fiches Google et états inchangés |
| R4 (brief 2) | Ajouter et importer la Savoie (73), puis chercher un praticien exerçant en Isère et en Savoie | Il apparaît dans les deux départements, et sa fiche montre ses lieux des deux départements. Un seul praticien en base (même RPPS) |
| R5 | Filtrer par population « ORL », par rôle « Exérèse », par état | La liste se réduit en conséquence ; le compteur « affichés » suit |
| R6 (brief 3) | Exclure un praticien (motif « Opposition »), confirmer, puis rafraîchir l'import | Il passe à « Exclu » ; le bouton d'exclusion est désactivé avec son motif ; après l'import, il est compté dans « exclus ignorés » et n'est pas recréé |
| R7 (brief 7) | Couper le réseau, ou importer pendant une panne de data.gouv.fr | Le message d'erreur s'affiche en rouge, l'écran reste ouvert, le journal note l'import « en échec » |
| R8 | Changer l'état d'un département depuis le tableau | L'état change ; l'historique garde l'ancien et le nouvel état |
| R9 (brief 8) | Relire la migration | Aucun champ patient ; aucun appel au projet HDS |
| R10 | Un praticien déjà dans Requis ou Réseau Aval, avec son RPPS renseigné | Il porte le badge « Déjà dans la liste » après import, sans doublon dans les contacts |
| R11 | Se connecter avec un compte sans le droit « sante » | Le menu et les écrans sont inaccessibles ; un appel direct aux fonctions est refusé (403) |

Le jeu de données fictif (`src/admin/reseau/rpps-fictif.ts`) couvre les cas limites :
praticien sur plusieurs lieux, lieux hors département, double spécialité, ancien code ORL,
chirurgie viscérale exclue, non-médecin, compétence non qualifiante, RPPS invalide, Corse.
Il sert aux tests automatiques et ne s'importe jamais en production.
