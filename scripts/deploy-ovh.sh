#!/usr/bin/env bash
# Déploiement du site AvisDoc sur OVH Web Cloud (Apache, SFTP/SSH).
#
# Usage :
#   1. Copier .env.deploy.example en .env.deploy, le remplir.
#   2. ./scripts/deploy-ovh.sh
#
# Variables attendues (dans .env.deploy ou exportées) :
#   OVH_HOST       ex. ftp.cluster021.hosting.ovh.net
#   OVH_USER       login SSH/SFTP
#   OVH_REMOTE_DIR ex. /www  (racine web sur OVH)
#   OVH_PORT       optionnel — 22 par défaut (SSH/SFTP)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Charger .env.deploy si présent
if [[ -f .env.deploy ]]; then
  # shellcheck disable=SC1091
  set -a; source .env.deploy; set +a
fi

: "${OVH_HOST:?Variable OVH_HOST manquante (cf. .env.deploy.example)}"
: "${OVH_USER:?Variable OVH_USER manquante}"
: "${OVH_REMOTE_DIR:=/www}"
: "${OVH_PORT:=22}"

echo "▶︎ Build production…"
npm run build

echo "▶︎ Déploiement vers ${OVH_USER}@${OVH_HOST}:${OVH_REMOTE_DIR} (port ${OVH_PORT})…"

# Choix de l'outil : rsync (rapide, idempotent) si dispo, sinon lftp en fallback
if command -v rsync >/dev/null 2>&1; then
  rsync -avz --delete \
    -e "ssh -p ${OVH_PORT} -o StrictHostKeyChecking=accept-new" \
    --exclude ".DS_Store" \
    --exclude ".git" \
    dist/ "${OVH_USER}@${OVH_HOST}:${OVH_REMOTE_DIR}/"
elif command -v lftp >/dev/null 2>&1; then
  lftp -c "
    set sftp:auto-confirm yes;
    open sftp://${OVH_USER}@${OVH_HOST}:${OVH_PORT};
    mirror -R --delete --verbose --exclude-glob .DS_Store dist/ ${OVH_REMOTE_DIR}/
  "
else
  echo "✗ Ni rsync ni lftp n'est installé. Installe l'un des deux :"
  echo "  macOS  → brew install rsync (ou lftp)"
  echo "  Debian → sudo apt install rsync lftp"
  exit 1
fi

echo "✓ Déploiement terminé."
echo "  Vérifie : https://avisdoc.fr (ou ton domaine pointant vers cet hébergement)"
