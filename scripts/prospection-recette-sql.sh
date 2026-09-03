#!/usr/bin/env bash
# Recette SQL du module de prospection sur un Postgres local jetable.
# Simule auth.jwt() et les rôles Supabase, applique la migration deux fois
# (idempotence) puis joue supabase-prospection/recette/recette.sql.
#
# Prérequis : psql et un serveur PostgreSQL ≥ 15 joignable via PGHOST/PGPORT/PGUSER.
# Usage : PGHOST=localhost PGPORT=5432 PGUSER=postgres ./scripts/prospection-recette-sql.sh
set -euo pipefail
racine="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
base="${PROSPECTION_DB:-prospection_recette}"
export PGOPTIONS="-c client_min_messages=warning"

dropdb --if-exists "$base"
createdb "$base"
psql -v ON_ERROR_STOP=1 -q -d "$base" <<'SQL'
create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
SQL
for i in 1 2; do
  psql -v ON_ERROR_STOP=1 -q -d "$base" \
    -f "$racine/supabase-prospection/supabase/migrations/0001_prospection_schema.sql" >/dev/null
done
echo "Migration appliquée deux fois : idempotente."
# Les NOTICE « n. … : OK » de la recette sont le compte rendu attendu.
PGOPTIONS="-c client_min_messages=notice" psql -v ON_ERROR_STOP=1 -q -o /dev/null -d "$base" \
  -f "$racine/supabase-prospection/recette/recette.sql" 2>&1 | sed -n 's/.*NOTICE:  //p; /ERROR\|CONTEXT\|DETAIL/p'
echo "Recette SQL : OK (transaction annulée, base $base vide)."
