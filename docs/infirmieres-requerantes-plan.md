# Inscription & validation des infirmières requérantes — plan de lotissement

Réf. spec : « Spécification : inscription et validation des infirmières requérantes »
(Oct 2026). Ce document fige le découpage retenu et les décisions de cadrage.

## Décisions de cadrage

- **Projet Supabase** : on **réutilise le projet admin** (`wtovhzxymlqnfxyjxrdq`) pour
  démarrer. Tables préfixées **`req_`**. À reconsidérer (projet « plateforme »
  isolé) avant la prod — la copie de pièce d'identité est sensible.
- **Connexion sans Pro Santé Connect dans un premier temps** : auth par **lien
  magique e-mail**, identité par la **voie de secours** (RPPS saisi + pièce
  filigranée contrôlée à la main). `identite_source = 'secours'`. PSC = Lot 5.
- **Intégrations isolées derrière des interfaces** (`ServiceSignature` pour
  Yousign ; adaptateur identité) pour les brancher sans toucher au métier.
- **Toute transition d'état passe par une Edge Function** (service_role). Les
  infirmières n'ont qu'un accès **lecture** à leur propre dossier (RLS).

## Lots

| Lot | Contenu | Dépend de |
|---|---|---|
| **0** | Externes à lancer en parallèle : DataPass/ANS (PSC, délai long), compte Yousign, validation juridique des durées de conservation | — |
| **1** | **Socle** : modèle de données (`req_inscriptions`, `req_pieces`, `req_contrats`, `req_historique`), machine à états, RLS, buckets privés | — |
| **2** | **Back-office** A1 Inscriptions / A2 Fiche / A3 Contrôle + fonctions `inscription-inviter`, `piece-controler`, `inscription-suspendre/-refuser/-resilier`. Inclut le **pré-remplissage automatique des champs RCP** (assureur / police / date de fin) depuis la pièce déposée, **révisé par l'admin** avant validation (RI-04 reste une validation humaine). | 1 |
| **3** | **Portail `requerant.avisdoc.fr`** (P1–P5), auth lien magique + fonctions `identite-secours-deposer`, `piece-deposer` | 1 (se marie avec 2) |
| **4** | **Yousign** : `ServiceSignature`, `contrat-envoyer`, `yousign-webhook` (idempotent, RI-07) | 1 + compte Yousign |
| **5** | **Pro Santé Connect** : `identite-psc-retour` (RI-02), bascule P1 sur PSC | 1 + raccordement PSC |
| **6** | **Échéances / conservation / éligibilité** : cron `inscription-echeances`, purge identité J+30 (RI-03), `affectation-eligible` (RI-01) | 1-2 |
| **7** | **Recette & prod** : checklist §6 de la spec | tous |

**Ordre conseillé** : 1 → 2 → 3 → 4 → 6, puis 5 (bloqué par l'externe), puis 7.
Lot 0 tourne en parallèle dès le début.

## États

- **Inscription** : `invitee → identite_a_controler → identite_verifiee →
  pieces_a_valider → a_completer → pret_a_signer → contrat_envoye → active`,
  plus `suspendue`, terminaux `refusee / resiliee / abandonnee`.
- **Pièce** : `deposee / validee / refusee / expiree / remplacee`
  (types : `rcp`, `urssaf`, `identite`).
- **Motifs de refus** (RI-06, liste fermée) : illisible, incomplète, mauvais
  document, nom non concordant, période non couverte, exercice libéral absent,
  code URSSAF non vérifiable, autre.

## Points à trancher

- **Extraction automatique RCP (Lot 2)** : méthode à choisir — **sans tiers**
  (OCR local + règles, fiable sur modèles connus) ou **IA d'extraction** (fiable
  sur formats variés, mais tiers + RGPD car données personnelles). Dans tous les
  cas : pré-remplissage + **relecture/correction par l'admin** (champs éditables).
  Pourrait s'étendre à l'URSSAF (date d'émission).

## État d'avancement

- [x] Lot 1 — socle (migration `0057_req_infirmieres.sql`)
- [x] Lot 2 — back-office (A1 liste, A2 fiche, A3 contrôle, invitation + actions)
- [~] Lot 3 — portail : **3a fait** (app `requerant.avisdoc.fr`, auth lien magique, P1 Bienvenue, P3 Suivi) ; **3b à venir** (P2 identité + P4 dépôts)
- [ ] Lot 4 — Yousign
- [ ] Lot 5 — Pro Santé Connect
- [ ] Lot 6 — échéances / conservation
- [ ] Lot 7 — recette
