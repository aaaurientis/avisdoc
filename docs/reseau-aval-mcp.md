# Connecteur MCP du Hub — réseau d'aval (16/11/2026)

Connecteur pour Cowork / Claude Desktop : point de collecte Doctolib, fiches à relever, import des résultats.

## Mise en service

1. Exécuter la migration `supabase/migrations/0095_mcp_cles.sql` (table `admin_mcp_cles`).
2. Admin › **Clés d'accès (MCP)** : créer une clé nommée (ex. « Cowork Arthur »). Elle ne s'affiche qu'une fois ; le Hub n'en garde que l'empreinte SHA-256. Révocation immédiate depuis la même page ; date de dernière utilisation affichée.
3. Dans Cowork / Claude Desktop (`claude_desktop_config.json`), coller la configuration proposée par la page :
   `npx -y mcp-remote https://<projet>.supabase.co/functions/v1/reseau-mcp --header Authorization:${AVISDOC_CLE}` avec `AVISDOC_CLE = "Bearer avd_…"`.
   Connecteur personnalisé Claude (Paramètres › Connecteurs) : adresse `…/reseau-mcp?cle=avd_…` proposée par la page (la clé est dans l'adresse : une clé dédiée par connecteur, révocable).

## Fonctions

- `reseau-mcp` (verify_jwt = false) : MCP « Streamable HTTP » sans état, JSON-RPC en POST (initialize, ping, tools/list, tools/call ; notifications → 202). Clé vérifiée par empreinte, non révoquée.
- `mcp-cles` (verify_jwt = true, droit « admin ») : `creer { nom }` → `{ id, cle }` (seule fois où la clé circule), `revoquer { id }`.

## Outils

| Outil | Rôle |
|---|---|
| `point_collecte_doctolib` | liens, à collecter (jamais relevés, > 180 jours), relevés récents, liens trouvés à valider, fiches à choisir ; option `departement` |
| `fiches_doctolib_a_collecter` | liste à relever (rpps, nom, spécialité, villes, url_doctolib, dernier_releve), plus anciennes d'abord ; `departement`, `limite` (≤ 500), `inclure_recentes` |
| `importer_resultats_doctolib` | `lignes[]` : `rpps`, `url_doctolib`, `releve_le` obligatoires ; `reservable`, `nouveaux_patients`, `premier_creneau`, `creneaux_7j` si connus. Mêmes contrôles que l'import CSV (passage par `analyserImport`), même enregistrement (`importerResultatsDoctolib`, partagé avec le bouton d'import) ; attribué à « MCP « nom de la clé » » |

## Limites

- Le connecteur ne parcourt pas Doctolib : il fournit la liste et reçoit les résultats. La collecte reste de la responsabilité de l'utilisateur (CGU Doctolib, avis DPO en attente).
- Testé localement (base simulée : clé absente/invalide → 401, initialize, tools/list, appels, import avec erreur ligne par ligne). Non testé de bout en bout contre Supabase depuis l'environnement de développement.

## Contenu complet (16/11, suite)

`importer_resultats_doctolib` (et l'import CSV, même logique) accepte tout ce qui est relevé :
- `texte_fiche` (texte intégral, « Voir plus » compris ; en CSV : `fiche_texte_integral`, `voirplus_*`, `autres_lieux_texte_integral`), `texte_creneaux` (`page_creneaux_texte_integral`), `site_web` (`site_web_et_liens`), `telephones`, `motifs` (`motifs_reservables`), `lieux`, `creneaux` (`prochains_30_creneaux`, « AAAA-MM-JJ HH:MM ») ;
- `autres` : toute autre information (en CSV : toute autre colonne remplie), gardée telle quelle.

Le Hub analyse les textes (`analyserFicheDoctolib`, `analyserCreneaux` : spécialité, expertises, tarifs, langues, conventionnement, carte Vitale, téléconsultation, présentation, nouveaux patients, réservable, créneaux par jour — jours écrits en entier « Mercredi 20 janvier 2027 » reconnus) et enregistre les signaux de la grille trouvés (premier créneau, nouveaux patients, dermoscopie, exérèse, chirurgie sur place), validés au nom de l'importateur, datés du relevé, source = la fiche. Les valeurs explicites priment sur l'analyse.

Bilan : `signaux` (enregistrés), `deja_valides` (même valeur déjà validée : non redemandés — cause habituelle d'un « signaux : 0 » sur un fichier déjà importé), `erreurs_signaux` (raison de chaque échec).

Fiche praticien (section Doctolib) : téléphones, lieux, site, motifs, créneaux par jour, texte intégral, texte de la page de rendez-vous, autres informations ; téléphones et site Doctolib aussi en tête de fiche.

## Champs de l'import par le connecteur (16/11, version 3)

Obligatoires : `rpps`, `url_doctolib`, `releve_le` (AAAA-MM-JJ).
Facultatifs : `statut_fiche` (active | non revendiquée → non réservable | inexistante → lien retiré, comme « N'existe plus »), `reservable`, `nouveaux_patients` (oui/non), `premier_creneau` (AAAA-MM-JJ), `creneaux_7j`, `telephones`, `site_web`, `motifs`, `lieu_releve`, `motif_releve`, `lieux`, `creneaux` (« AAAA-MM-JJ HH:MM »), `texte_fiche`, `texte_creneaux`, `autres` (objet libre).
Alias acceptés : `telephone`, `tel`, `site`, `site_web_et_liens`, `motifs_reservables`, `lieu_motif_releve`, `statut`, `url`, `prochains_30_creneaux`, `fiche_texte_integral`, `page_creneaux_texte_integral`…
Tout autre champ est gardé tel quel (`autres`). La réponse contient `detail` : pour chaque ligne, le résultat, les champs enregistrés et ceux gardés tels quels. Les gros textes (« Voir plus ») passent de préférence par l'import CSV.
Les clients MCP gardent la description des outils en mémoire : ouvrir une nouvelle conversation pour voir la version à jour.
