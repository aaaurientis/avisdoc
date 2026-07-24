#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# AvisDoc — prépare trois dossiers prêts à téléverser sur OVH Multisite.
#
# OVH sert chaque sous-domaine depuis SON PROPRE dossier (relatif au home) :
#   avisdoc.fr / www      → home/www
#   admin.avisdoc.fr      → home/admin
#   client.avisdoc.fr     → home/client
#
# Chaque dossier doit donc être autonome : son propre index.html (l'entrée de
# l'app), une copie des assets versionnés, et un .htaccess de repli SPA.
# On évite ainsi toute détection par host (fragile) : dossier = sous-domaine.
#
# Produit : dist-deploy/{www,admin,client}
# ---------------------------------------------------------------------------
set -euo pipefail

racine="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$racine"

echo "▸ Build Vite (3 entrées)…"
npm run build >/dev/null

sortie="dist-deploy"
rm -rf "$sortie"
mkdir -p "$sortie"

# .htaccess SPA autonome, identique pour chaque sous-domaine.
htaccess_spa() {
  cat <<'HT'
# AvisDoc — SPA React Router sur OVH (Apache). Dossier = sous-domaine.
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css
  AddOutputFilterByType DEFLATE application/javascript application/json image/svg+xml
</IfModule>

<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/html "access plus 0 seconds"
  ExpiresByType text/css "access plus 1 year"
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType font/woff2 "access plus 1 year"
  ExpiresByType image/png "access plus 1 month"
  ExpiresByType image/svg+xml "access plus 1 month"
</IfModule>

<IfModule mod_headers.c>
  Header set X-Content-Type-Options "nosniff"
  Header set X-Frame-Options "SAMEORIGIN"
  Header set Referrer-Policy "strict-origin-when-cross-origin"
  <FilesMatch "\.(js|css|woff2|svg|png|jpg|jpeg|webp|avif)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
</IfModule>

AddDefaultCharset UTF-8
ErrorDocument 404 /index.html
HT
}

# monter <dossier-cible> <html-entree>
#   Copie les fichiers statiques de dist/ (hors html d'entrée) puis pose
#   l'entrée voulue comme index.html + un .htaccess SPA autonome.
monter() {
  local cible="$sortie/$1" entree="$2"
  mkdir -p "$cible"
  # Tout dist/ (dont les fichiers cachés) puis on retire ce qui ne va pas
  # dans un dossier autonome : les .html d'entrée et le .htaccess partagé.
  cp -a dist/. "$cible/"
  rm -f "$cible/index.html" "$cible/admin.html" "$cible/client.html" "$cible/.htaccess"
  cp "dist/$entree" "$cible/index.html"
  htaccess_spa > "$cible/.htaccess"
  echo "  ✓ $cible  (index.html ← $entree)"
}

echo "▸ Assemblage des dossiers par sous-domaine…"
monter www    index.html
monter admin  admin.html
monter client client.html

echo
echo "Prêt. Dossiers autonomes dans $sortie/ :"
echo "  $sortie/www    → home/www    (avisdoc.fr)"
echo "  $sortie/admin  → home/admin  (admin.avisdoc.fr)"
echo "  $sortie/client → home/client (client.avisdoc.fr)"
