# AvisDoc — Module de prospection (`prospection.avisdoc.fr`)

Outil web interne pour sourcer, qualifier, contacter et suivre les prescripteurs
(courtiers, acteurs QVCT, événementiel, mutuelles, grossistes) et les entreprises
cibles, **sans jamais automatiser un envoi LinkedIn**.

Références : le brief du 3 septembre 2026, `docs/prospection-registre-rgpd.md`
(fiche de registre, livrée avec le lot 1).

## 1. La décision d'architecture

Cette base **ne va pas dans le projet Supabase de la plateforme**
(`wtovhzxymlqnfxyjxrdq`, back-office, espace client, annuaire, données de santé).
Le module vit dans le **projet Supabase vitrine** (`fmchuaxxchghfagfpvwn`),
schéma dédié **`prospection`**. Deux traitements, deux bases légales, deux durées,
deux populations : mélanger les deux élargirait l'AIPD et le dossier HDS sans bénéfice.

Le cloisonnement est **codé**, pas seulement documenté :

| Garde | Où |
|---|---|
| Aucun import de `src/admin`, `src/client`, `src/pro`, `src/integrations` dans `src/prospection`, et réciproquement | `eslint.config.js` (`no-restricted-imports`) + `domaine/__tests__/cloisonnement.test.ts` |
| Un seul fichier importe `supabase-js` : `src/prospection/data/repo.ts` | lint + test |
| Le repo lit `VITE_SUPABASE_*` (vitrine), jamais `VITE_ADMIN_SUPABASE_*` | test |
| Migrations et fonctions dans un **dossier Supabase séparé** : `supabase-prospection/` | déploiement avec `--workdir supabase-prospection --project-ref fmchuaxxchghfagfpvwn` |
| Aucun champ libre non borné, aucune donnée de santé | contraintes SQL (`check`), notes ≤ 280 caractères, signaux typés |

> Point d'attention hérité : `supabase/config.toml` (racine) pointe sur le projet
> vitrine alors que ses fonctions sont déployées sur la plateforme par le
> workflow. Toujours passer `--project-ref` explicitement, dans les deux sens.

## 2. Ce que le module ne fait pas

Aucune extraction automatisée de LinkedIn (scraper, headless, extension), aucun
appel à une API LinkedIn, aucun envoi de message depuis le code, aucune séquence
d'envoi automatique. L'entrée LinkedIn est l'export CSV d'une liste Sales
Navigator, déposé à la main. Les relances sont une **file de rappels**. Le seul
automatisme est la trace des emails déjà échangés (métadonnées et résumé court).

## 3. Arborescence

```
prospection.html                      entrée Vite → src/prospection/main.tsx
src/prospection/
  ProspectionApp.tsx                  HashRouter + React Query + gate d'auth
  auth/AuthContext.tsx                SSO Google (projet vitrine), domaine @avisdoc.fr
  data/
    repo.ts                           SEUL import supabase-js ; schéma prospection ; ErreurRepo
    types.gen.ts                      types générés (npm run types:prospection)
    types.ts                          alias lisibles (Contact, Compte, …)
  domaine/                            fonctions pures nommées PR-xx (+ tests)
    signaux.ts                        PR-01…PR-10, PR-20…PR-23, calculerScore
    machineEtats.ts                   PR-40… miroir de transition_autorisee() SQL
    relances.ts                       PR-50… échéances J+5/12/21, plafond 15/jour
    gardeFousMessage.ts               PR-30… refus typographie/vocabulaire, objection attendue
    importCsv.ts                      PR-60… analyse CSV, mapping, lignes d'import
    jeuxDeFiltres.ts                  PR-70… jeux de filtres Sales Navigator
    synthese.ts                       PR-80… référence de campagne, export CSV, matrice cercles
    typographie.ts                    PR-90… typographie française des libellés
  i18n/libelles.ts                    tous les libellés (lint : rien en dur dans les écrans)
  composants/                         ui (Bouton à motif, Statut, Kpi…), Coquille, BarreLaterale
  ecrans/                             Connexion, Jour, Contacts, FicheContact, Message, Import,
                                      Sourcing, Exclusions, Synthese
supabase-prospection/
  supabase/config.toml                project_id vitrine + fonctions du module
  supabase/migrations/0001_…sql       schéma, RLS, machine à états, import, relances, purge, synthèse
  supabase/functions/
    prospection-message               génération Bedrock eu-west-3, garde-fous, relecture obligatoire
    prospection-gmail                 rattachement Gmail : fil, date, sens, objet, résumé. Jamais le corps
    prospection-opposition            lien d'opposition public (jeton opaque) → exclusion + suppression
  recette/recette.sql                 recette serveur, transaction annulée
  recette/recette-import.csv          fichier de recette : 10 lignes, 2 doublons, 1 exclusion
scripts/prospection-recette-sql.sh    joue la recette sur un Postgres local jetable
src/pages/ProspectionInformation.tsx  page publique d'information (avisdoc.fr/prospection-information)
src/pages/ProspectionOpposition.tsx   page publique d'opposition (avisdoc.fr/prospection-opposition)
```

## 4. Écrans

| Route | Écran | Action principale |
|---|---|---|
| `#/jour` | Écran du jour (défaut) : relances échues, réponses non traitées, à qualifier, invitations restantes | — (liens) |
| `#/contacts` | File de travail, tri par score rejoué à l'affichage, filtres statut / cercle / liste | lien « Importer une liste » |
| `#/contacts/:id` | Fiche : identité, compte, signaux datés, détail du score, séquence, historique | dictée par le statut |
| `#/contacts/:id/message/:type` | Rédaction : génération assistée, relecture, garde-fous | « Copier » ; suivi « Marquer comme envoyé » |
| `#/import` | Import multi-listes : liste, colonnes, aperçu chiffré | « Importer » |
| `#/sourcing` | Jeux de filtres Sales Navigator par cercle | — |
| `#/exclusions` | Liste d'exclusion, ajout manuel | « Ajouter une exclusion » |
| `#/synthese` | Synthèses hebdomadaires, cumul vs référence, vue par cercle, export | « Générer la synthèse » |

Un bouton inactif nomme son motif, et le motif est cliquable (`composants/ui.tsx`,
`Bouton`). Le retour est un lien. Cibles tactiles 44 pt. Cyan et orange ne sont
jamais une couleur de texte sur fond clair (`text-avisdoc-teal-ink`, `text-avisdoc-coral-ink`).

## 5. Modèle et règles serveur

Tables du schéma `prospection` : `compte`, `contact`, `interaction`, `relance`,
`import`, `exclusion`, plus `journal` (transitions, imports, oppositions, purges)
et `synthese_hebdo`. RLS partout, lecture réservée à `est_membre()` (email
`@avisdoc.fr`). Écriture directe uniquement sur `compte`, `contact` (jamais
`statut`, un trigger le refuse) et `exclusion`. Tout le reste passe par fonction :

| Fonction | Rôle |
|---|---|
| `transition_contact(id, vers)` | machine à états, motif nommé `transition_refusee`, journal |
| `marquer_envoye(id, type, contenu)` | trace l'envoi manuel, plafond 15/jour (`plafond_invitations_atteint`), arme J+5 / J+12 / J+21, clôt après la proposition |
| `enregistrer_reponse(id, canal, …)` | réponse entrante, annule les relances restantes, avance le statut |
| `ajouter_note(id, canal, contenu)` | note typée, 280 caractères |
| `marquer_traitee(interaction_id)` | réponse prise en compte (écran du jour) |
| `importer(libelle, fichier, lignes, ecrire)` | aperçu chiffré puis écriture ; dédoublonnage URL LinkedIn puis (prénom, nom, compte) ; exclusion bloquante |
| `opposition(jeton)` | service uniquement : exclusion, annulation, suppression, journal |
| `purger_inactifs()` | trois ans sans interaction, journalisé (pg_cron, 03:00) |
| `generer_synthese_hebdo(lundi)` | synthèse de la semaine (pg_cron, lundi 04:00 UTC) |

Machine à états : `a_qualifier → a_contacter → invite → accepte → en_conversation → partenaire`,
`refus` depuis invite / accepte / en_conversation, `arrete` depuis invite / accepte
(fin de séquence) et depuis a_contacter (disqualification). Le test
`machineEtats.test.ts` vérifie que le TS est le miroir exact du SQL.

Le score est calculé à l'affichage (`calculerScore`) ; `contact.score` n'est
qu'un cache de tri, recalculé par `repo.ts` à chaque écriture.

## 6. Mise en place (projet vitrine `fmchuaxxchghfagfpvwn`)

1. **Migration** : exécuter `supabase-prospection/supabase/migrations/0001_prospection_schema.sql`
   dans le SQL Editor du projet vitrine (idempotente). Puis vérifier
   Dashboard → Settings → API → *Exposed schemas* contient `prospection`
   (la migration tente de le régler, le Dashboard fait foi).
2. **SSO Google** sur le projet vitrine : Authentication → Providers → Google,
   URL de redirection `https://fmchuaxxchghfagfpvwn.supabase.co/auth/v1/callback`,
   Site URL / Redirect URLs incluant `https://prospection.avisdoc.fr`. Le domaine
   `@avisdoc.fr` est imposé côté client (`AuthContext`) et par la RLS.
3. **Types** : `npm run types:prospection` (supabase CLI connecté) pour régénérer
   `types.gen.ts` depuis le schéma réel. Le fichier livré est rendu depuis la migration.
4. **Fonctions** :
   ```bash
   supabase functions deploy --workdir supabase-prospection --project-ref fmchuaxxchghfagfpvwn
   supabase secrets set --workdir supabase-prospection --project-ref fmchuaxxchghfagfpvwn \
     AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=… BEDROCK_REGION=eu-west-3 \
     BEDROCK_MODEL_ID=mistral.mistral-large-2402-v1:0 \
     GMAIL_CLIENT_ID=… GMAIL_CLIENT_SECRET=… GMAIL_REFRESH_TOKEN=… \
     PROSPECTION_CRON_SECRET=…
   ```
   Le workflow GitHub `Déploiement` fait ce déploiement (job « Fonctions prospection »).
   Vérifier dans la console AWS que le modèle choisi est activé en **eu-west-3** ;
   la fonction refuse toute région `us-*` ou globale.
5. **Planification** : la migration tente `pg_cron` (purge quotidienne, synthèse le
   lundi). Si l'extension n'est pas disponible, planifier
   `select prospection.purger_inactifs()` et `select prospection.generer_synthese_hebdo()`
   depuis Dashboard → Integrations → Cron. Le rattachement Gmail peut aussi être
   planifié en appelant `prospection-gmail` avec l'en-tête `x-secret`.
6. **Front** : OVH Multisite, sous-domaine `prospection.avisdoc.fr` → dossier
   `prospection` ; `./scripts/deploy-ovh.sh prospection` (ou `all`). Le build
   produit `dist/prospection.html`.

Variables front : uniquement `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`
(déjà présentes dans `.env`).

## 6 bis. Tester sans Supabase : le mode démo

```bash
VITE_PROSPECTION_MODE=demo npm run dev
# puis http://localhost:8080/prospection.html
```

Données fictives en mémoire (persistées dans le `localStorage` du navigateur),
mêmes règles que les fonctions serveur (transitions, plafond, relances, import
avec dédoublonnage et exclusion, purge), connexion simulée, génération de message
et rattachement Gmail simulés. Aucun appel réseau, aucun projet Supabase touché.
Pour repartir de zéro : vider le stockage du site dans le navigateur.
Le fichier `supabase-prospection/recette/recette-import.csv` joue le point 1 de
la recette (l'exclusion `recette-exclu` est déjà présente dans la démo).

Ne jamais mettre `VITE_PROSPECTION_MODE=demo` dans `.env` : le build de
production lit ce fichier.

## 7. Recette (§8 du brief)

Un seul environnement : la production, sur données fictives, avant tout usage réel.

| # | Point | Comment |
|---|---|---|
| 1 | Import de dix lignes, deux doublons, une exclusion | `npm run recette:sql` (Postgres local) **et** en interface : ajouter l'exclusion `https://www.linkedin.com/in/recette-exclu` dans « Exclusions », déposer `supabase-prospection/recette/recette-import.csv`, lire l'aperçu (10 lues, 7 à créer, 2 doublons, 1 exclusion), importer, vérifier la file |
| 2 | Même fichier une seconde fois | aperçu : 0 à créer, 9 doublons ; aucun statut régressé |
| 3 | Scoring PR-01 > PR-08 + PR-09 ; signal > 90 jours ignoré | `npm run test` (`signaux.test.ts`) ; visible dans « Détail du score » |
| 4 | Refus d'un tiret cadratin ou de « dépistage du cancer » | `npm run test` (`gardeFousMessage.test.ts`) ; en interface, « Copier » et « Marquer comme envoyé » se désactivent avec le motif |
| 5 | Séquence complète | `recette.sql` ; en interface : marquer l'envoi, trois relances armées, saisir une réponse, relances annulées |
| 6 | Plafond : seizième invitation refusée | `recette.sql` (motif `plafond_invitations_atteint`) ; en interface le bouton nomme le motif |
| 7 | Purge et journal | `recette.sql` (`purger_inactifs`, événement `purge`) |
| 8 | Cloisonnement | `npm run test` (`cloisonnement.test.ts`), `npm run lint`, et l'onglet Réseau : seules des requêtes vers `fmchuaxxchghfagfpvwn.supabase.co` |

Après la recette en production, supprimer les fiches fictives depuis la base
(`delete from prospection.contact where nom like 'Recette-%'`) et l'exclusion de recette.

Vérifications de code : `npm run typecheck:prospection` (TypeScript strict, aucun
`any`), `npm run lint`, `npm run test`, `npm run build`.

## 8. Conformité

Voir `docs/prospection-registre-rgpd.md` : base légale (intérêt légitime, balance
documentée), information des personnes (page publique, lien dans le premier
email), droit d'opposition (lien dans chaque email → table `exclusion`,
définitive), durée de conservation (trois ans, purge journalisée), registre
distinct de la téléexpertise, minimisation.

## 9. Hors périmètre et points d'attention

- Toute extraction ou envoi automatisé LinkedIn, toute API LinkedIn, le CRM des
  clients finaux et la facturation, le stockage du corps des emails, un outil
  d'automatisation tiers (à reconsidérer au-delà de cent contacts par mois).
- L'import accepte tout CSV (mapping confirmé à la main), y compris l'export de
  données LinkedIn « Connections.csv », si l'export de liste Sales Navigator
  n'est pas disponible sur l'abonnement.
- L'envoi d'email se fait depuis la messagerie de l'utilisateur (`mailto:` préparé
  avec les liens d'information et d'opposition) : rien ne part depuis l'outil.

## 10. Lots

1. **Suivi** : schéma, RLS, import CSV, fiche, historisation manuelle, file de
   relances, écran du jour, exclusions, opposition, fiche de registre.
2. **Qualification et rédaction** : scoring PR-xx, jeux de filtres Sales
   Navigator, génération de message avec garde-fous (fonction `prospection-message`).
3. **Email et synthèses** : rattachement Gmail, synthèse hebdomadaire, vue par
   cercle, export, purge planifiée.
