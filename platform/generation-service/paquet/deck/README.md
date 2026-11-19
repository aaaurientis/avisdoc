# Commande `deck` : mise à la charte AvisDoc des présentations

Prend une présentation PowerPoint quelconque et en produit une version à la charte, éditable, avec
un rapport des corrections faites et des anomalies relevées. Elle ne rédige pas : le contenu n'est
jamais reformulé. Brief : `BRIEF-deck-pptx.md` (19/11) ; constat et décisions : `NOTE-LOT0.md`.

## Usage (depuis `paquet/`)

```bash
python3 build.py deck tout source.pptx -d travail/            # mode règles, sans réseau
python3 build.py deck tout source.pptx -d travail/ --modele   # mode modèle (repli sur les règles)
python3 -m deck generer travail/deck.json                      # après correction à la main du pivot
python3 -m deck controles travail/sortie.pptx travail/deck.json
python3 -m pytest deck/tests                                   # recette du brief §11
```

Le dossier de travail reçoit `deck-brut.json`, `images/`, `deck.json` (le pivot, modifiable à la
main), `sortie.pptx`, `rapport.md`, `controle.jpg` (si LibreOffice est installé) et, en mode
modèle, la trace `modele-demande.json` / `modele-reponse.json`. La source n'est jamais modifiée.

## Décisions du 19/11 (réponses à la note du lot 0)

| Question | Décision |
|---|---|
| Fond | crème pour les présentations (`meta.fond`, un seul endroit : la couleur lt1 du thème) |
| Hébergement HDS | non nécessaire : les présentations sont filtrées avant dépôt |
| Fichiers de référence absents | la charte du dépôt fait foi ; couleurs hors charte remplacées (`charte.py`) |
| LibreOffice dans le service | oui, pour la planche de contrôle |
| « Dépistage » | avertissement |
| Mode | mode modèle par défaut, repli automatique sur les règles |

## Modules

| Fichier | Rôle |
|---|---|
| `extraire.py` | étape 1 : source → `deck-brut.json`, `images/` |
| `proposer.py` | étape 2, mode règles (heuristiques ordonnées, chaque décision motivée) |
| `modele.py` | étape 2, mode modèle : un appel par présentation, texte seul, cinq garde-fous |
| `maitre.py` | thème AvisDoc et dix mises en page nommées, pied sur la mise en page |
| `generer.py` | étape 3 : pivot → `sortie.pptx`, refus plutôt que débordement |
| `controles.py` | étape 4 : codes du brief §7, `rapport.md`, planche |
| `charte.py`, `typo.py`, `icones.py` | palette, géométrie, typographie française, icônes au trait |

## Word et PDF (`documents.py`, 19/11)

- **Word (.docx)** : remis à la charte sur place (styles Georgia/Calibri en marine, polices et
  couleurs posées à la main retirées, styles inutilisés du modèle Word retirés, tableaux, A4,
  en-tête logo et pied signature + numéro, typographie). Contenu, images et ordre inchangés.
- **PDF** : mise en page reconstruite à la charte (titres, paragraphes, listes, tableaux,
  images repérés), PDF régénéré en Newsreader et Hanken Grotesk ; avertissement `MISE_EN_PAGE`
  à vérifier. Un PDF scanné (sans texte) est refusé.
- `python3 -m deck tout fichier.docx|.pdf -d dossier/` ; rapport dans `dossier/rapport.md`.

## Depuis le Hub (module Documents)

Bouton « Mettre à la charte » en haut de Documents : on choisit un `.pptx`, `.docx` ou `.pdf`, le
fichier transite par `admin-documents/_charte-temp/` (invisible dans la liste), le service le
traite (webhook sur `admin_deck_jobs`, migrations 0097-0098) et efface la source ; on télécharge
le résultat avec son rapport, puis il est effacé à la fermeture. Rien n'est enregistré.
