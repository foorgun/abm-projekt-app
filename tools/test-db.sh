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
# Dritter Modus: erzeugte Demo-Daten für die echte Datenbank prüfen (laden, zählen, restlos löschen)
#   npm run seed:demo -- --sql && tools/test-db.sh --demo
if [ "${1:-}" = "--demo" ]; then
  Q=("${PSQL[@]}" -At -c)
  # ein echtes Projekt und ein echter Verkäufer, die das Löschen der Demo-Daten überstehen müssen
  "${PSQL[@]}" -c "insert into public.projects (bauherr_label) values ('Echt'); insert into public.salespeople (company_id, name) select id, 'Echter Verkäufer' from public.companies where name = 'Bien-Zenker';"
  echo "3/5 Demo-Daten laden";  "${PSQL[@]}" -f "$ROOT/supabase/.out/demo-seed.sql"
  "${Q[@]}" "select 'Geladen: ' || (select count(*) from public.projects where is_demo) || ' Projekte, ' || (select count(*) from public.invoices) || ' Rechnungen, ' || (select count(*) from public.documents) || ' Dokumente, ' || (select count(*) from public.tasks where is_demo) || ' Aufgaben, ' || (select count(*) from public.inbox_attachments) || ' Anhänge, ' || (select count(*) from public.activities where is_demo) || ' Aktivitäten'"
  "${Q[@]}" "select 'Anhänge mit Dokument verknüpft: ' || count(*) from public.inbox_attachments where document_id is not null"
  "${Q[@]}" "select 'Hausbaufirmen (alle echt, keine Demo-Dublette): ' || count(*) || ', davon is_demo ' || count(*) filter (where is_demo) from public.companies"
  echo "4/5 Zweites Laden muss scheitern (keine Dubletten)"
  if "${PSQL[@]}" -f "$ROOT/supabase/.out/demo-seed.sql" >/dev/null 2>&1; then echo "FAIL: Demo-Daten ließen sich doppelt laden"; exit 1; else echo "ok: abgelehnt, nichts doppelt"; fi
  echo "5/5 Demo-Daten löschen"; "${PSQL[@]}" -f "$ROOT/supabase/.out/demo-loeschen.sql"
  REST="$("${Q[@]}" "select (select count(*) from public.projects where is_demo) + (select count(*) from public.project_steps) + (select count(*) from public.invoices) + (select count(*) from public.documents) + (select count(*) from public.project_parties) + (select count(*) from public.tasks) + (select count(*) from public.activities) + (select count(*) from public.mailboxes) + (select count(*) from public.inbox_items) + (select count(*) from public.inbox_attachments) + (select count(*) from public.agent_runs) + (select count(*) from public.agent_rules) + (select count(*) from public.bauherren) + (select count(*) from public.team_members) + (select count(*) from public.salespeople where is_demo)")"
  ECHT="$("${Q[@]}" "select (select count(*) from public.projects where bauherr_label = 'Echt') || ' Projekt, ' || (select count(*) from public.salespeople where name = 'Echter Verkäufer') || ' Verkäufer, ' || (select count(*) from public.companies) || ' Hausbaufirmen, ' || (select count(*) from public.folder_templates) || ' Ordner'")"
  echo "Übrig von den Demo-Daten: $REST Zeilen. Echte Daten unberührt: $ECHT"
  [ "$REST" = "0" ] && [ "$ECHT" = "1 Projekt, 1 Verkäufer, 3 Hausbaufirmen, 127 Ordner" ] && echo "Demo-Daten laden und löschen: in Ordnung." && exit 0
  echo "FAIL: nach dem Löschen stimmt der Bestand nicht"; exit 1
fi
echo "3/4 Beispieldaten laden";    "${PSQL[@]}" -f "$ROOT/supabase/seed.sql"
echo "4/4 Zugriffsregeln prüfen"
OUT="$("${PSQL[@]}" -f "$ROOT/supabase/tests/rls_test.sql" 2>&1)" && STATUS=0 || STATUS=$?
echo "$OUT" | sed -E 's/^psql:[^ ]+ //' | grep -E "ok  |FAIL|bestanden|ERROR" || true
exit "$STATUS"
