-- Prüft die Zugriffsregeln. Läuft gegen ein lokales Postgres (siehe tools/test-db.sh).
-- Jeder Test bricht bei Abweichung mit einem Fehler ab.

create schema test;
grant usage on schema test to anon, authenticated;

create function test.expect(label text, actual bigint, expected bigint) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL: % (erwartet %, erhalten %)', label, expected, actual;
  end if;
  raise notice 'ok   : %', label;
end $$;

create function test.throws(label text, stmt text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok   : % (Fehler wie erwartet: %)', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % (es wurde kein Fehler ausgelöst)', label;
end $$;
-- Führt eine Änderung aus und liefert die Anzahl betroffener Zeilen
create function test.affected(stmt text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on all functions in schema test to anon, authenticated;

-- Benutzer ---------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@example.com'),
  ('00000000-0000-4000-8000-0000000000a2', 'mitarbeiter@example.com'),
  ('00000000-0000-4000-8000-0000000000a3', 'freiberufler@example.com'),
  ('00000000-0000-4000-8000-0000000000a4', 'ohne-rolle@example.com');

insert into public.user_roles (user_id, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin'),
  ('00000000-0000-4000-8000-0000000000a2', 'mitarbeiter'),
  ('00000000-0000-4000-8000-0000000000a3', 'freiberufler');

insert into public.project_members (project_id, user_id) values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a3');

insert into storage.objects (bucket_id, name) values
  ('project-documents', 'a0000000-0000-4000-8000-000000000001/grundriss.pdf'),
  ('project-documents', 'a0000000-0000-4000-8000-000000000002/lageplan.pdf');

-- Nicht angemeldet (anon) -------------------------------------------------
begin;
set local role anon;
select test.expect('anon sieht keine Projekte',  (select count(*) from public.projects), 0);
select test.expect('anon sieht keine Rechnungen', (select count(*) from public.invoices), 0);
rollback;

-- Angemeldet, aber ohne Rolle ----------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a4', true);
select test.expect('ohne Rolle: keine Projekte',    (select count(*) from public.projects), 0);
select test.expect('ohne Rolle: keine Rechnungen',  (select count(*) from public.invoices), 0);
select test.expect('ohne Rolle: keine Bauherren',   (select count(*) from public.bauherren), 0);
select test.expect('ohne Rolle: keine Dateien',     (select count(*) from storage.objects), 0);
rollback;

-- Mitarbeiter --------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
select test.expect('Mitarbeiter sieht alle Projekte',   (select count(*) from public.projects), 5);
select test.expect('Mitarbeiter sieht alle Rechnungen', (select count(*) from public.invoices), 3);
select test.expect('Mitarbeiter sieht Bauherren',       (select count(*) from public.bauherren), 2);
select test.expect('Mitarbeiter sieht alle Dateien',    (select count(*) from storage.objects), 2);
select test.throws('Mitarbeiter darf keine Rollen vergeben',
  $$insert into public.user_roles (user_id, role) values ('00000000-0000-4000-8000-0000000000a4', 'admin')$$);
select test.throws('Rechnung "versendet" ohne Versanddatum wird abgelehnt',
  $$update public.invoices set status = 'versendet' where id = 'e0000000-0000-4000-8000-000000000001'$$);
select test.expect('Mitarbeiter darf Rechnung korrekt als versendet markieren',
  test.affected($$update public.invoices set status = 'versendet', sent_on = '2026-10-09'
                  where id = 'e0000000-0000-4000-8000-000000000001'$$), 1);
rollback;

-- Admin --------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select test.expect('Admin darf Rolle vergeben',
  test.affected($$insert into public.user_roles (user_id, role)
                  values ('00000000-0000-4000-8000-0000000000a4', 'mitarbeiter')$$), 1);
rollback;

-- Freiberufler (nur Projekt 1) -------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a3', true);
select test.expect('Freiberufler sieht nur sein Projekt',        (select count(*) from public.projects), 1);
select test.expect('Freiberufler sieht Schritte seines Projekts', (select count(*) from public.project_steps), 5);
select test.expect('Freiberufler sieht KEINE Rechnungen',         (select count(*) from public.invoices), 0);
select test.expect('Freiberufler sieht KEINE Bauherren-Kontakte', (select count(*) from public.bauherren), 0);
select test.expect('Freiberufler sieht keine Firmenstammdaten',   (select count(*) from public.companies), 0);
select test.expect('Freiberufler sieht die Schrittnamen',         (select count(*) from public.step_definitions), 12);
select test.expect('Freiberufler sieht nur Dateien seines Projekts', (select count(*) from storage.objects), 1);
select test.throws('Freiberufler darf kein Projekt anlegen',
  $$insert into public.projects (bauherr_label) values ('Unzulässig')$$);
select test.expect('Freiberufler kann kein Projekt ändern',
  test.affected($$update public.projects set location = 'X'$$), 0);
select test.expect('Freiberufler darf Datei in seinem Projekt ablegen',
  test.affected($$insert into storage.objects (bucket_id, name)
                  values ('project-documents', 'a0000000-0000-4000-8000-000000000001/neu.pdf')$$), 1);
select test.throws('Freiberufler darf nicht in fremdes Projekt ablegen',
  $$insert into storage.objects (bucket_id, name) values ('project-documents', 'a0000000-0000-4000-8000-000000000002/neu.pdf')$$);
select test.throws('Freiberufler darf Dokument nicht unter fremdem Namen eintragen',
  $$insert into public.documents (project_id, name, storage_path, uploaded_by)
    values ('a0000000-0000-4000-8000-000000000001', 'x.pdf', 'a0000000-0000-4000-8000-000000000001/x.pdf',
            '00000000-0000-4000-8000-0000000000a2')$$);
rollback;


-- ===========================================================================
-- Migration 0002: Ordnervorlage, Aufgaben, Aktivitäten, Agent
-- ===========================================================================

-- Ohne Rolle --------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a4', true);
select test.expect('ohne Rolle: keine Ordnervorlage', (select count(*) from public.folder_templates), 0);
select test.expect('ohne Rolle: keine Aufgaben',      (select count(*) from public.tasks), 0);
select test.expect('ohne Rolle: keine Postfächer',    (select count(*) from public.mailboxes), 0);
rollback;

-- Mitarbeiter ---------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
select test.expect('Mitarbeiter sieht Ordnervorlage (126 Ordner)', (select count(*) from public.folder_templates), 126);
select test.expect('Mitarbeiter sieht Aufgaben',      (select count(*) from public.tasks), 2);
select test.expect('Mitarbeiter sieht Aktivitäten',   (select count(*) from public.activities), 1);
select test.expect('Mitarbeiter sieht Postfächer',    (select count(*) from public.mailboxes), 1);
select test.expect('Mitarbeiter sieht Posteingang',   (select count(*) from public.inbox_items), 1);
select test.expect('Mitarbeiter sieht Anhänge',       (select count(*) from public.inbox_attachments), 1);
select test.expect('Mitarbeiter sieht Agent-Läufe',   (select count(*) from public.agent_runs), 1);
select test.expect('Mitarbeiter sieht Agent-Regeln',  (select count(*) from public.agent_rules), 2);
select test.expect('Mitarbeiter darf Aufgabe anlegen',
  test.affected($$insert into public.tasks (title, due_on) values ('Neue Aufgabe', '2026-10-10')$$), 1);
select test.throws('Aufgabe aus derselben Warnung wird nicht doppelt angelegt',
  $$insert into public.tasks (title, source, source_key) values ('Doppelt', 'warnung', 'invoice_unsent:e0000000-0000-4000-8000-000000000001')$$);
select test.throws('Erledigt ohne Erledigt-Datum wird abgelehnt',
  $$update public.tasks set status = 'erledigt' where id = 'f0000000-0000-4000-8000-000000000002'$$);
select test.expect('Mitarbeiter darf Aufgabe korrekt erledigen',
  test.affected($$update public.tasks set status = 'erledigt', done_at = now() where id = 'f0000000-0000-4000-8000-000000000002'$$), 1);
select test.expect('Mitarbeiter darf Regel anlegen',
  test.affected($$insert into public.agent_rules (kind, match, project_id) values ('absender_projekt', 'p.lang@bien-zenker.example', 'a0000000-0000-4000-8000-000000000001')$$), 1);
select test.throws('Regel "Absender → Projekt" ohne Projekt wird abgelehnt',
  $$insert into public.agent_rules (kind, match) values ('absender_projekt', 'x@example.com')$$);
select test.throws('Regel mit Großbuchstaben/Leerzeichen wird abgelehnt',
  $$insert into public.agent_rules (kind, match) values ('ignorieren', ' News@Example.com')$$);
select test.throws('Regel auf Ordner außerhalb der Vorlage wird abgelehnt',
  $$insert into public.agent_rules (kind, match, folder_path) values ('absender_ordner', 'x@example.com', '99 Erfunden')$$);
select test.throws('Mail mit gleicher message_id wird nicht doppelt gespeichert',
  $$insert into public.inbox_items (mailbox_id, message_id, received_at, from_email) values ('ab000000-0000-4000-8000-000000000001', '<seed-1@abm-demo.example>', now(), 'x@example.com')$$);
select test.throws('Postfach mit Passwort in secret_ref wird abgelehnt',
  $$insert into public.mailboxes (label, address, provider, secret_ref) values ('X', 'x@abm-demo.example', 'imap', 'password=geheim')$$);
select test.expect('Mitarbeiter darf Schwellen NICHT ändern (nur Admin)',
  test.affected($$update public.agent_settings set auto_file_threshold = 0.5$$), 0);
select test.expect('Aktivitäten sind unveränderlich',
  test.affected($$update public.activities set text = 'geändert'$$), 0);
select test.expect('Aktivitäten sind nicht löschbar',
  test.affected($$delete from public.activities$$), 0);
select test.throws('Mitarbeiter darf Ordnervorlage nicht ändern',
  $$insert into public.folder_templates (path, sort, label) values ('12 Neu', 99, '12 Neu')$$);
rollback;

-- Admin ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select test.expect('Admin darf Schwellen ändern',
  test.affected($$update public.agent_settings set auto_file_threshold = 0.95$$), 1);
select test.throws('Schwellen in falscher Reihenfolge werden abgelehnt',
  $$update public.agent_settings set suggest_threshold = 0.97$$);
select test.expect('Admin darf Ordnervorlage ergänzen',
  test.affected($$insert into public.folder_templates (path, sort, label) values ('12 Gewährleistung', 999, '12 Gewährleistung')$$), 1);
select test.throws('Ordnerpfad mit .. wird abgelehnt',
  $$insert into public.folder_templates (path, sort, label) values ('08 Bauantrag/../geheim', 1000, 'x')$$);
rollback;

-- Freiberufler (nur Projekt 1) -------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a3', true);
select test.expect('Freiberufler sieht Ordnervorlage',               (select count(*) from public.folder_templates), 126);
select test.expect('Freiberufler sieht Beteiligte nur seines Projekts', (select count(*) from public.project_parties), 2);
select test.expect('Freiberufler sieht Dokumente seines Projekts',   (select count(*) from public.documents), 1);
select test.expect('Freiberufler sieht KEINE Aufgaben',              (select count(*) from public.tasks), 0);
select test.expect('Freiberufler sieht KEINE Aktivitäten',           (select count(*) from public.activities), 0);
select test.expect('Freiberufler sieht KEINE Postfächer',            (select count(*) from public.mailboxes), 0);
select test.expect('Freiberufler sieht KEINEN Posteingang',          (select count(*) from public.inbox_items), 0);
select test.expect('Freiberufler sieht KEINE Anhänge',               (select count(*) from public.inbox_attachments), 0);
select test.expect('Freiberufler sieht KEINE Agent-Regeln',          (select count(*) from public.agent_rules), 0);
select test.expect('Freiberufler sieht KEINE Schwellen',             (select count(*) from public.agent_settings), 0);
select test.throws('Freiberufler darf keine Aufgabe anlegen',
  $$insert into public.tasks (title) values ('Unzulässig')$$);
select test.throws('Freiberufler darf keine Agent-Regel anlegen',
  $$insert into public.agent_rules (kind, match) values ('ignorieren', 'x@example.com')$$);
select test.throws('Freiberufler darf keine Beteiligten ändern',
  $$insert into public.project_parties (project_id, role, name) values ('a0000000-0000-4000-8000-000000000001', 'wasser', 'X')$$);
rollback;

-- Seed-Plausibilität -----------------------------------------------------------
select test.expect('Seed: 12 Schritte definiert (5 aus Excel + 7 aus 0002)', (select count(*) from public.step_definitions), 12);
select test.expect('Seed: genau eine fällige, nicht versendete Rechnung',
  (select count(*) from public.invoices where status = 'faellig' and sent_on is null), 1);

\echo ''
\echo 'Alle Datenbanktests bestanden.'
