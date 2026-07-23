# Chaîne documentaire AvisDoc

Quinze documents finalisés, leurs gabarits sources, et la chaîne qui les régénère.

## Par où commencer

| Vous êtes | Lisez |
|---|---|
| **Claude Code**, ou un développeur qui intègre | `BRIEF-CLAUDE-CODE.md` puis `GUIDE-CLAUDE-CODE.md` |
| **Chargé de campagne**, vous voulez juste les fichiers | `documents/` |
| **Vous ajoutez ou modifiez un document** | `build.py`, section `CATALOGUE` |

## Démarrage

```bash
pip install weasyprint python-pptx pdfplumber pillow
npm install pptxgenjs

python3 build.py liste          # le catalogue
python3 build.py tout           # tout régénérer
python3 build.py controles      # contrôles qualité
python3 build.py client ACME --logo assets/acme.png
```

`build.py client` produit les déclinaisons et **retire de lui-même** celles des documents qui ne
doivent pas porter de logo d'entreprise : comptes-rendus, lettre d'adressage, documents de
consentement. Voir `GUIDE-CLAUDE-CODE.md` §1.1 pour la raison.

## Arborescence

```
BRIEF-CLAUDE-CODE.md    mission d'intégration
GUIDE-CLAUDE-CODE.md    référence : règles, conventions, commandes
build.py                point d'entrée unique, contient le CATALOGUE
manifeste.json          catalogue dérivé, à servir au front

documents/
  affiches/   5 affiches A2, fond perdu 3 mm et traits de coupe
  pdf/        kit collaborateur, correspondants, comptes-rendus, lettre,
              notice et formulaire de consentement, recueil des e-mails
  pptx/       kit collaborateur, mode d'emploi RH
  _sources/   HTML intermédiaires, ne pas publier : polices en base64

scripts/
  emplacements.py       convention d'emplacement logo client
  generer.py            documents A4
  affiches.py           affiches A2
  emails.py             recueil des e-mails
  consentement.py       notice et formulaire
  logo_client_pptx.py   injection du logo dans un PPTX
  validateur/           validation d'un PPTX avant livraison
  gabarits/             sources HTML, CSS de charte, générateurs PPTX, emails.json

assets/
  fonts/      Newsreader et Hanken Grotesk, instances statiques
  logos/      symbole bicolore, symbole blanc
  charte/     charte graphique de référence
  photos/     visuels des affiches et du kit
  *.json      images encodées en base64 pour les générateurs, ne pas éditer à la main
```

## Note sur le contenu

Les comptes-rendus de téléexpertise du paquet utilisent un **jeu de données entièrement fictif**
(Marion Delaunay), avec un NIR de contrôle valide et un numéro de téléphone dans une plage
réservée à la fiction par l'ARCEP. Les photographies de lésions sont générées procéduralement.
Aucune donnée patient réelle ne figure dans ce paquet.
