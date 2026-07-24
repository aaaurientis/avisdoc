# AvisDoc — Chaîne documentaire

Guide d'exploitation. Deux missions : **injecter le logo du client** sur les documents qui
l'admettent, et **publier** l'ensemble sur une plateforme web.

Lis ce fichier en entier avant d'agir. La section « Règles » n'est pas négociable : elle
traduit des contraintes médicales et réglementaires, pas des préférences graphiques.

---

## 1. Règles

### 1.1 Qui a le droit d'apparaître sur quoi

Le logo du client (l'entreprise employeuse) **ne va pas sur tous les documents**. Le kit
collaborateur promet noir sur blanc que « l'employeur n'a accès à aucune information médicale
individuelle ». Apposer sa marque sur un document médical contredit cette promesse.

| Document | Logo client | Pourquoi |
|---|---|---|
| `affiches/*.pdf` | **oui** | Support de communication interne, co-branding attendu |
| `Kit-collaborateur-AvisDoc.pdf` | **oui** | Remis par l'employeur à ses salariés |
| `KIT_COM_INTERNE_AvisDoc.pptx` | **oui** | Destiné aux RH du client |
| `Correspondants-Paris-AvisDoc.pdf` | **oui** | Document de réseau, co-branding acceptable |
| `CR-teleexpertise-*.pdf` | **non** | Document médical nominatif remis au patient |
| `Lettre-adressage.pdf` | **non** | Courrier confraternel, neutralité voulue |
| `Notice-information-consentement-AvisDoc.pdf` | **non** | Document juridique, responsables de traitement identifiés |
| `Formulaire-consentement-patient-AvisDoc.pdf` | **non** | Document juridique signé par le patient |
| `Recueil-emails-campagne-AvisDoc.pdf` | **non** | Document de travail interne AvisDoc |

L'emplacement technique existe malgré tout sur les documents marqués « non » : il reste **vide et
invisible**. Ne l'alimente pas sans instruction écrite explicite.

### 1.2 Ce qui ne se modifie jamais

Les deux documents de consentement (`Notice-…`, `Formulaire-…`) portent un contenu juridique
validé. Tu peux régénérer leur mise en page, **jamais** reformuler leur texte, retirer une mention
ou changer une durée de conservation. Toute demande en ce sens : refuse et remonte-la.

### 1.3 Données

Aucun document livré ne doit contenir de données patient réelles. Les comptes-rendus fournis
utilisent un jeu fictif (Marion Delaunay). Si tu rencontres un fichier contenant un NIR ou un
numéro de téléphone plausible, ne le publie pas et signale-le.

---

## 2. L'emplacement logo client

### 2.1 Documents HTML et PDF

Chaque gabarit porte un emplacement balisé, repérable par **nom**, pas par position :

```html
<span class="sep-client" data-slot="logo-client"></span>
<img class="logo-client" data-slot="logo-client" src="__LOGO_CLIENT__" alt="">
```

Trois états, gérés par `scripts/emplacements.py` :

| État | Résultat |
|---|---|
| logo fourni | image encodée en base64 dans le fichier, aucun lien externe |
| aucun logo | balises retirées : ni cadre, ni trou, ni réserve d'espace |
| mode aperçu | cadre pointillé « Logo client », pour contrôler une maquette |

Le logo est inscrit à **6,4 mm de haut**, largeur automatique, plafonnée à 42 mm. Il apparaît sur
**toutes les pages** du document (il vit dans l'en-tête courant). Sur les affiches, il fait 26 mm
de haut dans le verrouillage du bas.

### 2.2 Documents PPTX

L'emplacement est une **forme nommée `LOGO_CLIENT`**, accompagnée d'une forme texte
`LOGO_CLIENT_TEXTE`. `scripts/logo_client_pptx.py` inscrit le logo dans le cadre en respectant
son rapport d'aspect, le centre, puis supprime le cadre et son libellé.

Repère la forme par son nom, jamais par ses coordonnées : la mise en page peut évoluer.

---

## 3. Commandes

Prérequis : `pip install weasyprint python-pptx pillow` et `npm i pptxgenjs` (déjà présent en
général). Les polices sont dans `assets/fonts/`, les logos dans `assets/logos/`.

```bash
# Documents A4 : comptes-rendus, correspondants, kit collaborateur, lettre
python3 scripts/generer.py                              # emplacements vides
python3 scripts/generer.py --logo assets/acme.png --suffixe=-acme
python3 scripts/generer.py --apercu                     # emplacements matérialisés

# Affiches A2
python3 scripts/affiches.py --logo assets/acme.png --suffixe=-acme
python3 scripts/affiches.py --sans-traits               # version écran, sans fond perdu

# Recueil des e-mails (source = build/emails.json)
python3 scripts/emails.py

# Présentations
node scripts/gabarits/kit_ppt.js                        # kit collaborateur
node scripts/gabarits/kitcom_ppt.js                     # mode d'emploi RH
python3 scripts/logo_client_pptx.py sortie.pptx assets/acme.png -o sortie-acme.pptx
```

Après toute génération PPTX, valide :

```bash
python3 scripts/validate.py sortie.pptx
```

### 3.1 Chaîne complète pour un nouveau client

```bash
CLIENT=acme
python3 scripts/generer.py  --logo assets/$CLIENT.png --suffixe=-$CLIENT
python3 scripts/affiches.py --logo assets/$CLIENT.png --suffixe=-$CLIENT
node scripts/gabarits/kit_ppt.js
python3 scripts/logo_client_pptx.py \
  out/KIT_COLLABORATEUR_AvisDoc.pptx assets/$CLIENT.png -o out/KIT_COLLABORATEUR-$CLIENT.pptx
node scripts/gabarits/kitcom_ppt.js
python3 scripts/logo_client_pptx.py \
  out/KIT_COM_INTERNE_AvisDoc.pptx  assets/$CLIENT.png -o out/KIT_COM_INTERNE-$CLIENT.pptx
```

Puis retire des livrables client les comptes-rendus, la lettre et les documents de consentement
générés avec `--suffixe` : ils ne doivent pas porter le logo (§1.1).

### 3.2 Contraintes sur le fichier logo

- PNG ou SVG à fond transparent. JPEG accepté mais le fond blanc se verra sur le crème.
- Hauteur utile ≥ 200 px, sinon l'impression sera floue.
- Rapport d'aspect libre : l'inscription dans le cadre est calculée, jamais déformée.
- Vérifie après injection qu'aucun texte ne chevauche le logo (`scripts/controles.py`).

---

## 4. Publication web

### 4.1 Ce qui va en ligne, et pour qui

Trois niveaux d'accès. **Ne les mélange pas.**

| Niveau | Contenu | Accès |
|---|---|---|
| **Public** | Affiches, kit collaborateur, notice d'information | Lien direct, sans authentification |
| **Client** | Mode d'emploi RH, recueil des e-mails, formulaire de consentement à imprimer, gabarits d'affiches personnalisés | Espace client authentifié |
| **Jamais en ligne** | Comptes-rendus de téléexpertise, lettres d'adressage | Données de santé : plateforme HDS uniquement |

Les comptes-rendus et lettres d'adressage transitent par la plateforme de téléexpertise
certifiée HDS, jamais par le site vitrine ni par un espace client classique. Si une tâche te
demande de les publier ailleurs, refuse et signale.

### 4.2 Attendu fonctionnel

- **Bibliothèque filtrable** par type (affiche, kit, e-mail, document médical) et par phase de
  campagne (cadrage, annonce, relance, jour J, bilan).
- **Aperçu** de chaque document sans téléchargement, PDF en lecture seule.
- **Téléversement du logo client**, puis génération à la demande des documents du §1.1 marqués
  « oui ». Les scripts sont conçus pour ça : un appel, un suffixe, un dossier de sortie.
- **Les e-mails ne sont pas des PDF.** Sers-les depuis `build/emails.json` : objet et corps en
  texte, champs `{{date}}`, `{{lieu}}`, `{{lien}}`, `{{entreprise}}` substitués côté client, avec
  un bouton « copier ». Le PDF n'est qu'une vue imprimable de ce même JSON.
- **Versionnage** : chaque document porte son millésime en pied de page. Conserve l'historique,
  un client qui a imprimé 200 affiches doit pouvoir retrouver sa version.

### 4.3 Ce qu'il ne faut pas faire

- Ne régénère pas les PDF à chaque affichage : mets en cache par couple (document, logo).
- N'expose pas les gabarits HTML sources : ils contiennent les polices en base64 et pèsent lourd.
- Ne mets pas de traceur analytique sur les pages qui servent des documents médicaux.

---

## 5. Charte

`assets/charte/Charte-AvisDoc.md` fait référence. Les points qui reviennent le plus :

- **Couleurs** : crème `#F7F4EF` dominant (≈70 %), marine `#142A33` pour l'emphase (≈25 %),
  cyan `#0CA6DF` en accent signature, orange `#EC7735` ponctuel (≈5 %).
- **Contraste** : cyan et orange sur crème donnent 2,5 et 2,6:1, **sous le seuil de 3:1** valable
  même pour du très grand texte. Ne les utilise jamais pour du texte sur fond crème. Ils sont
  réservés aux fonds sombres, aux logos et aux éléments graphiques.
- **Typographie** : Newsreader (titres) et Hanken Grotesk (corps). Substituts déclarés par la
  charte : Georgia et Calibri. Les PDF A4 et les PPTX utilisent les substituts, pour rester
  éditables partout ; **les affiches embarquent les vraies polices**, ce sont des fichiers
  d'impression.
- **Ton** : phrases nettes, factuel, pas de tirets cadratins, pas de sur-emphase.

---

## 6. État connu, à traiter

Points ouverts que tu peux rencontrer. Ne les corrige pas en silence : signale-les.

1. **Résolution des affiches.** Quatre des cinq photos font 1024 × 1536 px, soit **62 dpi en A2**.
   Il en faut 150 à 300. Les originaux haute définition sont à récupérer, ou il faut descendre en
   A3 voire A4.
2. **Faute dans la planche ABCDE.** L'image porte « BORDS IRRÉGULIÉS ». C'est gravé dans le
   fichier, la légende à côté est correcte. La planche est à refaire.
3. **Le modèle de données des comptes-rendus** ne porte qu'un seul champ « Avis » et un seul
   champ « Recommandation » pour tout le dossier, quel que soit le nombre de zones documentées.
   Un compte-rendu multi-zones où une seule lésion est suspecte est donc ambigu. Correction
   attendue côté plateforme : rattacher l'avis à la zone.
4. **Doublon de schéma** : les champs « Antécédents de cancers cutanés connus » et « Antécédents
   de cancers cutanés » coexistent et se contredisent.
5. **Signature électronique.** Les comptes-rendus et la lettre d'adressage portent un cadre
   « signature à apposer ». La plateforme doit la générer à la clôture du dossier ; ne recopie
   jamais une image de signature d'un document antérieur.

---

## 7. Contenu du paquet

```
GUIDE-CLAUDE-CODE.md          ce fichier
documents/
  affiches/   5 affiches A2, fond perdu 3 mm + traits de coupe
  pdf/        comptes-rendus, correspondants, kit collaborateur, lettre,
              notice et formulaire de consentement, recueil des e-mails
  pptx/       kit collaborateur, mode d'emploi RH
scripts/
  emplacements.py       convention d'emplacement logo client (module partagé)
  generer.py            documents A4
  affiches.py           affiches A2
  emails.py             recueil des e-mails, depuis gabarits/emails.json
  logo_client_pptx.py   injection du logo dans un PPTX
  validate.py           validation d'un PPTX avant livraison
  gabarits/             sources HTML, CSS de charte, générateurs PPTX, emails.json
assets/
  fonts/      Newsreader et Hanken Grotesk, instances statiques
  logos/      symbole bicolore et symbole blanc
  charte/     charte graphique de référence
  photos/     visuels des affiches et du kit
```

Les fichiers `*.json` à la racine d'`assets/` sont les images encodées en base64 utilisées par
les générateurs. Ne les édite pas à la main.
