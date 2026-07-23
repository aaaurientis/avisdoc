# Recette — plateforme client AvisDoc

Reprend les **critères de recette** du brief du pack et l'état de chacun.
`auto` = vérifié par un test automatisé de ce dépôt ; `infra` = à vérifier une
fois le backend Supabase et le conteneur déployés.

| # | Critère (brief) | État | Où |
|---|---|---|---|
| 1 | `build.py controles` passe sur machine vierge | **auto** | lancé au build de l'image Docker (`generation-service/Dockerfile`) |
| 2 | Le téléversement d'un logo produit les 9 documents concernés, et uniquement ceux-là | **auto** | `tests/test_generation.py::test_repartition_et_cloisonnement` |
| 3 | Aucun document `hds` atteignable depuis le web, y compris par URL directe | **auto + infra** | test : jamais publié/enregistré ; **infra** : vérifier RLS + absence de bucket `hds` sur la base live |
| 4 | Les e-mails sont servis en texte copiable, pas en PDF | **infra** | `client/src/pages/Emails.tsx` (JSON + substitution + copier) — vérifier en ligne |
| 5 | Les affiches téléchargées conservent leur fond perdu 3 mm et leurs traits de coupe | **infra** | on ne réécrit jamais les PDF côté serveur ; contrôle visuel d'une affiche générée |
| 6 | Un logo au rapport d'aspect extrême (4:1, 1:3) s'inscrit sans déformation ni chevauchement | **infra** | logique du pack (`emplacements.py`, `logo_client_pptx.py`) ; test manuel avec un logo extrême |

## Vérifications d'infra (après déploiement)

Cloisonnement `hds` (le plus important), à exécuter sur la base live :

```sql
-- Doit renvoyer 0 : aucune ligne hds ne doit jamais exister sur ce backend.
select count(*) from documents where acces = 'hds';

-- En tant qu'utilisateur client (rôle authenticated, auth.uid() = un membre),
-- une requête sur documents ne doit renvoyer que public + client de SON client,
-- jamais de hds ni les documents d'un autre client.
```

Accès direct : tenter d'ouvrir l'URL d'un objet du bucket `documents-client`
d'un autre client sans y être rattaché doit échouer (403), et aucun bucket
`hds` n'existe.

## Tests automatisés

```bash
# Génération (garde-fous logo 9/6, hds, buckets, cache)
cd platform/generation-service
pip install -r requirements-dev.txt && npm install -g pptxgenjs@3.12.0
export NODE_PATH="$(npm root -g)"
pytest tests/ -v

# Builds des frontends
cd ../admin  && npm install && npm run build
cd ../client && npm install && npm run build
```
