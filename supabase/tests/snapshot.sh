#!/usr/bin/env bash
# Writes packages/shared/src/schema.json from the migrations (ROADMAP T4.1), or with --check fails when it is
# out of date. Needs createdb/psql on PATH and a superuser connection, like run.sh.
set -euo pipefail
cd "$(dirname "$0")"
OUT=../../packages/shared/src/schema.json
DB=sparrow_snapshot_$$
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase_stub.sql >/dev/null 2>&1
for f in ../migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null 2>&1; done
NEW=$(psql -X -A -t -v ON_ERROR_STOP=1 -d "$DB" -f snapshot.sql)
if [ "${1:-}" = "--check" ]; then
  if [ "$NEW" != "$(cat "$OUT")" ]; then
    echo "packages/shared/src/schema.json is out of date: run bash supabase/tests/snapshot.sh and describe any new column in packages/shared/src/stored.ts"
    diff <(echo "$NEW") "$OUT" | head -40 || true
    exit 1
  fi
  echo "SCHEMA SNAPSHOT UP TO DATE"
else
  echo "$NEW" > "$OUT"
  echo "wrote $OUT"
fi
