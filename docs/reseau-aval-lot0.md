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

## Décisions d'AvisDoc (14 novembre 2026, Arthur)

Elles priment sur les propositions du reste de la note.

| Sujet | Décision |
|---|---|
| Implantation | Étendre l'existant : `admin_network_contacts`, projet admin |
| Annuaire Ameli | **Non utilisé.** Le module repose sur le seul RPPS |
| E-mails | **Non collectés** |
| Empreinte web (niveau 3) | **Uniquement les informations de la fiche Google Maps** du praticien |
| Chirurgie viscérale (SM14) | **Hors périmètre.** `CHIR` = SM05 seul |
| Praticiens hospitaliers | **Dans le périmètre dès le lot 1** |
| `MG_DERM` | **Ajout manuel par RPPS uniquement**, pas d'import |
| Ordre des départements | Choisi dans la plateforme par l'administrateur (conforme au brief, §3) |
| Lecture de la fiche Google Maps | **Par l'API Google Places**, affichage en direct. La règle 2 du brief est levée pour Google Maps, et pour lui seul |
| DIU de dermatologie esthétique | **Affiché comme information** sur la fiche, sans effet sur le score |
| Sources | **Toute information affichée ou enregistrée porte son lien source.** Rien n'est inventé ni déduit : seule une information vérifiée et validée par un opérateur est retenue (§6) |
| Score | **Probabilité d'adhésion au réseau**, explicable et calibrée sur les issues réelles (§8 bis) ; pondérations a priori à trancher plus tard |
| Clé Google serveur | **Oui**, AvisDoc crée une seconde clé, réservée au serveur, avec l'API Places |
| Autres signaux du niveau 3 | **Recherche assistée par IA**, lancée une fois le praticien identifié, propositions validées par un opérateur (§6) |

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
*Sans objet depuis la décision de ne pas utiliser Ameli.*

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

**SM14 (chirurgie viscérale et digestive) : exclue** (décision du 14/11). `CHIR` = SM05.

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

> **Ameli n'est pas utilisé** (décision du 14/11). Ce constat reste pour mémoire. Le
> secteur conventionnel, que seul Ameli fournissait, sort donc du score (§8.8).

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

Sans clé commune, Ameli aurait demandé un rapprochement approché confirmé à la main.
Avec le RPPS seul, la question disparaît : **le RPPS est la seule clé du praticien.**

---

## 6. Point 4 — MSSanté, e-mails et Google Maps

- L'extraction des boîtes MSSanté est réservée aux opérateurs de l'espace de confiance
  (confirmé sur data.gouv.fr). Hors d'atteinte.
- **Le RPPS ne donne aucun e-mail** : 0 sur 81 lignes pour les dermatologues isérois. Les
  e-mails ne sont de toute façon pas collectés (décision du 14/11).
- Le premier contact passera donc par le **téléphone** ou par courrier au lieu d'exercice.
  Le RPPS donne un téléphone pour 40 dermatologues sur 64 ; la fiche Google Maps complète.
  Le canal de la lettre d'adressage se recueille au niveau 4.

### Google Maps, seule source du niveau 3

La grille du brief se réduit aux signaux lisibles sur une fiche Google Maps :

| Signal | Lu sur la fiche |
|---|---|
| Fiche trouvée | lien de la fiche, ou « aucune fiche » (non pénalisant) |
| Téléphone, site web, horaires | coordonnées de la fiche |
| Catégorie affichée | « dermatologue », « centre de médecine esthétique »… → orientation de l'activité |
| Plaintes répétées sur les délais | avis : valeur oui, non ou inconnu, **jamais de verbatim** (règle 3) |
| Établissement fermé définitivement | mention de la fiche → signal de départ |

Les autres signaux du brief (motif « exérèse », nouveaux patients, dermoscopie, circuit
rapide, prévention, DU, recherche de successeur) ne sont pas sur la fiche Google Maps. Ce
sont pourtant les plus informatifs sur la volonté. Ils passent par une **recherche
assistée par IA**, voir plus bas, et sont confirmés au contact du niveau 4.

**Lecture par l'API Google Places** (décision du 14/11). La règle 2 du brief est levée
pour Google Maps seulement ; Doctolib et LinkedIn restent exclus.

Ce que cela implique, conditions de Google Maps Platform comprises :

1. **Rattachement.** Une recherche textuelle Places (nom, spécialité, ville du lieu
   d'exercice RPPS) propose des fiches candidates. **Un opérateur confirme la bonne**, ou
   indique « aucune fiche ». Pas de rattachement automatique : les homonymes et les fiches
   de cabinets de groupe sont fréquents.
2. **Stockage.** On ne conserve que l'identifiant `place_id`, avec la date et l'auteur du
   rattachement. Google autorise à garder cet identifiant ; il recommande de le
   rafraîchir s'il a plus de douze mois. Aucun contenu de fiche n'est stocké : ni
   téléphone, ni horaires, ni note, ni avis.
3. **Affichage.** À l'ouverture de la fiche praticien, une fonction serveur appelle Place
   Details et renvoie les champs à afficher. Rien n'est écrit en base. L'attribution
   Google est affichée, comme l'exigent les conditions.
4. **Signaux.** Un signal ne peut pas recopier le contenu Google ; il reste une
   **appréciation de l'opérateur**. L'opérateur lit les informations affichées et
   enregistre la valeur (orientation, plaintes sur les délais, fermeture), avec l'URL de la
   fiche et la date. Le statut « fermé définitivement » peut être signalé à l'écran sans
   saisie, mais il n'est pas conservé.
5. **Coût.** Voir l'estimation ci-dessous.
6. **Clé.** La clé du projet (`GOOGLE_MAPS_KEY`, Edge Function `maps-cle`) est une clé de
   navigateur, à restreindre au référent `admin.avisdoc.fr`. Les appels Places se font côté
   serveur : il faut une **seconde clé, réservée au serveur**, avec l'API Places (New)
   activée. Secret proposé : `GOOGLE_PLACES_KEY`. AvisDoc peut la créer (confirmé le 14/11).

#### Estimation du coût de l'API Places

Grille publique de Google Maps Platform, relevée le 14/11/2026, en dollars, au premier
palier :

| Appel | Usage dans le module | Gratuit par mois | Ensuite, pour 1 000 appels |
|---|---|---|---|
| Text Search Enterprise | proposer des fiches candidates au rattachement | 1 000 | 35 $ |
| Place Details Enterprise | afficher téléphone, site, horaires, note | 1 000 | 20 $ |
| Place Details Enterprise + Atmosphere | idem, avec les avis | 1 000 | 25 $ |

Un appel est facturé au tarif du champ le plus cher qu'il demande : le masque de champs
décide du prix.

Hypothèses par département (Isère : 167 praticiens) :
- **Rattachement** : environ 2 recherches par praticien, soit ~330 appels.
- **Consultation** : la fiche est ouverte environ 5 fois pendant la qualification, soit
  ~840 appels Place Details.
- Total : **~1 200 appels par département**.

| Rythme | Coût mensuel estimé |
|---|---|
| 1 département par mois | **~0 $** (sous les quotas gratuits) |
| 3 départements par mois | **~20 à 40 $** |
| Sans aucun quota gratuit, par département | ~35 $ au plus |

Deux réglages pour rester bas :
- **Les avis à la demande** : la fiche charge les informations sans les avis (20 $), et un
  bouton « Voir les avis » les charge au tarif Atmosphere (25 $).
- **Un appel par ouverture** : on ne recharge pas tant que la fiche reste ouverte. Les
  conditions interdisent de stocker le contenu, pas de le garder à l'écran.

**Plafond proposé : 50 € par mois**, avec des alertes de budget à 50 % et 90 % dans la
console Google Cloud. On ajoute un quota de 300 appels Place Details par jour sur la clé
serveur. Si le quota est atteint, la fiche affiche « Informations Google indisponibles
aujourd'hui (quota atteint) » au lieu d'échouer en silence. À ajuster après le premier
mois réel.

Sources :
[grille tarifaire Google Maps Platform](https://developers.google.com/maps/billing-and-pricing/pricing),
[facturation de l'API Places (New)](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing).

### Recherche assistée par IA, une fois le praticien identifié

Proposition d'Arthur (14/11) : plutôt que d'extraire des pages web, lancer une recherche
par IA, **une fois le praticien bien identifié**, pour les signaux que Google Maps ne donne
pas.

**Déclenchement.** Le praticien doit avoir un RPPS (identité certaine) et une fiche Google
Maps confirmée, ou « aucune fiche » confirmé. L'opérateur lance la recherche par un bouton
sur la fiche praticien. Elle n'est jamais lancée en masse ni à l'import, ce qui borne le
coût et le volume de données traitées.

**Ce qu'on envoie à l'IA.** Uniquement des données professionnelles publiques : nom et
prénom d'exercice, RPPS, spécialité, lieu d'exercice (raison sociale, adresse), site web de
la fiche Google s'il existe. Aucune donnée de patient, aucune donnée d'AvisDoc.

**Ce que l'IA renvoie.** Une Edge Function appelle l'API Claude avec son outil de
recherche web. Pour chaque signal de la grille, la réponse suit un format fixe :

| Champ | Contenu |
|---|---|
| `type` | un des signaux du brief : motif exérèse, nouveaux patients, dermoscopie, chirurgie sur place, circuit rapide, prévention, DU/DIU, recherche de successeur, orientation de l'activité |
| `valeur` | oui, non ou inconnu (les valeurs du brief) |
| `url` | la page qui justifie la valeur ; obligatoire |
| `extrait` | la phrase exacte de cette page qui justifie la valeur ; obligatoire |

**Rien n'est inventé : trois contrôles successifs.**
1. **Contrôle automatique de la source.** La fonction serveur charge la page citée et
   vérifie que l'extrait y figure mot pour mot (après normalisation des espaces et de la
   casse). Lien absent, page inaccessible ou extrait introuvable : la proposition est
   **écartée d'office** et le signal reste `inconnu`. Une IA peut se tromper ou inventer ;
   ce contrôle élimine toute valeur qui ne s'appuie pas sur une page réelle.
2. **Pas de déduction.** La consigne donnée à l'IA : ne répondre « oui » ou « non » que si
   la page le dit explicitement. Une absence d'information donne `inconnu`, jamais « non ».
   Un silence n'est pas une preuve.
3. **Validation humaine obligatoire.** Les signaux proposés s'affichent sur
   la fiche avec leur lien et leur extrait. L'opérateur ouvre le lien, accepte ou rejette
   chacun d'eux. S'il corrige une valeur, il doit fournir sa propre URL. Un signal accepté est enregistré comme « proposé par l'IA, validé par [opérateur] »,
   avec la date. La traçabilité de l'IA est ainsi conservée sans qu'elle écrive elle-même.
4. **Domaines exclus de la recherche** : `doctolib.fr`, `linkedin.com` et les sites d'avis.
   L'outil de recherche permet une liste de domaines bloqués. La règle 2 du brief reste
   donc vraie pour eux ; Google passe par l'API Places.
5. **Ce qui est stocké** : `type`, `valeur`, `url`, date, auteur de la validation, et la
   mention « proposé par l'IA ». L'extrait sert au contrôle et à l'opérateur ; il n'est
   pas conservé, conformément à la règle 3 du brief. La réponse brute de l'IA n'est pas
   conservée non plus.
6. **`inconnu` reste la valeur par défaut** et ne pénalise pas. Un signal sans URL est
   refusé par la base (contrainte `not null`, recette n° 4 du brief).
7. **Le score n'utilise que les signaux validés.** Une proposition en attente n'a aucun
   effet, ni sur le score, ni sur l'export.

### Une source pour chaque information

La règle vaut pour toute la fiche praticien, pas seulement pour l'IA :

| Information | Source affichée |
|---|---|
| Identité, spécialité, lieu d'exercice, téléphone RPPS | Fiche Annuaire Santé du RPPS, avec la date d'extraction |
| Informations Google Maps | Lien de la fiche Google Maps, rendu par l'API, et attribution Google |
| Signal du niveau 3 | URL de la page source, vérifiée puis validée |
| Échange du niveau 4 (délai, accord…) | Interaction tracée : date, canal, auteur |

Une information sans source ne s'affiche pas et ne s'enregistre pas.

**RGPD.** Anthropic devient sous-traitant pour ce traitement. Il faut l'inscrire dans la
fiche de registre (lot 1), avec les destinataires, et le mentionner dans l'information du
praticien au premier contact.

**Coût.** Un appel par recherche, plus les recherches web qu'il déclenche. Le coût est à
mesurer sur l'Isère au lot 2 (167 praticiens au plus).

---

## 7. Volumes en Isère

RPPS, `personne-activite`, code postal d'exercice commençant par 38, praticiens distincts.

| Population | Codes | Praticiens | dont libéraux | dont salariés |
|---|---|---|---|---|
| `DERM` | SM15 | **64** | 44 | 24 |
| `ORL` | SM34 + SM39 | **37** | 28 | 15 |
| `PLAST` | SM10 | **24** | 20 | 8 |
| `CHIR` | SM05 | **42** | 28 | 17 |
| `MG_DERM` | — | **ajout manuel** | | |
| *Exclus : chirurgie viscérale* | *SM14* | *40* | | |
| *MG, pour mémoire* | *SM53 / SM26 / SM54* | *≥ 2 129 lignes (SM53 1 652, SM26 477, SM54 non obtenu)* | | |

Les salariés, hospitaliers pour la plupart, sont dans le périmètre (décision du 14/11).

Les colonnes « libéraux » et « salariés » se recoupent : 4 dermatologues exercent des deux
façons. Les praticiens sans activité déclarée (pas de lieu d'exercice) sont exclus.

**Total sans `MG_DERM` : 167 praticiens.** L'ordre de
grandeur d'un département moyen est donc **150 à 250 fiches**, ce qui se qualifie à la main
en quelques semaines.

Détail utile pour les dermatologues isérois :
- **Lieu d'exercice** (lignes) : établissement public de santé 25, exercice en société 17,
  cabinet individuel 17, cabinet de groupe 15, établissement privé PSPH 6, autre 1.
- **Secteur** (Ameli, pour mémoire) : 41 dermatologues libéraux sur 55 en secteur 2.

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
5. **Fraîcheur.** Chaque fiche porte la date de l'extraction RPPS ; elle est marquée
   périmée au-delà de 90 jours.
6. **Fonction `annuaire-sante`.** Réutilisée pour l'ajout manuel par RPPS (niveau 3) et le
   rafraîchissement d'une fiche à l'unité. Sa clé ANS (`ANNUAIRE_SANTE_API_KEY`) est un
   secret du projet admin, qui ne se relit pas dans Supabase. Arthur en détient la valeur
   (14/11) : la consigner dans le gestionnaire de mots de passe d'AvisDoc.
7. **Statuts.** Le `statut` actuel (`Accepté`, `En attente`, `Refusé`) ne couvre pas les dix
   états du brief. Proposition : un champ `etat_reseau` distinct. `statut` reste dérivé
   pour la liste existante (`accord` → Accepté, `refus` ou `exclu` → Refusé, le reste → En
   attente) ; seule une fonction serveur l'écrit.
8. **Score (lot 2).** Le secteur conventionnel en sort, puisqu'il venait d'Ameli. Restent :
   délai déclaré, plateau technique (hospitalier ou établissement privé, lu dans le RPPS),
   proximité, signaux de volonté, signal de départ.
9. **Hospitaliers.** Ils sont importés comme les libéraux. Le lieu d'exercice et le
   standard viennent du RPPS (raison sociale, FINESS) ; le contact se fait par le service.
10. **Rien d'Ameli, rien d'e-mail** dans le modèle ni dans l'import.

---

## 8 bis. Score : probabilité qu'un praticien adhère au réseau

Demande d'Arthur (14/11) : à la fin, un score qui donne la **probabilité qu'un praticien
adhère au réseau d'aval**, c'est-à-dire qu'il passe à l'état `accord`. Le cadrage est
posé ici ; les pondérations sont à valider au lot 2, comme le prévoit le brief (§5).

### Ce que le score est, et ce qu'il n'est pas

- Il **estime une probabilité** (0 à 100 %) et **classe la file de contact**.
- Il **ne décide jamais** d'une entrée dans le réseau : seul un accord tracé y fait entrer
  (règle 6 du brief).
- Il n'utilise **que des informations sourcées et validées** (§6). Un signal en attente
  de validation ou `inconnu` ne compte pas : il ne pénalise pas, il ne favorise pas.

### Le calcul : une régression logistique, lisible à la main

Le score est une **somme de contributions**, transformée en probabilité :

```
z = base + Σ contributions des informations connues
probabilité = 1 / (1 + e^(−z))
```

Une contribution positive augmente la probabilité, une contribution négative la diminue,
une information inconnue vaut 0. La fiche affiche la base, chaque contribution avec sa
source, la somme `z` et la probabilité : le calcul se refait à la main (recette n° 5 du
brief). Les pondérations sont dans un fichier de configuration versionné, et la fiche
indique la version utilisée.

Ce modèle a été choisi parce qu'il donne une vraie probabilité **et** reste explicable
terme à terme. Un modèle plus complexe (forêt, réseau de neurones) violerait la règle
« un score sans explication visible est un défaut ».

### Deux temps : estimation a priori, puis probabilité calibrée

**Au départ, aucune donnée réelle n'existe** : personne n'a encore accepté ni refusé. Le
pourcentage affiché est donc une **estimation a priori**, fondée sur des pondérations
proposées par AvisDoc. La fiche le dit en clair : « Estimation a priori, non calibrée ».

**Dès que les issues s'accumulent**, les pondérations sont réapprises sur les décisions
réelles :
- l'issue observée est `accord` (1) contre `refus` (0), après un contact effectif. Les
  `injoignable` sont comptés à part : ils mesurent la joignabilité, pas la volonté ;
- seuil proposé : **au moins 40 issues**, dont au moins 10 accords et 10 refus, tous
  départements confondus ;
- le réapprentissage est un script lancé à la main, pas un calcul automatique en
  production. Il produit une nouvelle version du fichier de pondérations, avec ses
  indicateurs de qualité : score de Brier, et courbe de calibration (sur 100 praticiens
  annoncés à 30 %, environ 30 adhèrent-ils vraiment ?) ;
- la nouvelle version n'entre en service qu'après validation par AvisDoc. La fiche
  affiche alors « Probabilité calibrée sur N issues, version X ».

### Variables proposées et pondérations a priori (à valider)

Base a priori : **taux d'adhésion attendu de 20 %** (z = −1,39). À valider par AvisDoc.

| Information | Source | Valeur | Contribution a priori |
|---|---|---|---|
| Nouveaux patients | IA validée ou contact | oui / sur courrier / non | +0,8 / +0,4 / −1,0 |
| Motif « lésion suspecte » ou « exérèse » proposé | IA validée | oui | +0,6 |
| Dermoscopie ou cartographie des nævus | IA validée | oui | +0,4 |
| Chirurgie cutanée sur place (rôle `exerese`) | IA validée | oui | +0,4 |
| Circuit rapide ou contact réservé aux médecins | IA validée | oui | +0,8 |
| Participation à des actions de prévention | IA validée | oui | +0,5 |
| Plaintes répétées sur les délais | fiche Google, lue et validée | oui | −0,6 |
| Orientation de l'activité | fiche Google ou IA validée | mixte | −0,3 |
| Signal de départ (successeur, fermeture) | IA ou fiche Google, validé | oui | −1,5 |
| A répondu au premier contact | interaction tracée | oui | +1,0 |
| Délai déclaré pour un patient adressé | contact (niveau 4) | ≤ 15 j / 16–45 j / > 45 j | +1,0 / +0,3 / −0,8 |
| Proximité | à définir (voir questions) | — | — |

**Critères éliminatoires** : la probabilité affichée est 0 %, avec le motif. Ce sont
l'opposition enregistrée, l'activité esthétique dominante et la cessation d'exercice.

**Exemple de lecture.** Dermatologue, nouveaux patients « oui », motif exérèse « oui »,
tout le reste inconnu : z = −1,39 + 0,8 + 0,6 = 0,01, soit une probabilité de **50 %**.

**Variables exclues volontairement** : sexe, âge, nom, origine du diplôme. Elles sont
discriminatoires ou sans lien avec la volonté. Aucune notion de rémunération ou de
contrepartie (règle 7). Le secteur conventionnel est absent, puisqu'Ameli n'est pas
utilisé.

### Conséquences pour les lots

- **Lot 2** : fonction pure de calcul, fichier de pondérations versionné, affichage du
  détail sur la fiche, tests qui recalculent des exemples à la main.
- **Lot 3** : enregistrement de l'issue (`accord`, `refus`, `injoignable`) avec la version
  du score au moment du contact. Sans cela, la calibration est impossible.
- **Après 40 issues** : premier réapprentissage, et note de calibration soumise à AvisDoc.

---

## 9. Questions encore ouvertes

Celles du brief (§12), hors la n° 4 tranchée le 14/11 (hospitaliers dans le périmètre),
restent ouvertes. S'y ajoutent :

1. Plafond Places : 50 € par mois proposé (§6). À confirmer.
2. Score : taux d'adhésion attendu de 20 % et pondérations a priori du §8 bis — **décision
   reportée** (14/11). À trancher avant le lot 2.
3. Score : la « proximité » se mesure par rapport à quoi ? Lieux des journées de
   dépistage, clients d'AvisDoc, centre du département ? Sans réponse, elle est retirée.
