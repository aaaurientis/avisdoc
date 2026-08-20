# Proposition d'intégration de la téléexpertise

Réponse au dossier de spécification de refonte (14 chapitres, 20 août 2026), rapportée à
l'existant décrit dans `docs/stack.md`. Le but est de dire **où atterrit chaque parcours**,
**ce qu'on réutilise**, **ce qu'on modifie dans la spec** et dans quel ordre livrer.

L'essence fonctionnelle du dossier est conservée intégralement : les 43 règles `RM-xx`, la
machine à états, le circuit patient et les décisions `D-01` à `D-12` ne sont pas discutés
ici. Ce document ne porte que sur l'**architecture d'accueil**.

---

## 1. La proposition en une page

```
                    ┌──────────────────── PLAN CRM (Supabase Cloud, existant) ───────────┐
                    │                                                                    │
  avisdoc.fr        │  admin.avisdoc.fr          client.avisdoc.fr        pro.avisdoc.fr │
  vitrine           │  back-office               espace entreprise        annuaire pro   │
                    │  + section Téléexpertise   + résultats agrégés                     │
                    │    (pilotage, métadonnées)   (jamais de donnée médicale)           │
                    │                                                                    │
                    │  admin_clients · admin_campagnes · admin_journees · admin_devis…    │
                    └───────────────────────────┬────────────────────────────────────────┘
                                                │  passerelle : identifiants opaques,
                                                │  compteurs, jamais un nom de patient
                    ┌───────────────────────────┴──────── PLAN SANTÉ (hébergeur HDS) ────┐
                    │                                                                    │
                    │  app.avisdoc.fr — le module de téléexpertise                        │
                    │  ├── requérant   (téléphone, hors ligne, PSC)                       │
                    │  └── expert      (ordinateur, PSC)                                  │
                    │                                                                    │
                    │  te_patient · te_demande · te_lesion · te_cliche · te_avis          │
                    │  te_compte_rendu · te_audit · service de génération documentaire    │
                    └────────────────────────────────────────────────────────────────────┘
```

Trois décisions structurent tout le reste :

**1. Le module vit dans un cinquième front, `app.avisdoc.fr`**, et non dans l'espace client
ni dans le back-office. Il porte **deux** parcours, requérant et expert, pas trois.

**2. Le parcours administrateur rejoint le back-office existant**, `admin.avisdoc.fr`, en
nouvelle section. C'est l'écart principal avec le chapitre `14-pile.md`, et il est motivé au
§ 3.

**3. L'architecture B du chapitre 14 est retenue** : le plan CRM reste où il est, le plan
santé part chez un hébergeur certifié HDS. La frontière est un contrat, pas une intention.

---

## 2. Pourquoi pas un seul front à trois rôles

La spec propose `teleexpertise.avisdoc.fr` avec trois arbres de routes. Trois objections,
dans l'ordre de gravité.

**L'administrateur n'est pas dans le même périmètre de données.** `RM-27` lui interdit
l'accès aux clichés et au texte des avis : il ne manipule que des métadonnées. Le mettre dans
le front qui charge les clichés, c'est mettre dans un même bundle, un même contexte de
session et un même modèle de sécurité deux profils que la conformité sépare. Le sortir, c'est
réduire la surface du périmètre HDS d'un tiers.

**L'administrateur travaille déjà ailleurs.** Il gère les clients, les contacts, les devis,
les campagnes et les journées dans `admin.avisdoc.fr`. Lui demander de piloter les
affectations dans une deuxième application, avec un deuxième SSO et une deuxième barre de
navigation, pour des objets qui référencent les clients de la première, c'est fabriquer la
duplication qu'on cherche à éviter (§ 5.1).

**Les deux authentifications ne sont pas les mêmes.** Requérant et expert entrent par
Pro Santé Connect. L'administrateur entre par le SSO Google `@avisdoc.fr`, comme aujourd'hui,
avec un second facteur. Un front, une authentification.

Ce que la spec voulait protéger en les réunissant — domaine partagé, composants partagés,
dictionnaire de libellés unique — est préservé : ces trois choses vivent dans
`src/teleexpertise/`, **importé par les deux fronts**. Le partage se fait au niveau du code,
pas au niveau du build.

---

## 3. Répartition des parcours

| Chapitre de la spec | Où il atterrit | Support | Authentification |
|---|---|---|---|
| `04-parcours-requerant.md` | `app.avisdoc.fr` | téléphone | Pro Santé Connect |
| `05-parcours-expert.md` | `app.avisdoc.fr` | ordinateur | Pro Santé Connect |
| `06-parcours-admin.md` | `admin.avisdoc.fr`, section « Téléexpertise » | ordinateur | SSO Google + 2FA |
| `07-circuit-patient.md` | aucun front, le patient ne se connecte pas | courriel | liens signés |
| — | `client.avisdoc.fr`, page « Résultats de campagne » | ordinateur | magic link existant |

### 3.1 `app.avisdoc.fr`, le module

Un point d'entrée `app.html` de plus dans `vite.config.ts`, à côté des quatre existants. Le
nom vient de vous, il est meilleur que `teleexpertise.avisdoc.fr` : plus court à taper au lit
du patient, et il n'annonce pas la fonction au premier regard sur l'écran du téléphone.

Le front détecte le rôle depuis la session PSC et sert l'arbre de routes correspondant.
Un praticien qui cumule les deux rôles bascule par un sélecteur, la session ne change pas.

### 3.2 `admin.avisdoc.fr`, section « Téléexpertise »

Une entrée de plus dans `src/admin/components/Sidebar.tsx`, entre « Clients » et
« Documents », qui ouvre quatre écrans repris du chapitre 06 :

| Écran de la spec | Devient |
|---|---|
| A1 tableau de bord | quatre cartes d'alerte ajoutées au `Dashboard` existant, cliquables |
| A2 affectation | nouvel écran « File d'attente », avec affectation unitaire et en lot |
| A3 campagnes et journées | **fusionné avec l'existant**, voir § 5.1 |
| A4 comptes et rôles | nouvel écran, adossé à l'annuaire de contacts existant, voir § 5.3 |
| A5 journal d'audit | nouvel écran, lecture et export motivé |
| A6 paramètres | onglet dans `Settings` existant |

Cette section lit le plan santé **à travers la passerelle** (§ 6.2), jamais en direct : le
back-office ne détient aucune clé du plan HDS.

### 3.3 `client.avisdoc.fr`, ce qui change et ce qui ne changera pas

L'espace client est celui de **l'entreprise cliente**, pas du soignant. La promesse faite aux
salariés — « votre employeur n'a accès à aucune information médicale » — figure déjà en pied
des e-mails de rendez-vous. Elle interdit d'y faire entrer quoi que ce soit du module.

Ce qui s'y ajoute est donc strictement agrégé : une page « Résultats de campagne » avec le
nombre de dossiers constitués, le taux de participation par journée, le délai moyen de
réponse, et la répartition des conclusions. Avec deux garde-fous :

- **seuil de non-divulgation** : aucune cellule d'effectif inférieur à 5 n'est affichée, elle
  est remplacée par « effectif trop faible » ;
- **aucune répartition croisée** qui permettrait de réidentifier (pas de « conclusion par
  site » sur un site de 12 personnes).

Les compteurs viennent de la passerelle, calculés côté plan santé et livrés déjà agrégés. Le
plan CRM ne reçoit jamais la ligne, seulement le total.

---

## 4. Ce qu'on réutilise, et à quelles conditions

| Brique existante | Décision | Condition |
|---|---|---|
| React 18 · TS · Vite · SWC | reprise | `strict` et `noUncheckedIndexedAccess` sur `src/teleexpertise` |
| `react-router-dom` 6 | reprise | arbre par rôle |
| Tailwind + design system + shadcn/ui | **étendu**, voir § 5.6 | les jetons de la charte s'ajoutent sans casser l'existant |
| Pattern *repository* `src/admin/data/repo.ts` | **généralisé** | c'est lui qui rend la frontière HDS déplaçable |
| Mode démo `VITE_ADMIN_BACKEND` | repris, **inversé** | le module refuse de démarrer en démo si `PROD` |
| `psc-auth` (OIDC Pro Santé Connect) | **promu** | session 1 h glissante, inactivité 15 min, `state` et `nonce` vérifiés |
| Service FastAPI + WeasyPrint | **repris, redéployé** | il doit tourner **dans** le périmètre HDS (§ 5.5) |
| Edge Functions Deno | reprises pour le plan CRM | les fonctions de santé migrent (§ 6.1) |
| Resend | **à trancher**, voir § 5.4 | conflit avec `C-02` et `C-07` |
| GitHub Actions · npm · Vitest · ESLint 9 | repris, **rendus bloquants** | § 7 |
| Déploiement SFTP OVH | repris pour vitrine, admin, client | `app.avisdoc.fr` part ailleurs, § 5.7 |

Le pattern *repository* mérite un mot : c'est ce qui permet de commencer à écrire les écrans
et les règles **avant** que la décision d'hébergement soit prise. `mockRepo` fait tourner
l'application et les tests sans base ; le jour où l'hébergeur est choisi, seul `apiRepo.ts`
est écrit. C'est la raison pour laquelle le lot 2 (§ 8) peut démarrer immédiatement.

---

## 5. Les sept points de couture

Là où la spec et l'existant décrivent le même objet, il faut trancher. Voici mes décisions.

### 5.1 Journées et campagnes : une seule source, côté CRM

**Le conflit.** `admin_journees` existe et porte la logistique : date, lieu, créneaux, pauses,
jeton public de réservation, rappels J-1 et H-1, inscriptions. `te_journee` de la spec porte
la même journée vue du métier : campagne, requérant, expert, places, et surtout la contrainte
`unique (date, requerant_id)` qui déclenche l'affectation automatique (`RM-12`).

**Ma décision.** Une journée est un objet **du plan CRM**. Ni la campagne, ni la journée, ni
le lieu, ni le nombre de places ne sont des données de santé. `te_campagne` et `te_journee`
disparaissent du schéma santé.

- `admin_journees` est étendue : `requerant_id`, `expert_id`, `places`, `campagne_id`, et la
  contrainte d'unicité `(date, requerant_id)` de `RM-12`.
- `admin_campagnes` est créée côté CRM, avec `client_id` qui pointe déjà sur `admin_clients`.
- Le plan santé ne stocke qu'une **référence opaque** : `te_demande.journee_ref`, un uuid sans
  jointure possible depuis le CRM vers un patient.

**Ce qu'on y gagne.** L'écran A3 de la spec n'est plus un écran neuf : c'est l'écran
« Journées » existant, enrichi de deux champs. Les rappels de rendez-vous continuent de
fonctionner sans y toucher. Et l'affectation automatique interroge une table que le
back-office administre déjà.

### 5.2 Le lien entre la réservation patient et le dossier

Aujourd'hui `admin_rdv` porte un nom, un e-mail et un téléphone de personne réservant un
créneau de dépistage. Demain `te_patient` porte la même personne, du côté santé.

**Ma décision.** Les deux ne se joignent pas automatiquement, et surtout pas par e-mail.
Le requérant, à l'ouverture du dossier, part de sa liste de rendez-vous du jour et **crée ou
retrouve** le patient côté santé. Le rapprochement est un geste humain, tracé, jamais une
jointure. Le CRM ne doit pas pouvoir déduire qui a un dossier.

Conséquence : `admin_rdv` reste ce qu'elle est, une liste d'inscriptions logistiques, et sa
purge suit sa propre durée, plus courte que celle du dossier médical.

### 5.3 Praticiens : l'annuaire existe déjà

`admin_network_contacts` et la fonction `annuaire-sante` (interrogation RPPS) couvrent déjà
le référentiel des professionnels. `te_praticien` de la spec fait doublon à 80 %.

**Ma décision.** Le référentiel praticien reste **côté CRM**, étendu des champs manquants
(`psc_sub`, `profession`, `adeli`, `specialite`, rôles). Le plan santé ne stocke pas le
référentiel : à la création d'une demande, il **gèle** dans le dossier l'identité utile au
document — nom, prénom, profession, RPPS ou ADELI. C'est doublement juste :

- médico-légalement, le compte rendu doit porter l'identité du praticien **au moment de
  l'acte**, pas son identité d'aujourd'hui ;
- techniquement, cela supprime une jointure inter-plans sur le chemin critique.

`RM-01` s'applique à l'affichage comme au gel : c'est `profession` qui est gelée, jamais la
chaîne « Dr. Arthur Requerant ».

### 5.4 Les envois au patient : Resend est un point de conformité

La spec écrit, en `08-api.md` § 5, que `te-envois-traiter` « envoie par Resend ». C'est la
continuité de l'existant, mais cela entre en tension avec `C-02` (stockage dans l'EEE) et
`C-07` (aucun document ne transite par un service hors périmètre).

**L'analyse.** Le corps du courriel ne contient aucune donnée de santé et les documents ne
sont pas joints : ce sont des liens signés (`07-circuit-patient.md` § 4). Le prestataire de
messagerie ne voit donc ni cliché, ni compte rendu. Il voit en revanche **l'adresse du
patient et le fait qu'un dossier de téléexpertise dermatologique le concerne** — le nom de
l'expéditeur suffit à le déduire. C'est une donnée de santé par inférence, et elle sort du
périmètre.

**Ma décision.** Deux canaux séparés, pas un.

- **Plan CRM** : Resend reste, tel quel, pour les rendez-vous, le contact, les invitations.
  Aucun changement.
- **Plan santé** : un expéditeur distinct, hébergé dans le périmètre HDS ou chez un
  prestataire EEE contractualisé en sous-traitance. Nom d'expéditeur neutre, sans mention de
  spécialité.

Le choix du prestataire est à instruire avec le DPO : c'est une ligne de la cartographie
`C-03`, pas un détail technique.

### 5.5 Le service de génération documentaire doit déménager

`platform/generation-service/` sait déjà produire des documents à la charte, et il applique
déjà `RM-11` : il **refuse** de publier les documents marqués `hds`. Cette garde a été écrite
quand le service tournait hors périmètre. Elle devient inutile — et nuisible — le jour où il
produit le compte rendu.

**Ma décision.** Le service est repris tel quel, gabarits compris, mais :

1. il est déployé **dans le périmètre HDS**, pas sur le registre Scaleway générique actuel,
   sauf si Scaleway est l'hébergeur HDS retenu, auquel cas c'est le même endroit avec un
   compte séparé ;
2. la garde `hds` est **inversée** : dans le déploiement santé, seuls les documents `hds`
   sont produits, et le bucket de destination est le bucket santé ;
3. le déploiement CRM existant reste en place, inchangé, pour les documents commerciaux.

Un seul code, deux déploiements, deux configurations. C'est le meilleur rapport
réutilisation/isolement disponible.

### 5.6 Les jetons de couleur ne correspondent pas

La charte de la spec donne `marine #142A33`, `cyan #0CA6DF`, `orange #EC7735`. Le dépôt
définit ses couleurs en HSL dans `src/index.css` : `--avisdoc-teal: 197 74% 48%`, soit
`#20A2D5`, et `--avisdoc-ink: 206 45% 13%`, soit `#122330`. Les e-mails transactionnels, eux,
codent `#29B1E0` et `#16283C` en dur. **Trois jeux de valeurs voisines pour deux couleurs.**

**Ma décision.** La charte de la spec fait foi. Les variables de `src/index.css` sont alignées
sur `#142A33` et `#0CA6DF`, les gabarits d'e-mail suivent, et les déclinaisons lisibles
`cyanTexte #087497` et `orangeTexte #BC4E17` sont ajoutées — elles n'existent nulle part
aujourd'hui, et c'est ce qui produit les défauts de contraste `G17`, `C-20`.

L'écart est faible à l'œil, donc la reprise est indolore ; mais deux sources de vérité pour
une couleur de marque finissent toujours par diverger.

### 5.7 Où sert-on `app.avisdoc.fr`

Le front est statique et ne stocke rien : servi depuis OVH mutualisé comme les quatre autres,
il ne viole aucune exigence, l'hébergement HDS portant sur les données.

**Ma décision, malgré tout : le sortir du mutualisé.** Le code qui manipule les clichés et
les comptes rendus est livré par cet hôte ; une compromission du dépôt SFTP mutualisé
suffirait à exfiltrer des données de santé sans jamais toucher au plan HDS. `app.avisdoc.fr`
est donc servi depuis le stockage objet de l'hébergeur HDS, derrière son CDN, avec une CSP
stricte et `Subresource Integrity`. Les quatre autres fronts ne bougent pas.

---

## 6. Le plan santé, concrètement

### 6.1 Ce qui s'exécute où

| Élément | Plan CRM (Supabase Cloud) | Plan santé (HDS) |
|---|---|---|
| Clients, contacts, devis, documents commerciaux | ✅ | |
| Campagnes, journées, réservations, rappels | ✅ | |
| Référentiel praticien, rôles, PSC | ✅ | référence + identité gelée |
| Patients, consentements | | ✅ |
| Demandes, lésions, clichés, avis | | ✅ |
| Comptes rendus, lettres d'adressage, envois | | ✅ |
| Journal d'audit des accès santé | | ✅ |
| Génération documentaire | déploiement commercial | déploiement santé |
| Compteurs agrégés pour l'espace client | reçus | calculés |

Le schéma du chapitre `09-donnees.md` s'applique tel quel au plan santé, **moins**
`te_campagne` et `te_journee` (§ 5.1), **moins** `te_praticien` réduit à une projection
(§ 5.3). Les 17 zones, les énumérations, les contraintes portant `RM-08`, `RM-09`, `RM-12`,
`RM-17` et l'index partiel des envois sont repris sans modification : ils sont bons.

### 6.2 La passerelle

Un unique service, côté santé, expose au plan CRM ce dont il a besoin, et **rien d'autre** :

```
GET  /passerelle/file-attente          → [ { demandeRef, journeeRef, requerantRef,
                                             transmiseLe, nbLesions, typeLesion } ]
POST /passerelle/affecter              { demandeRef, expertRef, motif }
GET  /passerelle/alertes               → { enAttente, procheEcheance, expirees, aRappeler }
GET  /passerelle/audit?…               → journal, sans contenu de santé
GET  /passerelle/agregats/{campagneRef} → compteurs, seuil de 5 appliqué côté santé
```

Aucun de ces appels ne renvoie un nom de patient, une date de naissance, un cliché ou un
texte d'avis. Le back-office affiche des références de dossier, ce qui suffit à
`06-parcours-admin.md` et satisfait `RM-27` par construction : l'administrateur ne peut pas
voir ce qu'il n'a aucun moyen d'obtenir.

L'accès exceptionnel d'un administrateur à une donnée de santé — prévu par `RM-27` et `C-31`
— passe par un point d'entrée distinct, exigeant un motif, journalisé côté santé, et qui
ouvre une vue **dans `app.avisdoc.fr`**, pas dans le back-office.

### 6.3 Authentification, session, rôles

| Profil | Entrée | Session | Second facteur |
|---|---|---|---|
| Requérant, expert | Pro Santé Connect, e-CPS ou carte | 1 h glissante, inactivité 15 min | porté par la carte |
| Administrateur | SSO Google `@avisdoc.fr` | inchangée | **à activer**, `C-38` |
| Entreprise cliente | magic link, inchangé | inchangée | non requis |
| Patient | aucun compte | liens signés 7 jours + date de naissance | — |

`psc-auth` existe et fonctionne : flux serveur, `client_secret` jamais exposé, session signée
HMAC. Trois évolutions : durée ramenée de 12 h à 1 h avec renouvellement silencieux,
déconnexion sur inactivité, et rattachement du `psc_sub` au référentiel praticien pour
résoudre les rôles. Le reste du code est bon.

---

## 7. Qualité : ce qui devient bloquant

Le module ne peut pas être livré avec l'outillage actuel — Vitest présent, **un** fichier de
test, aucun job en CI. La spec l'a vu (`12-tests.md`, `14-pile.md` § 7) et je la suis sans
réserve. Concrètement, un `ci.yml` bloquant sur toute branche :

```
npm ci · npm run lint · npx tsc --noEmit
npm run test -- --coverage        # 100 % des RM-xx, vérifié par un script de correspondance
npm run test:e2e                  # Playwright, les 37 scénarios + un fichier par anomalie
npm run verif:a11y                # axe-core, zéro violation bloquante
npm run verif:typo                # RM-42
```

Deux règles ESLint personnalisées à écrire, qui tiennent trois exigences dans la durée :

- `text-avisdoc-cyan` et `text-avisdoc-orange` interdits dans `src/teleexpertise` (`C-20`) ;
- import de `supabase-js` interdit hors de `data/apiRepo.ts` ;
- chaîne visible en dur interdite hors de `i18n/libelles.ts` (`RM-40`).

Le périmètre du blocage démarre à `src/teleexpertise` : imposer d'emblée zéro avertissement
sur les 43 fichiers du back-office existant bloquerait tout le monde pour un bénéfice nul.
L'extension au reste du dépôt se fait ensuite, dossier par dossier.

---

## 8. Trajectoire

Adaptée du chapitre `13-migration.md`, avec ce que notre dépôt permet de faire en parallèle.

| Lot | Contenu | Dépend de | Réversible |
|---|---|---|---|
| **0** | `ci.yml` bloquant, environnements `dev` et `recette`, jeu fictif « Marion Delaunay », alignement des jetons de couleur (§ 5.6) | rien | sans objet |
| **1** | `src/teleexpertise/domaine/` : types, machine à états, les 43 `RM-xx` en fonctions pures, `mockRepo`, tests unitaires | lot 0 | oui, rien n'est exposé |
| **2** | Décision HDS, contractualisation, socle du plan santé, schéma, passerelle | décision § 9.1 | **non** |
| **3** | Extension CRM : campagnes, journées enrichies, référentiel praticien (§ 5.1, § 5.3) | lot 0 | oui |
| **4** | `app.avisdoc.fr` — parcours requérant complet, sur patients nouveaux | lots 1, 2, 3 | oui |
| **5** | `app.avisdoc.fr` — parcours expert | lot 4 | oui |
| **6** | `admin.avisdoc.fr` — section Téléexpertise via la passerelle | lots 2, 3 | oui |
| **7** | Circuit patient : compte rendu par lésion, lettre d'adressage, envois différés | lots 4, 5 | oui |
| **8** | `client.avisdoc.fr` — page Résultats de campagne, agrégats | lot 7 | oui |
| **9** | Reprise des données et bascule | lots 4 à 7 | **non** |
| **10** | Identité INS et téléservice INSi | lot 9 | oui |

Les lots 0, 1 et 3 ne dépendent pas de la décision d'hébergement : **on peut commencer
maintenant**, et c'est le principal bénéfice du pattern *repository*. Le lot 2 est le point
de non-retour.

---

## 9. Les décisions à prendre avant d'écrire du code

### 9.1 L'hébergement — ma recommandation : architecture B

Isoler le plan santé chez un hébergeur certifié HDS et laisser le plan CRM où il est. Motifs :
aucune régression sur une plateforme qui fonctionne, périmètre d'audit étroit donc moins cher,
et démarrage possible sans migrer l'existant.

Deux vérifications préalables, à obtenir **par écrit** :

- le statut HDS de Supabase Cloud (`C-08`) — s'il était établi et la localisation EEE
  garantie, l'architecture C redeviendrait discutable, mais ne pariez pas dessus ;
- pour l'hébergeur retenu, le certificat sous le référentiel v2.0, les clauses de
  réversibilité, et la liste de ses propres sous-traitants.

### 9.2 Les cinq autres

| # | Décision | Qui tranche | Bloque |
|---|---|---|---|
| 2 | Qualification RGPD : responsable ou sous-traitant, et durées de conservation | DPO | lot 2 |
| 3 | Niveau de signature du compte rendu : simple, avancée, qualifiée (`C-33`) | juridique | lot 7 |
| 4 | Prestataire d'envoi côté santé (§ 5.4) | DPO + technique | lot 7 |
| 5 | Second facteur administrateur : Google Workspace ou Supabase MFA | technique | lot 6 |
| 6 | Le site vitrine annonce un hébergement HDS que la plateforme n'a pas encore | direction | avant mise en service |

La sixième n'est pas technique mais elle est réelle : `docs/admin-app.md` acte que le HDS
n'est pas requis « en l'état ». Cette phrase cesse d'être vraie le jour où le premier cliché
est stocké. Les deux documents doivent être mis à jour le même jour que la mise en service.

---

## 10. Ce que je propose de modifier dans la spécification

Récapitulatif des écarts, tous motivés plus haut. L'essence fonctionnelle est intacte : aucune
règle `RM-xx` n'est affaiblie, aucun écran n'est supprimé.

| Chapitre | Écart proposé | Motif |
|---|---|---|
| `14-pile.md` § 2 | Le module porte **deux** parcours, pas trois. L'administration rejoint le back-office | périmètre HDS, authentification, duplication (§ 2) |
| `14-pile.md` § 2 | `teleexpertise.avisdoc.fr` devient `app.avisdoc.fr` | votre nommage, plus court à saisir |
| `09-donnees.md` § 7 | `te_campagne` et `te_journee` sortent du plan santé, vers le CRM | une seule source pour un objet qui existe déjà (§ 5.1) |
| `09-donnees.md` § 2 | `te_praticien` devient une projection gelée, le référentiel reste au CRM | l'annuaire existe, et le gel est une exigence médico-légale (§ 5.3) |
| `08-api.md` § 5 | `te-envois-traiter` n'utilise pas Resend côté santé | `C-02`, `C-07` (§ 5.4) |
| `08-api.md` | Ajout des cinq points d'entrée de la passerelle CRM ↔ santé | conséquence de l'architecture B (§ 6.2) |
| `10-design-system.md` § 1 | Les jetons de la charte remplacent les trois jeux de valeurs actuels | divergence constatée (§ 5.6) |
| `14-pile.md` § 3 | Le service de génération est déployé deux fois, garde `hds` inversée côté santé | réutilisation sans compromettre l'isolement (§ 5.5) |
| `14-pile.md` § 7 | Le lint bloquant démarre sur `src/teleexpertise`, puis s'étend | livrable dès le lot 0 (§ 7) |
| `13-migration.md` | Ajout d'un lot 3 « extension CRM », parallélisable avant la décision HDS | fait gagner le délai de contractualisation (§ 8) |

Et une chose que je propose de **ne pas** faire, bien qu'elle paraisse naturelle : rapprocher
automatiquement `admin_rdv` et `te_patient` par l'adresse électronique. Le confort ne vaut pas
la jointure qu'il crée entre le plan commercial et le plan santé (§ 5.2).

---

## 11. Risques

| Risque | Effet | Parade |
|---|---|---|
| La contractualisation HDS prend trois mois | le lot 2 glisse, et tout ce qui en dépend | les lots 0, 1 et 3 avancent sans lui ; le domaine et les tests sont écrits contre `mockRepo` |
| La frontière CRM ↔ santé s'érode sous la pression du confort | le périmètre HDS s'étend, l'audit devient ingérable | la passerelle est le seul chemin, et son contrat est testé : un test échoue si une réponse contient un champ nominatif |
| Le mode hors ligne du requérant stocke des clichés sur le téléphone | données de santé hors périmètre | file locale chiffrée, purge à la synchronisation, effacement à la déconnexion, documenté dans l'AIPD |
| Un seul environnement aujourd'hui | pas de recette possible avant le lot 0 | le lot 0 est un préalable, pas une option |
| La couverture de test part de zéro | la règle « 100 % des `RM-xx` » paraît hors d'atteinte | elle porte sur des fonctions pures sans dépendance ; c'est le sous-ensemble le moins coûteux à couvrir, et il est écrit avant les écrans |

---

## 12. Ce que j'attends de vous pour démarrer

1. Un accord, ou un désaccord argumenté, sur les trois décisions du § 1.
2. La décision d'hébergement (§ 9.1), ou l'autorisation de démarrer les lots 0, 1 et 3 en
   attendant.
3. Les points `[à valider]` du chapitre `11-conformite.md` portés au DPO.

Sur accord, le premier livrable est le lot 0 : la CI bloquante, les environnements, et
l'alignement des jetons de couleur. Il ne touche à aucune fonctionnalité existante et se
mesure en jours, pas en semaines.
