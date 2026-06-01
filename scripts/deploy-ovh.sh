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
#   OVH_PASSWORD   optionnel — mot de passe SFTP (pour offres OVH sans SSH key,
#                  ex. Web Cloud Éco). Si défini, utilise lftp en mode SFTP.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

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

# Mode 1 — SFTP avec mot de passe (offres OVH sans clé SSH, ex. Web Cloud Éco)
if [[ -n "${OVH_PASSWORD:-}" ]]; then
  if ! command -v lftp >/dev/null 2>&1; then
    echo "✗ lftp est requis pour le déploiement par mot de passe SFTP."
    echo "  macOS  → brew install lftp"
    echo "  Debian → sudo apt install lftp"
    exit 1
  fi

  echo "  → mode : SFTP avec mot de passe (via lftp)"
  LFTP_PASSWORD="$OVH_PASSWORD" lftp \
    -u "${OVH_USER},${OVH_PASSWORD}" \
    "sftp://${OVH_HOST}:${OVH_PORT}" \
    -e "
      set sftp:auto-confirm yes;
      set ssl:verify-certificate no;
      mirror -R --delete --verbose --parallel=4 \
        --exclude-glob .DS_Store \
        --exclude-glob .git \
        dist/ ${OVH_REMOTE_DIR}/;
      quit
    "

# Mode 2 — SSH par clé (offres OVH Pro / Performance / Cloud Web)
elif command -v rsync >/dev/null 2>&1; then
  echo "  → mode : rsync SSH (clé)"
  rsync -avz --delete \
    -e "ssh -p ${OVH_PORT} -o StrictHostKeyChecking=accept-new" \
    --exclude ".DS_Store" \
    --exclude ".git" \
    dist/ "${OVH_USER}@${OVH_HOST}:${OVH_REMOTE_DIR}/"

else
  echo "✗ Outils manquants. Installe lftp (SFTP/mot de passe) ou rsync (SSH/clé) :"
  echo "  macOS  → brew install lftp"
  echo "  Debian → sudo apt install lftp"
  exit 1
fi

echo "✓ Déploiement terminé."
echo "  Vérifie : https://avisdoc.fr (ou ton domaine pointant vers cet hébergement)"
