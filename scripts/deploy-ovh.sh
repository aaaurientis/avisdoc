#!/usr/bin/env bash
# Déploiement AvisDoc sur OVH Web Cloud Multisite (Apache, SFTP).
#
# OVH sert chaque sous-domaine depuis SON PROPRE dossier (relatif au home) :
#   avisdoc.fr / www   → OVH_DIR_WWW    (défaut : www)
#   admin.avisdoc.fr   → OVH_DIR_ADMIN  (défaut : admin)
#   client.avisdoc.fr  → OVH_DIR_CLIENT (défaut : client)
#
# On build d'abord trois dossiers autonomes (scripts/build-deploy.sh), puis on
# téléverse chacun vers son sous-domaine. Chaque dossier étant propre à une
# app, le --delete est sûr (ne touche jamais aux autres sous-domaines).
#
# Usage :
#   ./scripts/deploy-ovh.sh                # admin + client (défaut)
#   ./scripts/deploy-ovh.sh all            # admin + client + www
#   ./scripts/deploy-ovh.sh admin          # une seule cible
#   ./scripts/deploy-ovh.sh client www     # plusieurs cibles
#
# Variables (dans .env.deploy ou exportées) :
#   OVH_HOST       ex. ftp.cluster129.hosting.ovh.net   (obligatoire)
#   OVH_USER       login SFTP OVH                        (obligatoire)
#   OVH_PASSWORD   mot de passe SFTP                     (obligatoire ici)
#   OVH_PORT       optionnel — 22 par défaut
#   OVH_DIR_WWW    optionnel — www
#   OVH_DIR_ADMIN  optionnel — admin
#   OVH_DIR_CLIENT optionnel — client

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env.deploy ]]; then
  # shellcheck disable=SC1091
  set -a; source .env.deploy; set +a
fi

: "${OVH_HOST:?Variable OVH_HOST manquante (cf. .env.deploy.example)}"
: "${OVH_USER:?Variable OVH_USER manquante}"
: "${OVH_PASSWORD:?Variable OVH_PASSWORD manquante (déploiement SFTP par mot de passe)}"
: "${OVH_PORT:=22}"
: "${OVH_DIR_WWW:=www}"
: "${OVH_DIR_ADMIN:=admin}"
: "${OVH_DIR_CLIENT:=client}"

if ! command -v lftp >/dev/null 2>&1; then
  echo "✗ lftp est requis. macOS → brew install lftp"
  exit 1
fi

# Cibles demandées (défaut : admin + client, la vitrine ne change pas à chaque fois).
# On ignore tout argument à partir d'un « # » : sous zsh, un commentaire collé en
# fin de ligne est passé comme argument littéral (interactive_comments off).
cibles=()
for a in "$@"; do
  [[ "$a" == \#* ]] && break
  cibles+=("$a")
done
[[ ${#cibles[@]} -eq 0 ]] && cibles=(admin client)
if [[ "${cibles[0]}" == "all" ]]; then cibles=(admin client www); fi

# Résout le dossier distant d'une cible.
dir_distant() {
  case "$1" in
    www)    echo "$OVH_DIR_WWW" ;;
    admin)  echo "$OVH_DIR_ADMIN" ;;
    client) echo "$OVH_DIR_CLIENT" ;;
    *) echo "✗ Cible inconnue : $1 (attendu : www | admin | client | all)" >&2; exit 1 ;;
  esac
}

echo "▶︎ Assemblage des dossiers par sous-domaine…"
"$ROOT_DIR/scripts/build-deploy.sh"

for cible in "${cibles[@]}"; do
  local_dir="dist-deploy/$cible"
  remote_dir="$(dir_distant "$cible")"
  if [[ ! -d "$local_dir" ]]; then
    echo "✗ $local_dir introuvable — le build a-t-il réussi ?"; exit 1
  fi
  echo
  echo "▶︎ $cible → ${OVH_USER}@${OVH_HOST}:${remote_dir}/  (port ${OVH_PORT})"
  lftp -u "${OVH_USER},${OVH_PASSWORD}" "sftp://${OVH_HOST}:${OVH_PORT}" -e "
    set sftp:auto-confirm yes;
    set net:timeout 15;
    set net:max-retries 2;
    mirror -R --delete --verbose --parallel=4 \
      --exclude-glob .DS_Store \
      ${local_dir}/ ${remote_dir}/;
    quit
  "
  echo "  ✓ $cible déployé."
done

echo
echo "✓ Terminé. Vérifie :"
for cible in "${cibles[@]}"; do
  case "$cible" in
    www)    echo "  https://avisdoc.fr" ;;
    admin)  echo "  https://admin.avisdoc.fr" ;;
    client) echo "  https://client.avisdoc.fr" ;;
  esac
done
