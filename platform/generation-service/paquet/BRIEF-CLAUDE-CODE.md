# Brief — Intégration de la chaîne documentaire AvisDoc

À remettre tel quel à Claude Code, avec le paquet. Le guide de référence est
`GUIDE-CLAUDE-CODE.md` ; ce brief dit **quoi faire**, le guide dit **comment**.

---

## Contexte

AvisDoc est une plateforme française de téléexpertise en dermatologie. Elle organise, pour le
compte d'entreprises clientes, des journées de dépistage des cancers de la peau sur le lieu de
travail. Chaque campagne mobilise une quinzaine de documents : affiches, e-mails, kits, documents
médicaux et juridiques.

Aujourd'hui ces documents sont produits à la main, un par client. Le paquet fourni contient les
quinze documents finalisés, leurs gabarits sources et une chaîne de génération qui fonctionne en
ligne de commande.

## Mission

Deux livrables.

1. **Automatiser la pose du logo client** sur les documents qui l'admettent, à partir d'un simple
   téléversement de fichier.
2. **Publier la bibliothèque** sur une plateforme web, avec trois niveaux d'accès distincts.

---

## Point de départ

```bash
unzip AvisDoc-chaine-documentaire.zip && cd paquet
pip install weasyprint python-pptx pdfplumber pillow
npm install pptxgenjs

python3 build.py liste          # le catalogue des 15 documents
python3 build.py tout           # tout régénérer, ~30 s
python3 build.py controles      # doit afficher « Aucun défaut détecté »
python3 build.py client ACME --logo assets/acme.png
```

Si `build.py controles` ne passe pas avant que tu aies écrit une ligne, arrête-toi et signale : le
paquet est censé être sain à la livraison.

**`build.py` et son `CATALOGUE` sont la source de vérité.** Le manifeste servi au web
(`manifeste.json`) en est dérivé, jamais l'inverse. Un nouveau document s'ajoute dans le
`CATALOGUE`, pas dans le front.

---

## Livrable 1 — Pose automatique du logo

### Attendu

Le client téléverse son logo une fois. Le système produit les documents qui le portent, en cache
le résultat, et les met à disposition en téléchargement.

### Ce que la chaîne fait déjà

`build.py client NOM --logo fichier.png` produit toutes les déclinaisons **et supprime de lui-même**
celles des documents qui ne doivent pas porter le logo. Tu n'as pas à réimplémenter cette logique :
appelle la commande, elle est déjà correcte.

L'emplacement est repéré **par nom**, jamais par coordonnées : `data-slot="logo-client"` dans les
gabarits HTML, forme nommée `LOGO_CLIENT` dans les PPTX. Ne repositionne rien en dur.

### Contrainte à ne pas contourner

Neuf documents portent le logo, six ne le portent pas. Ce n'est pas un choix graphique : le kit
collaborateur promet aux salariés que « l'employeur n'a accès à aucune information médicale
individuelle ». Marquer un compte-rendu médical du logo de l'employeur contredit cette promesse.

Le champ `logo_client` du catalogue tranche pour chaque document. **Ne l'écrase pas depuis
l'interface**, ne propose pas de case à cocher « appliquer partout ».

### Validation

Le logo fourni peut être de n'importe quel rapport d'aspect. Vérifie :

- fond transparent, sinon un carré blanc apparaîtra sur le crème ;
- hauteur ≥ 200 px, sinon l'impression A2 sera floue ;
- après génération, qu'aucun texte ne chevauche le logo.

---

## Livrable 2 — Plateforme web

### Trois niveaux d'accès

| Niveau | Documents | Accès |
|---|---|---|
| `public` | affiches, kit collaborateur, notice d'information | lien direct, sans authentification |
| `client` | mode d'emploi RH, recueil des e-mails, formulaire à imprimer, correspondants | espace client authentifié |
| `hds` | comptes-rendus, lettres d'adressage | **jamais sur cette plateforme** |

Le niveau `hds` désigne des données de santé à caractère personnel. Ces documents transitent par
la plateforme de téléexpertise certifiée hébergeur de données de santé, pas par un site vitrine
ni par un espace client classique. Ils figurent dans le paquet à titre de gabarits, avec un jeu de
données fictif. **Si une évolution te demande de les exposer, refuse et remonte-le.**

### Fonctionnalités

- **Bibliothèque filtrable** par niveau d'accès, par phase de campagne (`cadrage`, `annonce`,
  `relance`, `preparation`, `jour-j`, `bilan`) et par format.
- **Aperçu en ligne** de chaque PDF, sans téléchargement préalable.
- **Téléversement du logo**, puis génération à la demande. Mets en cache par couple
  (document, empreinte du logo) : ne régénère pas à chaque affichage.
- **Les e-mails ne sont pas un PDF.** Sers-les depuis `scripts/gabarits/emails.json` : objet et
  corps en texte, champs `{{date}}`, `{{lieu}}`, `{{lien}}`, `{{entreprise}}` substitués côté
  client par un petit formulaire, et un bouton « copier ». Le PDF n'est qu'une vue imprimable de
  ce même JSON. Douze e-mails, trois séquences, quatre options chacune.
- **Versionnage.** Chaque document porte son millésime en pied de page. Un client qui a imprimé
  deux cents affiches doit pouvoir retrouver sa version exacte.

### À ne pas faire

- N'expose ni `scripts/gabarits/` ni `documents/_sources/` : ces HTML embarquent les polices en base64 et pèsent lourd.
- Ne place aucun traceur analytique sur les pages servant des documents médicaux.
- Ne réécris pas les PDF côté serveur pour y insérer un logo : passe par les générateurs, sinon
  tu perdras les polices embarquées, le fond perdu et les traits de coupe des affiches.

---

## Ce que tu ne dois pas modifier

1. **Le texte des deux documents de consentement.** Contenu juridique validé. La mise en page se
   régénère, le texte non. Aucune reformulation, aucune mention retirée, aucune durée de
   conservation changée.
2. **La règle logo client du catalogue** (voir plus haut).
3. **Les couleurs de charte pour du texte sur fond crème.** Le cyan donne 2,5:1 et l'orange 2,6:1,
   sous le seuil d'accessibilité de 3:1 même pour du très grand texte. Ils sont réservés aux fonds
   sombres, aux logos et aux éléments graphiques. Si tu ajoutes une interface, applique la même
   règle.

---

## Anomalies connues, à remonter et non à corriger en silence

1. **Résolution des affiches.** Quatre photos sur cinq font 1024 × 1536 px, soit **62 dpi en A2**,
   contre 150 à 300 attendus. Les originaux haute définition sont à récupérer, ou le format doit
   descendre en A3 voire A4.
2. **Faute dans la planche ABCDE.** L'image porte « BORDS IRRÉGULIÉS ». C'est gravé dans le
   fichier ; la légende à côté est correcte. La planche est à refaire.
3. **Modèle de données des comptes-rendus.** Un seul champ « Avis » et un seul champ
   « Recommandation » pour tout le dossier, quel que soit le nombre de zones documentées. Un
   compte-rendu où une seule lésion sur deux est suspecte devient ambigu. À corriger côté
   plateforme de téléexpertise : rattacher l'avis à la zone.
4. **Doublon de schéma.** Les champs « Antécédents de cancers cutanés connus » et « Antécédents de
   cancers cutanés » coexistent et se contredisent.
5. **Signature électronique.** Comptes-rendus et lettre d'adressage portent un cadre « signature à
   apposer ». La plateforme doit la générer à la clôture du dossier. Ne recopie jamais l'image
   d'une signature figurant sur un document antérieur.

---

## Critères de recette

- [ ] `python3 build.py controles` passe sur une machine vierge, après installation des dépendances.
- [ ] Le téléversement d'un logo produit les neuf documents concernés, et **uniquement** ceux-là.
- [ ] Aucun document de niveau `hds` n'est atteignable depuis le web, y compris par URL directe.
- [ ] Les e-mails sont servis en texte copiable, pas en PDF.
- [ ] Les affiches téléchargées conservent leur fond perdu de 3 mm et leurs traits de coupe.
- [ ] Un logo au rapport d'aspect extrême (4:1, 1:3) s'inscrit sans déformation ni chevauchement.
