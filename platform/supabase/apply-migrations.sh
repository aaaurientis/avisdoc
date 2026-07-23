#!/usr/bin/env bash
# Applique les migrations de la plateforme dans l'ordre, via psql.
#
#   export DATABASE_URL="postgresql://postgres:MOT_DE_PASSE@db.wtovhzxymlqnfxyjxrdq.supabase.co:5432/postgres"
#   ./apply-migrations.sh
#
# La chaîne de connexion se trouve dans Supabase :
#   Project Settings > Database > Connection string > URI (mode "Session").
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Définissez DATABASE_URL (voir en-tête du script)." >&2
  exit 1
fi

ICI="$(cd "$(dirname "$0")" && pwd)"
for f in "$ICI"/migrations/*.sql; do
  echo "→ $(basename "$f")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
echo "✓ Migrations appliquées."
