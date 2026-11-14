# Réseau d'aval — Lot 0 : note de constat

Exploration des données open data sur un département test. Réf. : « Brief : prospection du
réseau d'aval, département par département » (14 novembre 2026), sections 4 et 10.
Note du 14 novembre 2026. Aucun code de production n'accompagne ce lot.

**Département test : Isère (38).** Taille moyenne, un CHU, et Grenoble est déjà présent dans
les données du hub.

**Méthode.** Les fichiers ont été interrogés par l'API tabulaire de data.gouv.fr, sans
téléchargement (le réseau de l'environnement de développement bloque data.gouv.fr en
direct). Comptages par filtre et par pagination. L'API a été instable (erreurs 502,
délais) : plusieurs appels ont été relancés. Les chiffres ci-dessous sont des comptages
réels ; les valeurs approchées sont signalées.

---

## 1. Avant tout : trois écarts avec le brief

### 1.1 Implantation : le schéma `prospection` n'existe pas

Le brief suppose un schéma `prospection` (tables `compte`, `contact`, `interaction`,
`relance`, `import`, `exclusion`) dans le projet Supabase vitrine. Rien de tel dans le
dépôt. **Décision prise avec Arthur le 14/11 : étendre l'existant.**

L'existant, dans le projet Supabase **admin** (`wtovhzxymlqnfxyjxrdq`) :

| Élément | Ce qu'il fait déjà | Ce qui manque pour le réseau d'aval |
|---|---|---|
| `admin_network_contacts` | Liste des contacts, `type`/`types` dont `Réseau d'Aval`, `statut` (`Accepté`, `En attente`, `Refusé`), `rpps`, `specialite`, `savoir_faire[]`, `activites` (jsonb), `lat`/`lng`, `source` (`manuel`, `annuaire_sante`) | `rpps` n'est pas unique (index simple) ; pas de population, de rôles, d'état réseau, de secteur conventionnel ; un seul lieu par contact |
| Écran Professionnels de Santé › Réseau Aval | Liste, carte, fiche, « Nouveau contact » | Rien sur la recherche par département |
| Edge Function `annuaire-sante` | Recherche FHIR ANS par nom ou par RPPS, détail des exercices | Pas de recherche par département et spécialité (elle n'est pas faite pour) |
| Table d'exclusion | — | **Absente.** À créer au lot 1 (règle 5 du brief) |
| Journal d'audit (`0019_audit_log`) | Trace les modifications de `admin_network_contacts` | — |

Conséquence : un médecin retenu devient un contact ordinaire de `admin_network_contacts`,
avec le type `Réseau d'Aval`. Il rejoint la liste existante, sans doublon grâce au RPPS.
Le pipeline (département, signaux, score, accord) vit dans des tables à côté.

Le projet admin n'est pas le projet HDS ; le module reste hors périmètre HDS.

### 1.2 Le fichier Ameli n'a pas de RPPS

Le brief fait du RPPS la clé de jointure entre l'Annuaire Santé et l'annuaire Ameli. **Le
fichier PS Ameli ne contient ni RPPS, ni ADELI, ni FINESS** pour les praticiens. Voir §5.

### 1.3 Le département n'est pas renseigné dans le RPPS

Les colonnes « Code Département (structure) » et « Libellé Département (structure) » du
fichier `personne-activite` sont **vides sur tout le fichier**. Le département se déduit du
lieu d'exercice : code commune INSEE de préférence (il gère la Corse 2A/2B et les DOM),
sinon code postal (attention aux CEDEX).

Ici, l'Isère est définie par un code postal commençant par 38.

Autres corrections mineures :
- l'extraction RPPS est mise à jour **chaque jour**, pas chaque semaine ; Ameli l'est
  environ chaque semaine (dernier fichier : 9 novembre) ;
- les documents cités en tête du brief (`SPEC-refonte-CLAUDE.md`, `REGLES-AvisDoc.md`) ne
  sont pas dans le dépôt.

---

## 2. Sources retenues

| Source | Fichier | Taille | Lignes | Mise à jour |
|---|---|---|---|---|
| ANS, Annuaire Santé (RPPS) | `ps-libreacces-personne-activite` | 793 Mo | 2 316 484 | quotidienne |
| | `ps-libreacces-savoirfaire` | 54 Mo | 468 229 | quotidienne |
| | `ps-libreacces-dipl-autexerc` | 267 Mo | 2 260 055 | quotidienne |
| Cnam, Annuaire santé Ameli | Liste PS | 149 Mo | 559 982 | ~hebdomadaire |
| | Liste CDS (centres de santé) | 3 Mo | 15 947 | ~hebdomadaire |
| Cnam (niveau 2) | Professionnels de santé libéraux : effectif et densité par territoire | — | — | annuelle |
| Drees (niveau 2) | La démographie des professionnels de santé depuis 2012 | — | — | annuelle |

Toutes sous Licence Ouverte. Les fichiers RPPS sont des textes délimités ; une ligne de
`personne-activite` correspond à un praticien × un savoir-faire × une activité. Un même
praticien a donc plusieurs lignes.

Les deux jeux du niveau 2 sont repérés, mais pas encore explorés.

---

## 3. Point 1 — Codes de spécialité

### RPPS (type `S`, spécialité ordinale)

| Population | Code | Libellé RPPS | Lignes nationales |
|---|---|---|---|
| `DERM` | **SM15** | Dermatologie et vénéréologie | 5 795 |
| `ORL` | **SM34** | O.R.L et chirurgie cervico faciale | 1 567 |
| | **SM39** | Oto-rhino-laryngologie (ancien intitulé) | 2 862 |
| | SM86 | ORL – chir. cervico-faciale, option audiophonologie | ~13 |
| `PLAST` | **SM10** | Chirurgie plastique reconstructrice et esthétique | 1 419 |
| `CHIR` | **SM05** | Chirurgie générale | 4 096 |
| (à trancher) | SM14 | Chirurgie viscérale et digestive | 1 960 |
| `MG_DERM` (base) | SM26 | Qualifié en médecine générale | 53 741 |
| | SM53 | Spécialiste en médecine générale | 90 727 |
| | SM54 | Médecine générale | ~8 827 |

Il existe aussi des savoir-faire d'autres types, non qualifiants : C15 « Dermato-vénéréologie »
(compétence, 38 lignes), DSM211 « Dermatopathologie » (DESC non qualifiant, 8 lignes),
C09 (compétence en chirurgie plastique). **Aucun savoir-faire « dermoscopie » ni
« dermatologie esthétique ».**

Douze types de savoir-faire existent (S, C, CAPA, CEX, CM, DEC, DNQ, FQ, OP, PAC, SH, SST).
Le filtre du module porte sur le type `S`.

**Proposition de filtre `ORL` : SM34 + SM39 + SM86.** Aucun praticien isérois ne cumule
SM34 et SM39 : ce sont deux générations de qualification, il faut les deux.

**À trancher par AvisDoc : SM14 dans `CHIR` ?** Les chirurgiens viscéraux font peu
d'exérèse cutanée. Proposition : les exclure du filtre par défaut, mais les garder
importables à la demande.

### Ameli (`specialite_code`)

| Population | Code | Libellé Ameli | Lignes nationales |
|---|---|---|---|
| `DERM` | **05** | Dermatologue et vénérologue | 2 978 |
| `ORL` | **11** | Oto-Rhino-Laryngologue (ORL) et chirurgien cervico-facial | 3 253 |
| `PLAST` | **46** | Chirurgien plasticien | 2 249 |
| `CHIR` | **04** | Chirurgien général | 1 786 |
| (à trancher) | 49 | Chirurgien viscéral | 1 496 |

---

## 4. Point 2 — DU et DIU : `MG_DERM` n'est pas détectable par l'open data

Le fichier `dipl-autexerc` contient bien un type `DU` (« Diplôme d'Université ou diplôme
inter universit. ») : **59 547 lignes**. Mais le libellé recherché n'existe pas :

| Recherche dans les libellés de diplôme | Lignes |
|---|---|
| « dermoscop » | **0** |
| « cutan » | 0 |
| tout libellé contenant « ermato » | 5 440, détaillées ci-dessous |

| Code | Type | Libellé | Lignes |
|---|---|---|---|
| DSM14 | DES | DES Dermatologie et vénéréologie | 2 785 |
| CESM06 | CES | CES Dermato-vénéréologie | 2 211 |
| DIP115 | DEES | DEES Dermato-vénéréologie | 258 |
| DIP180 | DU | DIU Dermato esthétique, lasers dermato, cosmétologie | 112 |
| DIP48 | DU | D.I.U Dermatologie esthétique et cosmétologie | 64 |
| DSM211 | DESC1 | Dermatopathologie | 10 |

Ameli ne mentionne aucune orientation dermatologique non plus : le champ « activité
particulière » ne porte que des modes d'exercice de MG (acupuncture, homéopathie,
allergologie, angiologie, médecine du sport…).

**Décision proposée sur `MG_DERM` :** pas d'import automatique. Ils entrent uniquement par
le niveau 3, par ajout manuel du RPPS, avec contrôle d'existence et d'appartenance à la
médecine générale (SM26, SM53, SM54). C'est la voie que le brief prévoyait en repli.

Les DIU de dermatologie esthétique (DIP48, DIP180) sont, eux, repérables par le RPPS.
C'est une **information pour l'opérateur** (« orientation esthétique possible ») à afficher
sur la fiche. Ce n'est pas un critère éliminatoire : un DIU ne dit pas que l'activité est
esthétique dominante. Jointure non testée sur un échantillon.

---

## 5. Point 3 — Ce que contient vraiment le fichier PS Ameli

Colonnes : nom, prénom, civilité, raison sociale, carte Vitale, appli carte Vitale (APCV),
spécialité, activité particulière, type de PS, téléphone, adresse (voie, complément,
lieu-dit, code postal, ville), option tarifaire, secteur conventionnel, nature d'exercice.

| Ce que le brief espérait | Présent ? |
|---|---|
| Secteur conventionnel | **Oui** : 0 non conventionné, 1 secteur 1, 2 dépassement permanent, 3 secteur 2 |
| Option tarifaire | **Oui** : OPTAM, OPTAM-ACO |
| Nature d'exercice | **Oui** : libéral intégral, libéral + salarié, temps partiel ou plein hospitalier |
| Carte Vitale | **Oui** (et APCV) |
| Téléphone | **Oui** (renseigné pour 31 dermatologues isérois sur 55) |
| Honoraires (montants) | **Non** |
| Actes pratiqués | **Non** |
| Délais | **Non** |
| RPPS ou autre identifiant du praticien | **Non** |

Le descriptif PDF fourni avec le jeu n'a pas pu être lu depuis l'environnement de
développement. À relire au lot 1 pour confirmer les libellés.

### Jointure RPPS ↔ Ameli

Test sur les dermatologues isérois : 44 noms Ameli face à 64 praticiens RPPS.

| Résultat | Nombre |
|---|---|
| Nom et prénom identiques après normalisation (accents, tirets, casse) | 41 sur 44 (~93 %) |
| Triplets nom + prénom + code postal concordants | 50 sur 54 |
| Rattrapables par rapprochement approché (nom d'usage tronqué, prénom composé) | 2 de plus (~98 %) |
| Praticiens RPPS absents d'Ameli | 23 sur 64, surtout des salariés hospitaliers |

Exemples d'écarts : PERRILLAT (Ameli) contre PERRILLAT-AMEDE (RPPS) ; LUCAS MOULLEC contre
LUCAS ; BRUN LEVEQUE contre BRUN-LÉVÊQUE.

**Proposition :**
- le RPPS est la base et la seule clé du praticien ;
- Ameli n'est qu'un **enrichissement** (secteur, option tarifaire, téléphone), rapproché
  par nom normalisé + prénom + code postal ;
- correspondance unique et exacte : appliquée et marquée « rapprochement automatique » ;
- sinon : proposée à l'opérateur, qui confirme ;
- l'absence d'Ameli n'est pas pénalisante (un hospitalier n'y figure pas, et son secteur
  vaut alors « sans objet »).

---

## 6. Point 4 — MSSanté et e-mails

- L'extraction des boîtes MSSanté est réservée aux opérateurs de l'espace de confiance
  (confirmé sur data.gouv.fr). Hors d'atteinte.
- **Le RPPS ne donne aucun e-mail** : 0 sur 81 lignes pour les dermatologues isérois.
- Le premier contact passera donc par le **téléphone** (RPPS : 40 dermatologues sur 64 en
  ont au moins un ; Ameli en complète une partie) ou par courrier au lieu d'exercice.
  Le canal de la lettre d'adressage se recueille au niveau 4.

---

## 7. Volumes en Isère

RPPS, `personne-activite`, code postal d'exercice commençant par 38, praticiens distincts.

| Population | Codes | Praticiens | dont libéraux | dont salariés | Ameli (lignes / noms) |
|---|---|---|---|---|---|
| `DERM` | SM15 | **64** | 44 | 24 | 55 / 44 |
| `ORL` | SM34 + SM39 | **37** | 28 | 15 | 48 / 29 |
| `PLAST` | SM10 | **24** | 20 | 8 | 39 / 20 |
| `CHIR` | SM05 | **42** | 28 | 17 | 46 / 24 |
| (à trancher) | SM14 | 40 | 17 | 27 | non compté |
| `MG_DERM` | — | **non détectable** | | | |
| MG (pour mémoire) | SM53 / SM26 / SM54 | ≥ 2 129 lignes (SM53 1 652, SM26 477, SM54 non obtenu) | | | |

Les colonnes « libéraux » et « salariés » se recoupent : 4 dermatologues exercent des deux
façons. Les praticiens sans activité déclarée (pas de lieu d'exercice) sont exclus.

**Total sans `MG_DERM` : 167 praticiens** (207 avec la chirurgie viscérale). L'ordre de
grandeur d'un département moyen est donc **150 à 250 fiches**, ce qui se qualifie à la main
en quelques semaines.

Détail utile pour les dermatologues isérois :
- **Lieu d'exercice** (lignes) : établissement public de santé 25, exercice en société 17,
  cabinet individuel 17, cabinet de groupe 15, établissement privé PSPH 6, autre 1.
- **Secteur** (Ameli, 55 lignes) : secteur 2 41, secteur 1 13, non conventionné 1 ;
  OPTAM 1.
- **Chirurgiens** : plasticiens 38 sur 39 en secteur 2 ; généraux 46 sur 46 en secteur 2,
  dont 25 en OPTAM-ACO.
- **Centres de santé** : 155 lignes Ameli CDS, environ 63 centres distincts, un seul avec un
  dermatologue (Échirolles).

L'orientation esthétique n'apparaît que dans le texte libre (une raison sociale
« Centre dermatologique esthétique & laser… »). Elle reste un signal du niveau 3, lu par un
opérateur.

---

## 7 bis. L'API FHIR de l'Annuaire Santé ne remplace pas les fichiers

Testée le 14/11 avec la clé ANS (`gateway.api.esante.gouv.fr/fhir/v2`) :

- La fiche d'un praticien porte bien les codes du §3. Exemple : RPPS 10003097440 → `SM15`,
  `DSM14`, profession `10`.
- `Practitioner?qualification-code=SM15` renvoie **5 800 praticiens** en France. C'est
  cohérent avec les 5 795 lignes SM15 du fichier `savoirfaire`.
- En revanche, **aucune recherche par lieu n'est possible sur le praticien**. Seule
  `Organization` accepte un code postal. `PractitionerRole` ne se filtre que par structure
  ou par praticien, pas par spécialité.
- Pour monter la liste d'un département, il faudrait enchaîner trois requêtes : les
  structures par code postal (1 971 pour le seul 38000), puis leurs exercices, puis les
  praticiens. Cela fait des milliers d'appels par département.

**Conséquence :** l'import d'un département se fait par les fichiers d'extraction. L'API
sert à l'unité : ajout manuel par RPPS, rafraîchissement d'une fiche, contrôle
d'existence.

---

## 8. Conséquences pour le lot 1

1. **Import.** Lecture en flux du fichier `personne-activite`. Filtre : profession 10,
   type S, codes du §3, département du lieu d'exercice. On ne garde que les lignes utiles,
   jamais le fichier. Aucun fichier dans le dépôt.
2. **Unicité.** Contrainte unique sur le RPPS dans `admin_network_contacts`. Il faut
   d'abord dédoublonner les contacts existants : un index unique échoue s'il reste des
   doublons. Script de contrôle à prévoir.
3. **Plusieurs lieux d'exercice.** Une table de lieux praticien × département (relation
   plusieurs à plusieurs). Le champ `activites` (jsonb) reste l'affichage brut.
4. **Exclusion.** Une table `admin_reseau_exclusions` keyée par RPPS, consultée par l'import
   avant toute création. Elle n'existe pas aujourd'hui.
5. **Fraîcheur.** Chaque fiche porte la date de l'extraction RPPS et celle d'Ameli ; elles
   sont marquées périmées au-delà de 90 jours.
6. **Fonction `annuaire-sante`.** Réutilisée pour l'ajout manuel par RPPS (niveau 3) et le
   rafraîchissement d'une fiche à l'unité. Sa clé ANS (`ANNUAIRE_SANTE_API_KEY`) est un
   secret du projet admin, qui ne se relit pas dans Supabase. Arthur en détient la valeur
   (14/11) : la consigner dans le gestionnaire de mots de passe d'AvisDoc.
7. **Statuts.** Le `statut` actuel (`Accepté`, `En attente`, `Refusé`) ne couvre pas les dix
   états du brief. Proposition : un champ `etat_reseau` distinct. `statut` reste dérivé
   pour la liste existante (`accord` → Accepté, `refus` ou `exclu` → Refusé, le reste → En
   attente) ; seule une fonction serveur l'écrit.

---

## 9. Questions pour AvisDoc

Celles du brief (§12) restent ouvertes. S'y ajoutent :

1. La chirurgie viscérale et digestive (SM14 / Ameli 49) entre-t-elle dans `CHIR` ?
2. Les praticiens hospitaliers sont-ils dans le périmètre dès le lot 1 ? En Isère, c'est
   plus d'un tiers des dermatologues, et ils ne figurent pas dans Ameli.
3. `MG_DERM` en saisie manuelle uniquement : validé ?
4. Le DIU de dermatologie esthétique affiché comme information sur la fiche, sans effet
   sur le score : validé ?
5. Département suivant à ouvrir après l'Isère.
