#!/usr/bin/env bash
# Déploie un frontend de la plateforme (admin ou client) sur OVH Web Cloud.
#
# Usage :
#   1. cp platform/.env.deploy.example platform/.env.deploy  (et le remplir)
#   2. Renseigner la clé anon dans platform/<app>/.env  (VITE_SUPABASE_ANON_KEY)
#   3. ./platform/scripts/deploy-front-ovh.sh admin
#      ./platform/scripts/deploy-front-ovh.sh client
#
# Le build embarque la clé anon (publique) ; le mirroring envoie dist/ vers le
# répertoire du sous-domaine (OVH → Multisite).
set -euo pipefail

APP="${1:?Usage: deploy-front-ovh.sh admin|client}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ -f platform/.env.deploy ]]; then
  # shellcheck disable=SC1091
  set -a; source platform/.env.deploy; set +a
fi

case "$APP" in
  admin)  REMOTE="${OVH_ADMIN_DIR:?OVH_ADMIN_DIR manquant (cf. .env.deploy.example)}" ;;
  client) REMOTE="${OVH_CLIENT_DIR:?OVH_CLIENT_DIR manquant}" ;;
  *) echo "app inconnue : '$APP' (attendu : admin | client)"; exit 1 ;;
esac
: "${OVH_HOST:?Variable OVH_HOST manquante}"
: "${OVH_USER:?Variable OVH_USER manquante}"
: "${OVH_PORT:=22}"

DIR="platform/$APP"

echo "▶︎ Build $APP…"
( cd "$DIR" && npm run build )

# Garantir le .htaccess SPA dans dist/ (Vite ne copie pas toujours les dotfiles).
cp "$DIR/public/.htaccess" "$DIR/dist/.htaccess"

echo "▶︎ Déploiement $DIR/dist → ${OVH_USER}@${OVH_HOST}:${REMOTE} (port ${OVH_PORT})…"

if [[ -n "${OVH_PASSWORD:-}" ]]; then
  command -v lftp >/dev/null || { echo "✗ lftp requis (brew install lftp)"; exit 1; }
  echo "  → mode : SFTP mot de passe (lftp)"
  LFTP_PASSWORD="$OVH_PASSWORD" lftp \
    -u "${OVH_USER},${OVH_PASSWORD}" "sftp://${OVH_HOST}:${OVH_PORT}" -e "
      set sftp:auto-confirm yes;
      set ssl:verify-certificate no;
      mirror -R --delete --verbose --parallel=4 \
        --exclude-glob .DS_Store \
        '$DIR/dist/' '${REMOTE}/';
      quit
    "
elif command -v rsync >/dev/null 2>&1; then
  echo "  → mode : rsync SSH (clé)"
  rsync -avz --delete \
    -e "ssh -p ${OVH_PORT} -o StrictHostKeyChecking=accept-new" \
    --exclude ".DS_Store" \
    "$DIR/dist/" "${OVH_USER}@${OVH_HOST}:${REMOTE}/"
else
  echo "✗ lftp (mot de passe) ou rsync (clé) requis."; exit 1
fi

echo "✓ $APP déployé."
