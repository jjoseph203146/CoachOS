#!/usr/bin/env bash
# Runs the database tests (supabase/tests/*.test.sql) against a THROWAWAY
# Postgres in Docker: applies every migration in order to an empty database,
# then each test file. Nothing touches a real Supabase project.
#
#   scripts/test-sql.sh            # postgres:15
#   PGIMAGE=postgres:16 scripts/test-sql.sh
#
# Exits non-zero if any test fails.
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="coachos-sqltest-$$"
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=pw "${PGIMAGE:-postgres:15}" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
sleep 2

psql() { docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }

psql < supabase/tests/00_supabase_shim.sql
for migration in $(ls supabase/migrations/*.sql | sort); do
  psql < "$migration" >/dev/null
  echo "applied $(basename "$migration")"
done

status=0
for test in $(ls supabase/tests/*.test.sql | sort); do
  echo "== $(basename "$test")"
  rc=0
  out=$(psql < "$test" 2>&1) || rc=$?
  echo "$out" | grep -E "PASS|FAIL|ERROR" || true
  if [ "$rc" -ne 0 ]; then
    status=1
    echo "   -> FAILED (psql exit $rc)"
  fi
done
exit $status
