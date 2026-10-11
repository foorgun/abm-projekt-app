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
select test.throws('anon darf Projekte nicht einmal ansprechen',  $$select count(*) from public.projects$$);
select test.throws('anon darf Rechnungen nicht einmal ansprechen', $$select count(*) from public.invoices$$);
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
select test.expect('Admin sieht alle Rollen', (select count(*) from public.user_roles), 3);
select test.throws('Rollen vergibt auch der Admin nicht über die App (nur Skript oder Dashboard)',
  $$insert into public.user_roles (user_id, role) values ('00000000-0000-4000-8000-0000000000a4', 'mitarbeiter')$$);
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
select test.expect('Alle Schritte haben eine Stufe (0003)',       (select count(*) from public.step_definitions where stage is null), 0);
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
select test.expect('Mitarbeiter sieht Posteingang',   (select count(*) from public.inbox_items), 2);
select test.expect('Mitarbeiter sieht Anhänge',       (select count(*) from public.inbox_attachments), 2);
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
select test.expect('Mitarbeiter darf Schwellen NICHT ändern (nur Admin)',
  test.affected($$update public.agent_settings set auto_file_threshold = 0.5$$), 0);
select test.throws('Aktivitäten sind unveränderlich', $$update public.activities set text = 'geändert'$$);
select test.throws('Aktivitäten sind nicht löschbar',  $$delete from public.activities$$);
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
select test.throws('Ordnervorlage ändert auch der Admin noch nicht über die App (kein GRANT)',
  $$insert into public.folder_templates (path, sort, label) values ('12 Gewährleistung', 999, '12 Gewährleistung')$$);
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

-- ===========================================================================
-- Regeln der Tabellen selbst (ohne Rollenwechsel, wie der Agent mit service_role)
-- ===========================================================================
select test.throws('Mail mit gleicher message_id wird nicht doppelt gespeichert',
  $$insert into public.inbox_items (mailbox_id, message_id, received_at, from_email) values ('ab000000-0000-4000-8000-000000000001', '<seed-1@abm-demo.example>', now(), 'x@example.com')$$);
select test.throws('Postfach mit Passwort in secret_ref wird abgelehnt',
  $$insert into public.mailboxes (label, address, provider, secret_ref) values ('X', 'x@abm-demo.example', 'imap', 'password=geheim')$$);
select test.throws('Ordnerpfad der Vorlage mit .. wird abgelehnt',
  $$insert into public.folder_templates (path, sort, label) values ('08 Bauantrag/../geheim', 1000, 'x')$$);
select test.throws('Ordnerpfad eines Dokuments mit .. wird abgelehnt (0005)',
  $$insert into public.documents (project_id, name, storage_path, folder_path) values ('a0000000-0000-4000-8000-000000000001', 'x.pdf', 'x/y', '08 Bauantrag/../geheim')$$);

-- ===========================================================================
-- Migration 0004: GRANTs. anon nichts, authenticated nur was die App braucht
-- ===========================================================================
select test.expect('anon hat auf keiner Tabelle irgendein Recht',
  (select count(*) from pg_tables t, unnest(array['select','insert','update','delete','truncate','references','trigger']) p
   where t.schemaname = 'public' and has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), p)), 0);
select test.expect('anon hat auf keiner Spalte ein Recht',
  (select count(*) from information_schema.column_privileges where table_schema = 'public' and grantee in ('anon', 'PUBLIC')), 0);
select test.expect('anon darf keine Funktion der App ausführen',
  (select count(*) from pg_proc f join pg_namespace n on n.oid = f.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', f.oid, 'execute')), 0);
select test.expect('authenticated darf nur in project_steps und agent_rules löschen',
  (select count(*) from pg_tables t where t.schemaname = 'public'
     and has_table_privilege('authenticated', format('%I.%I', t.schemaname, t.tablename), 'delete')
     and t.tablename not in ('project_steps', 'agent_rules')), 0);
select test.expect('authenticated darf nirgends TRUNCATE',
  (select count(*) from pg_tables t where t.schemaname = 'public'
     and has_table_privilege('authenticated', format('%I.%I', t.schemaname, t.tablename), 'truncate')), 0);
select test.expect('service_role darf jede Tabelle lesen und schreiben',
  (select count(*) from pg_tables t where t.schemaname = 'public'
     and not has_table_privilege('service_role', format('%I.%I', t.schemaname, t.tablename), 'select, insert, update, delete')), 0);
select test.expect('Jede Tabelle hat RLS eingeschaltet',
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 0);

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
select test.throws('Mitarbeiter darf Rechnungsbetrag nicht ändern (Spaltenrecht)',
  $$update public.invoices set amount_cents = 1 where id = 'e0000000-0000-4000-8000-000000000001'$$);
select test.throws('Mitarbeiter darf kein Projekt löschen', $$delete from public.projects$$);
select test.throws('Mitarbeiter darf kein Dokument löschen', $$delete from public.documents$$);
select test.throws('secret_ref der Postfächer ist nicht lesbar', $$select secret_ref from public.mailboxes$$);
select test.expect('Postfächer ohne secret_ref lesbar',
  (select count(*) from (select id, label, address, provider, status, last_checked_at, watch_folder, is_demo from public.mailboxes) x), 1);
select test.expect('Mitarbeiter darf Postfach pausieren',
  test.affected($$update public.mailboxes set status = 'pausiert'$$), 1);
select test.throws('Mitarbeiter darf keine Mails in den Posteingang schreiben (nur der Agent)',
  $$insert into public.inbox_items (mailbox_id, message_id, received_at, from_email) values ('ab000000-0000-4000-8000-000000000001', '<x@y>', now(), 'x@example.com')$$);
select test.throws('Mitarbeiter darf keine Firma löschen', $$delete from public.companies$$);
select test.throws('Mitarbeiter darf Firmennamen nicht ändern', $$update public.companies set name = 'X' || name$$);
select test.expect('Mitarbeiter darf Schritt zurücksetzen (Zeile löschen)',
  test.affected($$delete from public.project_steps where project_id = 'a0000000-0000-4000-8000-000000000003'$$), 1);
rollback;

-- ===========================================================================
-- Migration 0005: Anzeigename, Prüfliste
-- ===========================================================================
update public.user_roles set full_name = 'Anna Admin'       where user_id = '00000000-0000-4000-8000-0000000000a1';
update public.user_roles set full_name = 'Mira Mitarbeiter' where user_id = '00000000-0000-4000-8000-0000000000a2';
update public.user_roles set full_name = 'Frank Frei'       where user_id = '00000000-0000-4000-8000-0000000000a3';

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
select test.expect('Mitarbeiter liest nur die eigene Rolle (keine Nutzerverwaltung)', (select count(*) from public.user_roles), 1);
select test.expect('Mitarbeiter sieht die Namen aller Kollegen', (select count(*) from public.list_user_names()), 3);
select test.expect('Eigener Anzeigename', (select count(*) from (select public.current_user_name() n) x where n = 'Mira Mitarbeiter'), 1);

-- Bestätigen: Dokument entsteht, Anhang abgelegt, Mail abgelegt, Lernbeispiel, Protokoll, Regel
select public.resolve_review('20000000-0000-4000-8000-000000000002', 'bestaetigen', null, null, 'absender_ordner', '04 Vermesser/02 Vermesserunterlagen erhalten am {datum}');
select test.expect('Prüfliste bestätigen: Dokument angelegt',
  (select count(*) from public.documents where source_item_id = '20000000-0000-4000-8000-000000000002' and source = 'agent'
     and folder_path = '04 Vermesser/02 Vermesserunterlagen erhalten am 08.10.2026' and received_on = '2026-10-08'), 1);
select test.expect('Prüfliste bestätigen: Anhang abgelegt und mit Dokument verknüpft',
  (select count(*) from public.inbox_attachments where id = '20000000-0000-4000-8000-000000000002' and status = 'abgelegt' and document_id is not null), 1);
select test.expect('Prüfliste bestätigen: Mail gilt als abgelegt',
  (select count(*) from public.inbox_items where id = '10000000-0000-4000-8000-000000000002' and status = 'abgelegt'), 1);
select test.expect('Prüfliste bestätigen: Lernbeispiel gespeichert',
  (select count(*) from public.agent_feedback where attachment_id = '20000000-0000-4000-8000-000000000002' and action = 'bestaetigt'), 1);
select test.expect('Prüfliste bestätigen: Aktivität mit Namen',
  (select count(*) from public.activities where actor = 'Mira Mitarbeiter' and text = 'Hoehenaufnahme.pdf nach Prüfung abgelegt'), 1);
select test.expect('Prüfliste bestätigen: Regel Absender → Ordner gemerkt',
  (select count(*) from public.agent_rules where kind = 'absender_ordner' and match = 'buero@vermessung-donautal.example'), 1);

-- Als falsch melden, dann in ein anderes Projekt ändern: dieselbe Kopie wandert, keine zweite
select public.report_wrong_filing('20000000-0000-4000-8000-000000000002');
select test.expect('Falsch gemeldet: zurück in der Prüfliste und als korrigiert gezählt',
  (select count(*) from public.inbox_attachments where id = '20000000-0000-4000-8000-000000000002' and status = 'pruefen' and corrected), 1);
select test.expect('Falsch gemeldet: Mail wieder in Prüfung',
  (select count(*) from public.inbox_items where id = '10000000-0000-4000-8000-000000000002' and status = 'pruefen'), 1);
select public.resolve_review('20000000-0000-4000-8000-000000000002', 'aendern', 'a0000000-0000-4000-8000-000000000003', '04 Vermesser');
select test.expect('Ändern: weiterhin genau ein Dokument, jetzt im anderen Projekt',
  (select count(*) from public.documents where source_item_id = '20000000-0000-4000-8000-000000000002'
     and project_id = 'a0000000-0000-4000-8000-000000000003' and folder_path = '04 Vermesser'), 1);
select test.expect('Ändern: kein zweites Dokument',
  (select count(*) from public.documents where source_item_id = '20000000-0000-4000-8000-000000000002'), 1);
select test.throws('Ändern ohne Datum im Datumsordner wird abgelehnt',
  $$select public.resolve_review('20000000-0000-4000-8000-000000000001', 'aendern', 'a0000000-0000-4000-8000-000000000001', '10 Bodengutachten/Bodengutachten erhalten am {datum}')$$);
select test.throws('Nur abgelegte Anhänge lassen sich als falsch melden',
  $$select public.report_wrong_filing('20000000-0000-4000-8000-000000000002'); select public.report_wrong_filing('20000000-0000-4000-8000-000000000002')$$);
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
select public.resolve_review('20000000-0000-4000-8000-000000000002', 'ignorieren', null, null, 'ignorieren');
select test.expect('Ignorieren: Anhang und Mail ignoriert, Regel gemerkt',
  (select count(*) from public.inbox_attachments a join public.inbox_items i on i.id = a.item_id
   where a.id = '20000000-0000-4000-8000-000000000002' and a.status = 'ignoriert' and i.status = 'ignoriert'
     and exists (select 1 from public.agent_rules where kind = 'ignorieren' and match = 'buero@vermessung-donautal.example')), 1);
select test.expect('Ignorieren legt kein Dokument an',
  (select count(*) from public.documents where source_item_id = '20000000-0000-4000-8000-000000000002'), 0);
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a3', true);
select test.expect('Freiberufler sieht nur den eigenen Namen', (select count(*) from public.list_user_names()), 1);
select test.throws('Freiberufler darf die Prüfliste nicht entscheiden',
  $$select public.resolve_review('20000000-0000-4000-8000-000000000002', 'bestaetigen')$$);
select test.throws('Freiberufler darf nichts als falsch melden',
  $$select public.report_wrong_filing('20000000-0000-4000-8000-000000000001')$$);
select test.expect('Freiberufler darf Dokument in seinem Projekt eintragen',
  test.affected($$insert into public.documents (project_id, name, storage_path, folder_path, uploaded_by)
    values ('a0000000-0000-4000-8000-000000000001', 'skizze.pdf', 'a0000000-0000-4000-8000-000000000001/u1/skizze.pdf', '05 Entwurf', '00000000-0000-4000-8000-0000000000a3')$$), 1);
select test.throws('Freiberufler darf kein Dokument in fremdem Projekt eintragen',
  $$insert into public.documents (project_id, name, storage_path, folder_path, uploaded_by)
    values ('a0000000-0000-4000-8000-000000000002', 'skizze.pdf', 'a0000000-0000-4000-8000-000000000002/u1/skizze.pdf', '05 Entwurf', '00000000-0000-4000-8000-0000000000a3')$$);
rollback;

-- ===========================================================================
-- Migration 0006: Demo-Kennzeichen
-- ===========================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select test.throws('Auch ein Admin darf über die App keine Demo-Daten kennzeichnen (Projekt anlegen)',
  $$insert into public.projects (bauherr_label, is_demo) values ('X', true)$$);
select test.throws('Kennzeichen lässt sich über die App nicht nachträglich ändern',
  $$update public.projects set is_demo = true where id = 'a0000000-0000-4000-8000-000000000001'$$);
select test.expect('Normales Anlegen bleibt möglich',
  test.affected($$insert into public.projects (bauherr_label) values ('Neu')$$), 1);
rollback;

begin;
update public.projects set is_demo = true where id = 'a0000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
select test.expect('Demo-Projekt lässt sich normal bearbeiten (Kennzeichen bleibt)',
  test.affected($$update public.projects set status = 'abgeschlossen' where id = 'a0000000-0000-4000-8000-000000000001'$$), 1);
reset role;
select test.expect('Demo-Daten löschen: genau das eine Demo-Projekt', test.affected($$delete from public.projects where is_demo$$), 1);
select test.expect('Demo-Daten löschen nimmt Rechnungen und Schritte mit',
  (select count(*) from public.invoices where project_id = 'a0000000-0000-4000-8000-000000000001')
  + (select count(*) from public.project_steps where project_id = 'a0000000-0000-4000-8000-000000000001'), 0);
select test.expect('Echte Projekte unberührt', (select count(*) from public.projects), 4);
rollback;

-- ===========================================================================
-- Migration 0007: Stammdaten beim Anlegen eines Projekts ergänzen, Projekt anlegen
-- ===========================================================================
select test.expect('0007: drei Hausbaufirmen als echte Stammdaten (kein is_demo)',
  (select count(*) from public.companies where name in ('Bien-Zenker', 'Living Haus', 'Schwabenhaus') and not is_demo), 3);

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
select test.expect('Mitarbeiter darf Hausbaufirma anlegen (nur Name)',
  test.affected($$insert into public.companies (name) values ('Fingerhaus')$$), 1);
select test.throws('Hausbaufirma mit Nummernkreis anlegen geht nicht (Spaltenrecht)',
  $$insert into public.companies (name, number_prefix) values ('Okal', '9999')$$);
select test.throws('Hausbaufirma als Demo kennzeichnen geht nicht (Spaltenrecht)',
  $$insert into public.companies (name, is_demo) values ('Okal', true)$$);
select test.throws('Gleiche Hausbaufirma zweimal wird abgelehnt', $$insert into public.companies (name) values ('Bien-Zenker')$$);
select test.throws('Leerer Name wird abgelehnt', $$insert into public.companies (name) values (' ')$$);
select test.expect('Mitarbeiter darf Verkäufer anlegen',
  test.affected($$insert into public.salespeople (company_id, name) values ('c0000000-0000-4000-8000-000000000001', 'Neuer Verkäufer')$$), 1);
select test.expect('Mitarbeiter darf Architekt anlegen',
  test.affected($$insert into public.team_members (name, role) values ('Neue Architektin', 'architekt')$$), 1);
select test.throws('Teammitglied mit Benutzerkonto verknüpfen geht nicht (Spaltenrecht)',
  $$insert into public.team_members (name, role, user_id) values ('X Y', 'architekt', '00000000-0000-4000-8000-0000000000a2')$$);
select test.throws('Mitarbeiter darf Teammitglied nicht ändern', $$update public.team_members set name = 'Anders'$$);
select test.throws('Mitarbeiter darf Teammitglied nicht löschen', $$delete from public.team_members$$);

-- Projekt nur mit Bauherr: alles andere leer, Aufgabe zum Nachfragen entsteht
select public.create_project(p_bauherr_label => ' Neumann ', p_followup_title => 'Fehlende Angaben nachfragen: ABM-Nr., Hausbaufirma, Bauort', p_followup_due => '2026-10-18');
select test.expect('Projekt nur mit Bauherr anlegen',
  (select count(*) from public.projects
   where bauherr_label = 'Neumann' and abm_nr is null and company_id is null and location is null and intake_month is null and status = 'aktiv'), 1);
select test.expect('Aufgabe "nachfragen" am neuen Projekt',
  (select count(*) from public.tasks t join public.projects p on p.id = t.project_id
   where p.bauherr_label = 'Neumann' and t.title like 'Fehlende Angaben nachfragen:%' and t.status = 'offen' and t.due_on = '2026-10-18'
     and t.source_key = 'angaben:' || p.id::text), 1);
select test.expect('Protokoll: Projekt angelegt, mit Namen',
  (select count(*) from public.activities a join public.projects p on p.id = a.project_id
   where p.bauherr_label = 'Neumann' and a.text = 'Projekt angelegt' and a.actor = 'Mira Mitarbeiter'), 1);

-- Vollständig, mit Vermesser: keine Aufgabe
select public.create_project(
     p_bauherr_label => 'Vollmer', p_abm_nr => '8161-9777', p_company => 'c0000000-0000-4000-8000-000000000001',
     p_location => 'Ulm', p_intake_month => '2026-10-01', p_architect => '70000000-0000-4000-8000-000000000001',
     p_vermesser => 'Vermessung Donautal', p_folders_note => 'Projektordner aus der Vorlage angelegt (126 Ordner)');
select test.expect('Projekt mit allen Angaben und Vermesser',
  (select count(*) from public.projects where bauherr_label = 'Vollmer' and abm_nr = '8161-9777' and location = 'Ulm'), 1);
select test.expect('Vermesser als Projektbeteiligter gespeichert',
  (select count(*) from public.project_parties x join public.projects p on p.id = x.project_id
   where p.bauherr_label = 'Vollmer' and x.role = 'vermesser' and x.name = 'Vermessung Donautal'), 1);
select test.expect('Vollständiges Projekt: keine Aufgabe',
  (select count(*) from public.tasks t join public.projects p on p.id = t.project_id where p.bauherr_label = 'Vollmer'), 0);
select test.throws('Projekt ohne Bauherr wird abgelehnt', $$select public.create_project(p_bauherr_label => ' ')$$);
select test.throws('Schlägt ein Teil fehl, entsteht gar kein Projekt (unbekannte Firma)',
  $$select public.create_project(p_bauherr_label => 'Halbfertig', p_company => '00000000-0000-4000-8000-00000000dead', p_vermesser => 'X')$$);
select test.expect('… wirklich keines', (select count(*) from public.projects where bauherr_label = 'Halbfertig'), 0);
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select test.expect('Admin darf Hausbaufirma anlegen', test.affected($$insert into public.companies (name) values ('Fingerhaus')$$), 1);
select test.expect('Admin darf Architekt anlegen', test.affected($$insert into public.team_members (name, role) values ('Neuer Architekt', 'architekt')$$), 1);
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a3', true);
select test.throws('Freiberufler darf keine Hausbaufirma anlegen', $$insert into public.companies (name) values ('Fingerhaus')$$);
select test.throws('Freiberufler darf keinen Verkäufer anlegen',
  $$insert into public.salespeople (company_id, name) values ('c0000000-0000-4000-8000-000000000001', 'X Y')$$);
select test.throws('Freiberufler darf kein Teammitglied anlegen', $$insert into public.team_members (name, role) values ('X Y', 'architekt')$$);
select test.throws('Freiberufler darf keinen Vermesser eintragen, auch nicht im eigenen Projekt',
  $$insert into public.project_parties (project_id, role, name) values ('a0000000-0000-4000-8000-000000000001', 'erdbauer', 'X Y')$$);
select test.throws('Freiberufler darf kein Projekt anlegen (Funktion)', $$select public.create_project(p_bauherr_label => 'Unzulässig')$$);
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a4', true);
select test.throws('Ohne Rolle: keine Hausbaufirma anlegen', $$insert into public.companies (name) values ('Fingerhaus')$$);
rollback;

-- Seed-Plausibilität -----------------------------------------------------------
select test.expect('Seed: 12 Schritte definiert (5 aus Excel + 7 aus 0002)', (select count(*) from public.step_definitions), 12);
select test.expect('Seed: genau eine fällige, nicht versendete Rechnung',
  (select count(*) from public.invoices where status = 'faellig' and sent_on is null), 1);

\echo ''
\echo 'Alle Datenbanktests bestanden.'
