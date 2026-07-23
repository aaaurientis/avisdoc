# Service de génération documentaire

Exécute la chaîne du pack AvisDoc (`paquet/build.py`) pour décliner les
documents d'un client avec son logo, et les publie dans Supabase Storage.

Conçu pour **Scaleway Serverless Containers** (scale-to-zero) : un appel HTTP
= un job. Déclenché par un **Supabase Database Webhook** sur `INSERT` dans
`generation_jobs`.

## Flux

1. Le statut CRM d'un client passe à `signe` → un trigger crée une ligne
   `generation_jobs` (voir migrations `0004_triggers.sql`).
2. Le webhook Supabase appelle `POST /generate` avec l'en-tête
   `X-Webhook-Secret` et le corps `{ "record": { "id", "client_id", ... } }`.
3. Le service :
   - télécharge le logo depuis le bucket `logos` ;
   - **valide** le logo (fond transparent, hauteur ≥ 200 px — brief §Validation) ;
   - exécute `build.py client <NOM> --logo <logo>` dans une copie isolée du pack ;
   - téléverse chaque document **non-`hds`** dans le bon bucket
     (`documents-public` / `documents-client`) et insère une ligne `documents` ;
   - respecte le **cache** : rien n'est régénéré pour un couple
     `(document, empreinte du logo, version)` déjà présent.

## Garde-fous (repris du brief du pack)

- Les documents de niveau **`hds`** (comptes-rendus, lettre d'adressage) ne sont
  **jamais** publiés ni enregistrés.
- La **règle logo 9/15** vient du `CATALOGUE` (`logo_client`) : aucune surcharge.
- On passe **toujours par les générateurs** du pack (jamais de réécriture de PDF
  côté serveur, sinon perte des polices embarquées, du fond perdu et des traits
  de coupe des affiches).

## Endpoints

| Méthode | Chemin | Rôle |
|---|---|---|
| `GET` | `/health` | sonde |
| `POST` | `/generate` | traite un job (auth par `X-Webhook-Secret`) |

## Variables d'environnement

Voir `.env.example`. `SUPABASE_SERVICE_ROLE_KEY` est **secrète** (contourne la
RLS) : uniquement côté serveur, jamais exposée aux frontends.

## Local

```bash
pip install -r requirements.txt
npm install pptxgenjs@3.12.0 --prefix .    # ou NODE_PATH vers un pptxgenjs global
export $(grep -v '^#' .env | xargs)
uvicorn app:app --reload --port 8080
```

## Docker

```bash
docker build -t avisdoc-generation .
docker run -p 8080:8080 --env-file .env avisdoc-generation
```

Le `Dockerfile` lance `build.py controles` à la construction : l'image ne se
construit pas si le pack n'est pas sain.

## Tests

`tests/test_generation.py` exécute la vraie chaîne (`build.py client`) en mockant
Supabase, et vérifie les garde-fous : 9 documents logotés + 3 non-logotés publiés,
**0 document `hds`**, mapping des buckets, empreinte du logo, respect du cache.

```bash
pip install -r requirements-dev.txt
npm install -g pptxgenjs@3.12.0
export NODE_PATH="$(npm root -g)"     # pour que build.py trouve pptxgenjs
pytest tests/ -v                       # ~20 s (régénère les documents)
```

## Pack vendorisé

`paquet/` contient la chaîne documentaire (`build.py` + `scripts/` + `assets/`).
Le `CATALOGUE` de `build.py` reste la **source de vérité** : tout nouveau
document s'ajoute là, pas dans le service ni dans les frontends.
