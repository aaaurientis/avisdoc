# Aperçu des documents Office (auto-hébergé, sans tiers)

Le back-office prévisualise les documents **directement dans la plateforme** :

| Format | Méthode | Tiers ? |
|---|---|---|
| PDF | affichage natif du navigateur (iframe) | non |
| Word `.docx` | rendu dans le navigateur (`docx-preview`) | **non** |
| Excel `.xlsx` | rendu dans le navigateur (SheetJS) | **non** |
| PowerPoint `.ppt/.pptx` | conversion en PDF via **Gotenberg auto-hébergé** | **non** (chez vous) |

Word et Excel ne demandent **aucune infrastructure**. PowerPoint nécessite un
petit service de conversion **que vous hébergez** (aucun fichier n'est envoyé à
un service externe).

## 1. Héberger Gotenberg

[Gotenberg](https://gotenberg.dev) est un service open-source (basé LibreOffice)
qui convertit des documents en PDF via une API HTTP. Un seul container.

### Option A — Docker / docker-compose (VPS, OVH, etc.)

```yaml
# docker-compose.yml
services:
  gotenberg:
    image: gotenberg/gotenberg:8
    restart: unless-stopped
    command:
      - "gotenberg"
      - "--api-port=3000"
      # Restreint aux modules utiles + limite les risques SSRF.
      - "--chromium-disable-javascript=true"
    ports:
      - "3000:3000"
```

Placez-le derrière un reverse-proxy HTTPS (Caddy/Nginx/Traefik) → vous obtenez une
URL du type `https://gotenberg.mon-domaine.fr`. **Protégez l'accès** (Basic Auth
au niveau du proxy, ou réseau privé), car l'endpoint convertit tout fichier reçu.

### Option B — Fly.io / Cloud Run

Déployez l'image `gotenberg/gotenberg:8` (port 3000). Ces plateformes fournissent
directement une URL HTTPS. Activez une auth (jeton/Basic) ou l'IAM.

## 2. Renseigner les secrets Supabase

Projet admin → **Edge Functions → Secrets** (ou `supabase secrets set`) :

```
GOTENBERG_URL=https://gotenberg.mon-domaine.fr
# Optionnel, si le service est derrière Basic Auth :
GOTENBERG_USER=...
GOTENBERG_PASSWORD=...
```

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis automatiquement à la
fonction.

## 3. Déployer la migration + la fonction

- Migration `supabase/migrations/0019_doc_preview.sql` (ajoute `preview_path`) —
  à exécuter dans le SQL Editor du projet admin.
- La fonction `convertir-pdf` est déployée automatiquement par le workflow
  GitHub Actions (push sur `main`), avec toutes les autres.

## Fonctionnement

À l'ouverture de l'aperçu d'un PowerPoint, le front appelle la fonction
`convertir-pdf` :

1. contrôle du domaine `@avisdoc.fr` ;
2. si un PDF d'aperçu existe déjà (`preview_path`) → URL signée renvoyée (cache) ;
3. sinon : le fichier est téléchargé depuis le bucket `admin-documents`, envoyé à
   **votre** Gotenberg, le PDF est stocké dans le même bucket
   (`<id>/preview.pdf`) et `preview_path` est mémorisé.

Tant que `GOTENBERG_URL` n'est pas défini, l'aperçu PowerPoint affiche un repli
« conversion à venir » + téléchargement — sans erreur bloquante.
