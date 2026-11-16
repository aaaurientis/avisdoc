# Connecteur MCP du Hub — réseau d'aval (16/11/2026)

Connecteur pour Cowork / Claude Desktop : point de collecte Doctolib, fiches à relever, import des résultats.

## Mise en service

1. Exécuter la migration `supabase/migrations/0095_mcp_cles.sql` (table `admin_mcp_cles`).
2. Admin › **Clés d'accès (MCP)** : créer une clé nommée (ex. « Cowork Arthur »). Elle ne s'affiche qu'une fois ; le Hub n'en garde que l'empreinte SHA-256. Révocation immédiate depuis la même page ; date de dernière utilisation affichée.
3. Dans Cowork / Claude Desktop (`claude_desktop_config.json`), coller la configuration proposée par la page :
   `npx -y mcp-remote https://<projet>.supabase.co/functions/v1/reseau-mcp --header Authorization:${AVISDOC_CLE}` avec `AVISDOC_CLE = "Bearer avd_…"`.
   Un client qui ne sait pas envoyer d'en-tête peut passer la clé en paramètre `?cle=avd_…` (déconseillé : l'adresse peut être journalisée).

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
