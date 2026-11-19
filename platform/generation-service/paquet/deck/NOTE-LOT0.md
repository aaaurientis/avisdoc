# Commande `deck` — note du lot 0

19 novembre 2026. Brief : `BRIEF-deck-pptx.md` (version du 19/11). Le lot 0 ne contient pas de
code de production : constat, choix de la pile, schéma du pivot, jeu de test. Aucun lot suivant
ne démarre sans réponse aux questions de la section 6.

Livrables :

| Fichier | Rôle |
|---|---|
| `deck/NOTE-LOT0.md` | cette note |
| `deck/deck.schema.json` | schéma JSON versionné du pivot (version 1), bornes des gabarits comprises |
| `deck/tests/fabriquer_jeu.py` | fabrique le jeu de test, de façon déterministe |
| `deck/tests/jeu/source-fictive.pptx` | présentation hors charte, 11 diapositives, contenu fictif |
| `deck/tests/jeu/deck-attendu.json` | le `deck.json` attendu pour ce jeu, écrit à la main (entrée du lot 1) |
| `deck/tests/test_lot0.py` | le pivot attendu respecte le schéma, aucune diapositive ne disparaît sans le dire, une grille hors bornes est refusée, le jeu est rejouable |

`python3 -m pytest deck/tests` : 4 tests au vert.

## 1. Constat sur le dépôt

L'hypothèse d'implantation du brief est **vérifiée, à l'emplacement près** :

| Le brief attend | Le dépôt contient |
|---|---|
| `pack/build.py`, son `CATALOGUE` | `platform/generation-service/paquet/build.py`, `CATALOGUE` déclaratif (15 entrées, champs `id`, `fichier`, `logo_client`, `acces`, `phase`, `moteur`) |
| `manifeste.json` dérivé | présent, dérivé par `build.py manifeste` |
| commandes `tout`, `liste`, `manifeste`, `controles` | présentes, plus `client NOM --logo` |
| `scripts/logo_client_pptx.py` | présent |
| `REGLES-AvisDoc.md`, `FORMAT-AvisDoc.md`, `SPEC-refonte-CLAUDE.md` | **absents**. Équivalents partiels : `GUIDE-CLAUDE-CODE.md` (règles, logo client, données) et `assets/charte/Charte-AvisDoc.md` |
| référence visuelle `Presentation_CNAM_charte_AvisDoc.pptx` | **absente** |
| prototype Node (`pptxgenjs`) | **absent** du dépôt |

Le pack est embarqué dans le **service de génération** (`platform/generation-service`, FastAPI,
conteneur Scaleway déclenché par un webhook Supabase sur `admin_generation_jobs`). Son image est
construite par `.github/workflows/generation-image.yml`, **uniquement depuis la branche
`claude/avisdoc-fusion`** : je ne sais pas si le service tourne aujourd'hui.

## 2. Écarts entre le brief et la charte du dépôt

1. **Deux couleurs de la palette du brief n'existent pas dans la charte du dépôt** : cyan lisible
   `#087497` et orange lisible `#BC4E17`. Elles viennent sans doute de `REGLES-AvisDoc.md`, absent.
2. **L'annexe A utilise deux couleurs hors palette** : `#C8D3D8` (chapô de couverture, légendes
   sur marine, phrase de clôture) et `#E0E6F1` (cadre des captures). Telles quelles, elles feraient
   échouer le contrôle `COULEUR_HORS_PALETTE`. À ajouter au thème, ou à remplacer (proposition :
   ardoise clair dérivé du thème pour `#C8D3D8`, beige `#E3DCD2` pour le cadre).
3. **Polices** : conformes. La charte déclare Newsreader et Hanken Grotesk, avec Georgia et Calibri
   comme substituts ; le guide du pack impose déjà les substituts dans les PPTX.
4. **Le pack ne contient que des PPTX A4** ; le 16:9 est bien un format nouveau.

## 3. Choix de la pile : Python, `python-pptx`

Recommandation du brief confirmée : **tout en Python**, pas de seconde pile. Vérifié avec
`python-pptx` 1.0.2 (version déjà épinglée par le service) :

| Point à vérifier | Résultat |
|---|---|
| Graphique natif, données éditables | oui : graphique en colonnes avec son classeur Excel embarqué, étiquettes de données, quadrillage retiré |
| Mise en page nommée, espace réservé de titre nommé | oui |
| Sections | pas d'API ; écrites dans le XML (`p14:sectionLst`). Fonctionne, le préfixe d'espace de noms est à soigner au lot 1 |
| Texte alternatif | oui, attribut `descr` |
| Rendu de contrôle | LibreOffice convertit le fichier en PDF |
| Déterminisme | contenu identique d'une exécution à l'autre, seuls les horodatages des entrées du zip diffèrent (tolérés par la recette 1) |

Le fichier maître `gabarits/deck-avisdoc.pptx` (thème et neuf mises en page) sera **fabriqué par
un script** plutôt que dessiné à la main, pour rester rejouable et revu comme du code.

**Conséquence pour le service** : son image n'a pas LibreOffice. Les contrôles de débordement
(rendu PDF et planche `controle.jpg`) demandent `libreoffice-impress` dans l'image, soit environ
300 Mo de plus. Alternative : contrôles par calcul géométrique dans le service, rendu seulement en
local. À trancher (question 6.9).

## 4. Le jeu de test fictif

`source-fictive.pptx` reproduit les **défauts** de la présentation CNAM sans en reprendre le contenu
ni les images :

- fond bleu nuit, titres orange, Helvetica World et Montserrat, aucune mise en page commune ;
- une diapositive par gabarit attendu (couverture, énoncé et liste, étapes, grille, objectifs et
  questions, chiffres, tableau, captures, clôture) et deux replis `texte` ;
- les anomalies à relever : « heures ouvrés », « Avisdoc », « dépistage », tiret cadratin,
  « 15% » sans espace, deux diapositives intitulées « Résultats » ;
- la diapositive de captures montre les deux pages du **compte-rendu fictif du pack**
  (Marion Delaunay, lésions générées). Aucune image issue d'un dossier réel.

`deck-attendu.json` est le pivot que l'étape 2 en mode règles devrait produire. Il sert d'entrée
écrite à la main au lot 1 (`deck generer`), puis de résultat attendu au lot 2.

Deux choix y sont faits, à valider :
- la clôture reçoit la signature de la charte (« La dermatologie n'attend pas. ») comme phrase,
  puisque la diapositive source n'a pas de texte ;
- les textes restent tels qu'extraits (tiret cadratin, « 15% ») : la typographie française est
  appliquée à la génération, comme le prévoit le brief §5.

## 5. Intégration au Hub, module Documents (demande du 19/11)

La demande est d'utiliser la fonction **depuis le module Documents du Hub**. C'est le lot 4 du
brief (« page de dépôt de fichier »). Le Hub ne peut pas exécuter Python : ses fonctions serveur
sont en Deno. Le chemin proposé réutilise ce qui existe :

1. Dans Documents, un bouton « Mettre à la charte » sur un PPTX, ou un dépôt de fichier.
2. Le Hub crée une ligne `admin_generation_jobs` de type `deck` ; le webhook existant réveille le
   service de génération.
3. Le service lance `deck tout`, puis range dans Documents, à côté de la source, `sortie.pptx`,
   `rapport.md`, `deck.json` et la planche de contrôle. La source n'est jamais modifiée.
4. L'écran affiche l'état du travail, le rapport et les anomalies ; `deck.json` peut être corrigé
   puis la génération relancée.

**Point bloquant de conformité.** Une présentation qui contient des captures de comptes-rendus
réels (c'est le cas de la présentation CNAM) contient des **données de santé**. Les déposer dans le
module Documents les stocke dans Supabase Storage, et les fait traiter par le conteneur Scaleway.
Il faut confirmer que ces deux hébergements sont certifiés HDS avant d'accepter de tels fichiers.
Sinon, le dépôt doit refuser tout PPTX qui contient des images tant que ce point n'est pas réglé,
ou la commande reste un outil local.

## 6. Questions avant le lot 1

Reprises du brief §12 :

1. Fond des présentations : crème ou blanc ?
2. Niveau d'accès par défaut : `client`, ou `hds` dès qu'une diapositive montre un compte-rendu ?
3. Une présentation peut-elle porter le logo d'un client ou d'un partenaire (CNAM, assureur) ?
4. Le mode modèle est-il souhaité, ou le mode règles suivi d'une relecture du `deck.json` suffit-il ?
5. Qui utilisera l'outil en dehors d'Arthur ? (En partie répondu : intégration au module Documents.)
6. Logo en haute définition ou vectoriel : à fournir ? (Le pack a `logo_bicolore.png` et
   `logo_blanc.png`, à mesurer au lot 1.)
7. « Dépistage » : avertissement ou erreur bloquante ?

Nouvelles, issues du constat :

8. Fournir `REGLES-AvisDoc.md`, `FORMAT-AvisDoc.md`, `SPEC-refonte-CLAUDE.md` et la référence
   `Presentation_CNAM_charte_AvisDoc.pptx`, ou confirmer que `GUIDE-CLAUDE-CODE.md` et
   `Charte-AvisDoc.md` font foi.
9. Cyan lisible `#087497`, orange lisible `#BC4E17`, `#C8D3D8` et `#E0E6F1` : entrent-ils dans la
   palette ?
10. LibreOffice dans l'image du service (≈ 300 Mo) ou contrôles géométriques côté service ?
11. Le service de génération est-il déployé et branché sur `admin_generation_jobs` aujourd'hui ?
12. Hébergement HDS de Supabase Storage et du conteneur Scaleway (section 5) : confirmé ?

## 7. Lot 1, si les réponses le permettent

Fichier maître fabriqué par script, neuf gabarits et le repli `texte`, `deck generer` depuis
`deck-attendu.json`, `deck controles` (codes de la section 7 du brief), `rapport.md`, entrée
`moteur: "deck"` dans le `CATALOGUE`, appel des contrôles depuis `build.py controles`. Sortie : le
jeu de test généré depuis le `deck.json` écrit à la main, contrôles au vert.
