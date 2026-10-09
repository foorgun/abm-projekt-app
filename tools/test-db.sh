#!/usr/bin/env bash
# Prüft Schema, Seed-Daten und Zugriffsregeln gegen ein temporäres, lokales Postgres.
# Braucht nur eine Postgres-Installation (kein Docker, kein Supabase-Konto).
# Aufruf: tools/test-db.sh        (nicht als root)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${PG_BIN:-$( (ls -d /usr/lib/postgresql/*/bin /opt/homebrew/opt/postgresql*/bin /usr/local/opt/postgresql*/bin 2>/dev/null || true) | sort -V | tail -1)}"

if [ "$(id -u)" = "0" ]; then echo "Bitte nicht als root ausführen (Postgres verweigert das)."; exit 1; fi
if [ ! -x "${BIN:-/nonexistent}/initdb" ]; then echo "Postgres nicht gefunden. Setze PG_BIN auf den bin-Ordner."; exit 1; fi

TMP="$(mktemp -d)"
PORT=54329
cleanup() { "$BIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

"$BIN/initdb" -D "$TMP/data" -A trust -U postgres >/dev/null
"$BIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/pg.log" -w start >/dev/null

PSQL=(psql -h "$TMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

echo "1/4 Supabase-Ersatz laden";  "${PSQL[@]}" -f "$ROOT/supabase/tests/stub.sql"
echo "2/4 Migrationen einspielen"; for f in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done

# Zweiter Modus: erzeugte Import-Datei gegen das Schema prüfen (statt Seed und Zugriffstests)
#   tools/test-db.sh --import tools/out/import.sql
if [ "${1:-}" = "--import" ]; then
  echo "3/3 Import-Datei einspielen: $2"
  "${PSQL[@]}" -f "$2"
  "${PSQL[@]}" -At -c "select 'Projekte: ' || count(*) || ' (Storno ' || count(*) filter (where status='storno') || ', Bauvoranfragen ' || count(*) filter (where kind='bauvoranfrage') || ')' from public.projects"
  "${PSQL[@]}" -At -c "select 'Firmen: ' || (select count(*) from public.companies) || ', Verkäufer: ' || (select count(*) from public.salespeople) || ', Team: ' || (select count(*) from public.team_members) || ', Bauherren-Kontakte: ' || (select count(*) from public.bauherren) || ', Schritte: ' || (select count(*) from public.project_steps)"
  "${PSQL[@]}" -At -c "select 'Projekte je Firma: ' || string_agg(coalesce(c.name,'(ohne)') || ' ' || n, ', ' order by n desc) from (select company_id, count(*) n from public.projects group by 1) x left join public.companies c on c.id = x.company_id"
  echo "Import-Datei lässt sich fehlerfrei einspielen."
  exit 0
fi
echo "3/4 Beispieldaten laden";    "${PSQL[@]}" -f "$ROOT/supabase/seed.sql"
echo "4/4 Zugriffsregeln prüfen"
OUT="$("${PSQL[@]}" -f "$ROOT/supabase/tests/rls_test.sql" 2>&1)" && STATUS=0 || STATUS=$?
echo "$OUT" | sed -E 's/^psql:[^ ]+ //' | grep -E "ok  |FAIL|bestanden|ERROR" || true
exit "$STATUS"
