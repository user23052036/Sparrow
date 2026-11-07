#!/usr/bin/env bash
# Applies migrations to a throwaway database on a local PostgreSQL 15+ and runs rls_test.sql.
# Usage: supabase/tests/run.sh   (needs createdb/psql on PATH and a superuser connection)
set -euo pipefail
cd "$(dirname "$0")"
DB=sparrow_test_$$
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase_stub.sql
for f in ../migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f rls_test.sql -o /dev/null 2>&1 | sed -n "s/.*NOTICE:  //p; /FAIL/p; /ERROR/p"
echo "ALL RLS TESTS PASSED"
