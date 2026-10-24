-- Prüft die Zugriffsregeln. Läuft gegen ein lokales Postgres (siehe tools/test-db.sh).
-- Jeder Test bricht bei Abweichung mit einem Fehler ab.

create schema test;
grant usage on schema test to anon, authenticated, service_role;

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
grant execute on all functions in schema test to anon, authenticated, service_role;

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
select test.expect('Mitarbeiter sieht Ordnervorlage (127 Ordner)', (select count(*) from public.folder_templates), 127);
select test.expect('Mitarbeiter sieht Aufgaben',      (select count(*) from public.tasks), 2);
-- Seed-Eintrag plus "Zugewiesen" aus dem Trigger auf project_members (0016)
select test.expect('Mitarbeiter sieht Aktivitäten',   (select count(*) from public.activities), 2);
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
select test.expect('Freiberufler sieht Ordnervorlage',               (select count(*) from public.folder_templates), 127);
select test.expect('Freiberufler sieht Beteiligte nur seines Projekts', (select count(*) from public.project_parties), 2);
select test.expect('Freiberufler sieht Dokumente seines Projekts',   (select count(*) from public.documents), 1);
select test.expect('Freiberufler sieht KEINE Aufgaben',              (select count(*) from public.tasks), 0);
-- seit 0016: Verlauf des zugewiesenen Projekts (ohne Rechnungen und Aufgaben), nichts aus fremden Projekten
select test.expect('Freiberufler sieht Aktivitäten nur seines Projekts', (select count(*) from public.activities), 2);
select test.expect('Freiberufler sieht keine Aktivitäten fremder Projekte',
  (select count(*) from public.activities where project_id is distinct from 'a0000000-0000-4000-8000-000000000001'), 0);
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
select test.expect('authenticated darf nur in project_steps, agent_rules und project_parties löschen',
  (select count(*) from pg_tables t where t.schemaname = 'public'
     and has_table_privilege('authenticated', format('%I.%I', t.schemaname, t.tablename), 'delete')
     and t.tablename not in ('project_steps', 'agent_rules', 'project_parties')), 0);
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
select public.create_project('{"bauherr_label": " Neumann "}', p_followup_title => 'Fehlende Angaben nachfragen: ABM-Nr., Hausbaufirma, Bauort', p_followup_due => '2026-10-18');
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
     '{"bauherr_label": "Vollmer", "abm_nr": "8161-9777", "company_id": "c0000000-0000-4000-8000-000000000001",
       "location": "Ulm", "intake_month": "2026-10-01", "architect_id": "70000000-0000-4000-8000-000000000001"}',
     p_vermesser => 'Vermessung Donautal', p_folders_note => 'Projektordner aus der Vorlage angelegt (126 Ordner)');
select test.expect('Projekt mit allen Angaben und Vermesser',
  (select count(*) from public.projects where bauherr_label = 'Vollmer' and abm_nr = '8161-9777' and location = 'Ulm'), 1);
select test.expect('Vermesser als Projektbeteiligter gespeichert',
  (select count(*) from public.project_parties x join public.projects p on p.id = x.project_id
   where p.bauherr_label = 'Vollmer' and x.role = 'vermesser' and x.name = 'Vermessung Donautal'), 1);
select test.expect('Vollständiges Projekt: keine Aufgabe',
  (select count(*) from public.tasks t join public.projects p on p.id = t.project_id where p.bauherr_label = 'Vollmer'), 0);
select test.throws('Projekt ohne Bauherr wird abgelehnt', $$select public.create_project('{"bauherr_label": " "}')$$);
select test.throws('Schlägt ein Teil fehl, entsteht gar kein Projekt (unbekannte Firma)',
  $$select public.create_project('{"bauherr_label": "Halbfertig", "company_id": "00000000-0000-4000-8000-00000000dead"}', p_vermesser => 'X')$$);
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
select test.throws('Freiberufler darf kein Projekt anlegen (Funktion)', $$select public.create_project('{"bauherr_label": "Unzulässig"}')$$);
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a4', true);
select test.throws('Ohne Rolle: keine Hausbaufirma anlegen', $$insert into public.companies (name) values ('Fingerhaus')$$);
rollback;

-- ===========================================================================
-- Migration 0008: Projektdaten bearbeiten, Kontaktdaten des Bauherrn, Aufgabe schließt sich
-- ===========================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);

-- Anlegen mit Kontaktdaten
select public.create_project('{"bauherr_label": "Kontakt"}',
  '{"phone": " 0731 111111 ", "email": "", "address": "Weg 1, 89073 Ulm", "building_address": null}',
  p_followup_title => 'Fehlende Angaben nachfragen: Bauadresse, Hausbaufirma, Verkäufer, Vermesser', p_followup_due => '2026-10-18');
select test.expect('Anlegen mit Kontaktdaten: Bauherr angelegt und verknüpft, leere Werte sind null',
  (select count(*) from public.projects p join public.bauherren b on b.id = p.bauherr_id
   where p.bauherr_label = 'Kontakt' and b.name = 'Kontakt' and b.phone = '0731 111111' and b.email is null
     and b.address = 'Weg 1, 89073 Ulm' and b.building_address is null and not b.is_demo), 1);
select public.create_project('{"bauherr_label": "Ohnekontakt"}', '{"phone": "", "email": " "}');
select test.expect('Anlegen ohne Kontaktangaben legt keinen leeren Bauherrn an',
  (select count(*) from public.projects where bauherr_label = 'Ohnekontakt' and bauherr_id is null), 1);

-- Bearbeiten: nur genannte Felder ändern sich, Aufgabe wird umbenannt
select public.update_project((select id from public.projects where bauherr_label = 'Kontakt'),
  '{"location": " Neu-Ulm ", "company_id": "c0000000-0000-4000-8000-000000000001", "salesperson_id": "50000000-0000-4000-8000-000000000001"}',
  '{"phone": "0731 111111", "address": "Weg 1, 89073 Ulm", "building_address": "Baugebiet 7, 89231 Neu-Ulm"}',
  null, 'Projektdaten geändert: Bauort, Hausbaufirma, Verkäufer, Bauadresse',
  'Fehlende Angaben nachfragen: Vermesser', '2026-10-18');
select test.expect('Bearbeiten: genannte Felder geändert, andere unberührt',
  (select count(*) from public.projects where bauherr_label = 'Kontakt' and location = 'Neu-Ulm'
     and company_id = 'c0000000-0000-4000-8000-000000000001' and salesperson_id is not null and status = 'aktiv' and kind = 'neubau'), 1);
select test.expect('Bearbeiten: Bauadresse am selben Bauherrn nachgetragen (kein zweiter)',
  (select count(*) from public.bauherren where name = 'Kontakt' and building_address = 'Baugebiet 7, 89231 Neu-Ulm'), 1);
select test.expect('Bearbeiten: Aufgabe umbenannt, weiterhin genau eine und offen',
  (select count(*) from public.tasks t join public.projects p on p.id = t.project_id
   where p.bauherr_label = 'Kontakt' and t.title = 'Fehlende Angaben nachfragen: Vermesser' and t.status = 'offen'), 1);
select test.expect('… wirklich nur eine',
  (select count(*) from public.tasks t join public.projects p on p.id = t.project_id where p.bauherr_label = 'Kontakt'), 1);
select test.expect('Bearbeiten: Protokolleintrag mit Namen',
  (select count(*) from public.activities where text = 'Projektdaten geändert: Bauort, Hausbaufirma, Verkäufer, Bauadresse' and actor = 'Mira Mitarbeiter'), 1);

-- Letzte Angabe nachgetragen: Aufgabe schließt sich
select public.update_project((select id from public.projects where bauherr_label = 'Kontakt'),
  p_parties => '{"vermesser": {"name": " Vermessung Donautal ", "contact": ""}, "strom": {"name": "Stromnetz", "contact": "0731 2"}}',
  p_activity => 'Projektdaten geändert: Vermesser, Strom');
select test.expect('Beteiligte eingetragen (Name bereinigt, leerer Kontakt null)',
  (select count(*) from public.project_parties x join public.projects p on p.id = x.project_id
   where p.bauherr_label = 'Kontakt' and ((x.role = 'vermesser' and x.name = 'Vermessung Donautal' and x.contact is null)
                                       or (x.role = 'strom' and x.contact = '0731 2'))), 2);
select test.expect('Nichts fehlt mehr: Aufgabe automatisch erledigt, mit Erledigt-Datum',
  (select count(*) from public.tasks t join public.projects p on p.id = t.project_id
   where p.bauherr_label = 'Kontakt' and t.status = 'erledigt' and t.done_at is not null), 1);

-- Später fehlt wieder etwas: die erledigte Aufgabe bleibt erledigt, es entsteht keine zweite
select public.update_project((select id from public.projects where bauherr_label = 'Kontakt'),
  p_parties => '{"strom": null}', p_followup_title => 'Fehlende Angaben nachfragen: Vermesser', p_followup_due => '2026-10-20');
select test.expect('Beteiligter ausgetragen', (select count(*) from public.project_parties x join public.projects p on p.id = x.project_id
   where p.bauherr_label = 'Kontakt' and x.role = 'strom'), 0);
select test.expect('Erledigte Aufgabe wird nicht neu angelegt',
  (select count(*) from public.tasks t join public.projects p on p.id = t.project_id where p.bauherr_label = 'Kontakt' and t.status = 'offen'), 0);

-- Älteres Projekt ohne Aufgabe (wie "Hoffmann"): beim ersten Speichern entsteht sie
select public.update_project('a0000000-0000-4000-8000-000000000003', '{"location": "Ehningen"}', null, null, null,
  'Fehlende Angaben nachfragen: Telefon oder E-Mail des Bauherrn, Bauadresse, Vermesser', '2026-10-18');
select test.expect('Projekt ohne Aufgabe bekommt sie beim Bearbeiten',
  (select count(*) from public.tasks where source_key = 'angaben:a0000000-0000-4000-8000-000000000003' and status = 'offen'), 1);

select test.throws('Bearbeiten: leerer Bauherr wird abgelehnt',
  $$select public.update_project('a0000000-0000-4000-8000-000000000003', '{"bauherr_label": " "}')$$);
select test.throws('Bearbeiten: unbekanntes Projekt', $$select public.update_project('00000000-0000-4000-8000-00000000dead', '{"location": "X"}')$$);
select test.throws('Bearbeiten: unbekannte Rolle eines Beteiligten',
  $$select public.update_project('a0000000-0000-4000-8000-000000000003', p_parties => '{"geheim": {"name": "X Y"}}')$$);
select public.update_project('a0000000-0000-4000-8000-000000000003', '{"status": "storno", "is_demo": true, "bauherr_id": null}');
select test.expect('Nicht vorgesehene Felder (Status, is_demo, bauherr_id) werden ignoriert',
  (select count(*) from public.projects where id = 'a0000000-0000-4000-8000-000000000003' and status = 'aktiv' and not is_demo), 1);
rollback;

-- Admin sieht und pflegt Kontaktdaten
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select test.expect('Admin sieht Kontaktdaten der Bauherren', (select count(*) from public.bauherren where phone is not null), 2);
select public.update_project('a0000000-0000-4000-8000-000000000001', p_bauherr => '{"name": "Familie Reinhardt", "phone": "0731 999999", "email": "neu@example.com"}');
select test.expect('Admin ändert Kontaktdaten', (select count(*) from public.bauherren where id = 'b0000000-0000-4000-8000-000000000001' and phone = '0731 999999' and email = 'neu@example.com' and address is null), 1);
select test.throws('Bauherr löschen geht nicht', $$delete from public.bauherren$$);
rollback;

-- Freiberufler: sieht Kontaktdaten nie und kann nichts bearbeiten, auch nicht im zugewiesenen Projekt
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a3', true);
select test.expect('Freiberufler sieht sein Projekt', (select count(*) from public.projects where id = 'a0000000-0000-4000-8000-000000000001'), 1);
select test.expect('Freiberufler sieht keine einzige Bauherren-Zeile', (select count(*) from public.bauherren), 0);
select test.expect('Freiberufler: auch gezielt nach ID nichts',
  (select count(*) from public.bauherren where id = (select bauherr_id from public.projects where id = 'a0000000-0000-4000-8000-000000000001')), 0);
select test.throws('Freiberufler darf keine Kontaktdaten eintragen',
  $$insert into public.bauherren (name, phone) values ('X Y', '1')$$);
select test.expect('Freiberufler ändert keine Kontaktdaten', test.affected($$update public.bauherren set phone = '0'$$), 0);
select test.throws('Freiberufler darf Projektdaten nicht bearbeiten',
  $$select public.update_project('a0000000-0000-4000-8000-000000000001', '{"location": "X"}')$$);
select test.throws('Freiberufler darf Kontaktdaten nicht über die Funktion setzen',
  $$select public.set_project_bauherr('a0000000-0000-4000-8000-000000000001', '{"phone": "1"}')$$);
select test.throws('Freiberufler darf die Aufgabe nicht abgleichen',
  $$select public.sync_followup_task('a0000000-0000-4000-8000-000000000001', 'X', null)$$);
rollback;

-- Neues Projekt aus Dokument (Migration 0010) -----------------------------------
-- Entwürfe, Dokumenttyp, Flurstück/Gemarkung, zweiter Bauherr, Protokoll der Auslesungen, Entwurfsspeicher

begin;
set local role anon;
select test.throws('anon darf Entwürfe nicht ansprechen',        $$select count(*) from public.project_drafts$$);
select test.throws('anon darf das Auslese-Protokoll nicht ansprechen', $$select count(*) from public.extraction_log$$);
rollback;

-- Mitarbeiter: Entwurf anlegen, fortsetzen, abschließen; Projekt mit den neuen Feldern
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
insert into public.project_drafts (fields, form, doc_type, file_name, file_size, file_mime)
values ('{"felder": {"bauherrLabel": {"wert": "Hoffmann", "quelle": null, "sicherheit": "mittel"}}}', '{"project": {"bauherrLabel": "Hoffmann"}}', 'werkvertrag', 'scan.pdf', 1234, 'application/pdf');
select test.expect('Mitarbeiter legt einen Entwurf an (Ersteller wird gesetzt, Status offen)',
  (select count(*) from public.project_drafts where status = 'offen' and created_by = '00000000-0000-4000-8000-0000000000a2' and storage_path is null), 1);
select test.expect('Mitarbeiter setzt Formularstand und Speicherpfad',
  test.affected($$update public.project_drafts set form = '{"project": {"bauherrLabel": "Hofmann"}}', storage_path = 'drafts/x/scan.pdf' where file_name = 'scan.pdf'$$), 1);
select test.throws('Entwurf: Felder müssen ein Objekt sein', $$update public.project_drafts set fields = '[]'$$);
select test.throws('Entwurf: negative Dateigröße wird abgelehnt', $$insert into public.project_drafts (file_name, file_size) values ('x.pdf', -1)$$);
select test.throws('Entwurf löschen geht nicht (nur Status)', $$delete from public.project_drafts$$);
select test.throws('Entwurf: Ersteller lässt sich nicht umschreiben', $$update public.project_drafts set created_by = '00000000-0000-4000-8000-0000000000a1'$$);

insert into storage.objects (bucket_id, name) values ('project-documents', 'drafts/x/scan.pdf');
select test.expect('Mitarbeiter sieht die Datei des Entwurfs im Speicher', (select count(*) from storage.objects where name = 'drafts/x/scan.pdf'), 1);

select public.create_project(
  '{"bauherr_label": "Hoffmann", "kind": "neubau", "flurstueck": " 412/3 ", "gemarkung": "Blaustein"}',
  '{"name": "Jonas Hoffmann", "phone": "0731 000111", "name2": "Anna Hoffmann", "phone2": " 0171 0001112 ", "email2": ""}',
  null, 'Fehlende Angaben nachfragen: Bauadresse, Hausbaufirma, Verkäufer, Vermesser', '2026-10-19');
select test.expect('Projekt mit Flurstück und Gemarkung (bereinigt)',
  (select count(*) from public.projects where bauherr_label = 'Hoffmann' and flurstueck = '412/3' and gemarkung = 'Blaustein'), 1);
select test.expect('Zweiter Bauherr liegt bei den Kontaktdaten (leere E-Mail wird null)',
  (select count(*) from public.bauherren b join public.projects p on p.bauherr_id = b.id
   where p.flurstueck = '412/3' and b.name2 = 'Anna Hoffmann' and b.phone2 = '0171 0001112' and b.email2 is null), 1);
select test.expect('Aufgabenregel läuft wie bei manuell angelegten Projekten',
  (select count(*) from public.tasks t join public.projects p on p.id = t.project_id where p.flurstueck = '412/3' and t.status = 'offen' and t.source_key like 'angaben:%'), 1);
select test.expect('Vertrag anlegen erzeugt keine Rechnung',
  (select count(*) from public.invoices i join public.projects p on p.id = i.project_id where p.flurstueck = '412/3'), 0);

select public.update_project((select id from public.projects where flurstueck = '412/3'), '{"gemarkung": "Söflingen", "flurstueck": null}',
  '{"name": "Jonas Hoffmann", "phone": "0731 000111", "name2": null, "phone2": null, "email2": "anna@example.com"}');
select test.expect('Bearbeiten: Gemarkung geändert, Flurstück geleert',
  (select count(*) from public.projects where bauherr_label = 'Hoffmann' and gemarkung = 'Söflingen' and flurstueck is null), 1);
select test.expect('Bearbeiten: zweiter Bauherr geändert',
  (select count(*) from public.bauherren where name = 'Jonas Hoffmann' and name2 is null and email2 = 'anna@example.com'), 1);

insert into public.documents (project_id, name, storage_path, folder_path, doc_type, meta, uploaded_by)
select id, 'scan.pdf', id::text || '/x/scan.pdf', '00 Verträge', 'werkvertrag', '{"vertragsdatum": "2026-10-02", "vertragspreis": "312.450,00 €"}', auth.uid()
from public.projects where bauherr_label = 'Hoffmann' and gemarkung = 'Söflingen';
select test.expect('Dokument mit Typ und Metadaten abgelegt',
  (select count(*) from public.documents where doc_type = 'werkvertrag' and meta->>'vertragsdatum' = '2026-10-02' and folder_path = '00 Verträge'), 1);
select test.throws('Dokument: unbekannter Typ wird abgelehnt',
  $$insert into public.documents (project_id, name, storage_path, doc_type, uploaded_by) values ('a0000000-0000-4000-8000-000000000001', 'x.pdf', 'a/x.pdf', 'rechnung', auth.uid())$$);
select test.throws('Dokument: Metadaten müssen ein Objekt sein',
  $$insert into public.documents (project_id, name, storage_path, meta, uploaded_by) values ('a0000000-0000-4000-8000-000000000001', 'x.pdf', 'a/y.pdf', '"text"', auth.uid())$$);
select test.expect('Ordner 00 Verträge steht in der Vorlage', (select count(*) from public.folder_templates where path = '00 Verträge' and parent_path is null), 1);

select test.expect('Entwurf abschließen (übernommen, Projekt und Dokument gesetzt)',
  test.affected($$update public.project_drafts set status = 'uebernommen', storage_path = null,
                  project_id = (select id from public.projects where bauherr_label = 'Hoffmann' and gemarkung = 'Söflingen'),
                  document_id = (select id from public.documents where doc_type = 'werkvertrag') where file_name = 'scan.pdf'$$), 1);

-- Protokoll der Auslesungen: kein Client schreibt, Mitarbeiter sehen nichts
select test.throws('Mitarbeiter darf das Auslese-Protokoll nicht beschreiben',
  $$insert into public.extraction_log (user_id, model) values ('00000000-0000-4000-8000-0000000000a2', 'x')$$);
select test.expect('Mitarbeiter sieht im Auslese-Protokoll keine Zeile', (select count(*) from public.extraction_log), 0);
rollback;

-- Die Funktion (service_role) schreibt das Protokoll; Admin liest es, kann es aber nicht ändern
begin;
set local role service_role;
insert into public.extraction_log (user_id, model, images, input_tokens, output_tokens, cost_eur)
values ('00000000-0000-4000-8000-0000000000a2', 'claude-sonnet-5-5', 1, 2000, 900, 0.013);
insert into public.project_drafts (file_name, file_size, created_by) values ('fremd.pdf', 10, '00000000-0000-4000-8000-0000000000a2');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
insert into storage.objects (bucket_id, name) values ('project-documents', 'drafts/y/fremd.pdf');
select test.expect('Admin legt eine Datei im Entwurfsspeicher ab', (select count(*) from storage.objects where name = 'drafts/y/fremd.pdf'), 1);
select test.expect('Admin liest das Auslese-Protokoll', (select count(*) from public.extraction_log where cost_eur = 0.013), 1);
select test.throws('Admin darf das Auslese-Protokoll nicht beschreiben', $$insert into public.extraction_log (user_id, model) values ('00000000-0000-4000-8000-0000000000a1', 'x')$$);
select test.throws('Admin darf das Auslese-Protokoll nicht ändern', $$update public.extraction_log set cost_eur = 0$$);
select test.throws('Admin darf das Auslese-Protokoll nicht löschen', $$delete from public.extraction_log$$);
select test.expect('Admin sieht Entwürfe anderer', (select count(*) from public.project_drafts where file_name = 'fremd.pdf'), 1);

-- Freiberufler: nichts lesen, nichts schreiben, auch nicht im Entwurfsspeicher
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a3', true);
select test.expect('Freiberufler sieht keinen Entwurf', (select count(*) from public.project_drafts), 0);
select test.throws('Freiberufler darf keinen Entwurf anlegen', $$insert into public.project_drafts (file_name, file_size) values ('x.pdf', 1)$$);
select test.expect('Freiberufler ändert keinen Entwurf', test.affected($$update public.project_drafts set status = 'verworfen'$$), 0);
select test.expect('Freiberufler sieht im Auslese-Protokoll nichts', (select count(*) from public.extraction_log), 0);
select test.throws('Freiberufler darf das Auslese-Protokoll nicht beschreiben', $$insert into public.extraction_log (user_id, model) values ('00000000-0000-4000-8000-0000000000a3', 'x')$$);
select test.expect('Freiberufler sieht keine Entwurfsdatei im Speicher', (select count(*) from storage.objects where name like 'drafts/%'), 0);
select test.throws('Freiberufler darf nichts im Entwurfsspeicher ablegen', $$insert into storage.objects (bucket_id, name) values ('project-documents', 'drafts/z/x.pdf')$$);
select test.throws('Freiberufler darf nichts in einem fremden Projekt ablegen', $$insert into storage.objects (bucket_id, name) values ('project-documents', 'a0000000-0000-4000-8000-000000000002/x.pdf')$$);
select test.expect('Freiberufler sieht den zweiten Bauherrn nicht', (select count(*) from public.bauherren where name2 is not null or name2 is null), 0);
select test.expect('Freiberufler sieht Flurstück und Gemarkung seines Projekts (kein Kontaktdatum)', (select count(*) from public.projects where id = 'a0000000-0000-4000-8000-000000000001' and flurstueck is null), 1);
select test.throws('Freiberufler darf kein Projekt aus einem Entwurf anlegen', $$select public.create_project('{"bauherr_label": "Hoffmann", "flurstueck": "1/2"}')$$);

-- ohne Rolle: wie Freiberufler ohne Zuweisung
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a4', true);
select test.expect('Ohne Rolle: kein Entwurf sichtbar', (select count(*) from public.project_drafts), 0);
select test.throws('Ohne Rolle: kein Entwurf anlegbar', $$insert into public.project_drafts (file_name, file_size) values ('x.pdf', 1)$$);
rollback;

-- Projekt löschen (Migration 0011): nur Admin, alles Abhängige geht mit ----------------
begin;
set local role anon;
select test.throws('anon darf kein Projekt löschen', $$select public.delete_project('a0000000-0000-4000-8000-000000000001')$$);
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
select test.throws('Mitarbeiter darf kein Projekt löschen', $$select public.delete_project('a0000000-0000-4000-8000-000000000001')$$);
select test.throws('Mitarbeiter: auch nicht direkt in der Tabelle', $$delete from public.projects where id = 'a0000000-0000-4000-8000-000000000001'$$);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a3', true);
select test.throws('Freiberufler darf kein Projekt löschen, auch nicht sein zugewiesenes', $$select public.delete_project('a0000000-0000-4000-8000-000000000001')$$);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a4', true);
select test.throws('Ohne Rolle: kein Projekt löschen', $$select public.delete_project('a0000000-0000-4000-8000-000000000001')$$);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select test.expect('Nach den abgewiesenen Versuchen ist das Projekt noch da', (select count(*) from public.projects where id = 'a0000000-0000-4000-8000-000000000001'), 1);
select test.throws('Admin: auch nicht direkt in der Tabelle (nur über die Funktion)', $$delete from public.projects where id = 'a0000000-0000-4000-8000-000000000001'$$);
select test.throws('Admin: unbekanntes Projekt wird gemeldet', $$select public.delete_project('00000000-0000-4000-8000-00000000dead')$$);
rollback;

-- Admin löscht ein Projekt mit allem, was daran hängt
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
-- Abhängiges anlegen, damit jede Tabelle wirklich etwas zu löschen hat
insert into public.documents (project_id, name, storage_path, folder_path, uploaded_by)
values ('a0000000-0000-4000-8000-000000000001', 'vertrag.pdf', 'a0000000-0000-4000-8000-000000000001/x/vertrag.pdf', '00 Verträge', auth.uid());
insert into public.tasks (project_id, title) values ('a0000000-0000-4000-8000-000000000001', 'Löschtest');
select public.log_activity('a0000000-0000-4000-8000-000000000001', 'projekt', 'Löschtest');  -- seit 0016 nicht mehr direkt
insert into public.project_drafts (file_name, file_size, storage_path, status) values ('entwurf.pdf', 5, 'drafts/d1/entwurf.pdf', 'offen');
update public.project_drafts set project_id = 'a0000000-0000-4000-8000-000000000001' where file_name = 'entwurf.pdf';
insert into public.project_drafts (file_name, file_size, storage_path) values ('anderer.pdf', 5, 'drafts/d2/anderer.pdf');
select public.update_project('a0000000-0000-4000-8000-000000000001', p_parties => '{"vermesser": {"name": "Löschtest Vermessung"}}');

create temp table before_delete on commit drop as
select (select count(*) from public.projects) as projects,
       (select count(*) from public.bauherren) as bauherren,
       (select bauherr_id from public.projects where id = 'a0000000-0000-4000-8000-000000000001') as bauherr,
       (select count(*) from public.invoices where project_id <> 'a0000000-0000-4000-8000-000000000001') as other_invoices,
       (select count(*) from public.inbox_attachments) as attachments;
select test.expect('Vorher: das Projekt hat Schritte, Rechnungen, Dokumente, Aufgaben, Aktivitäten, Beteiligte, Zuweisung',
  (select (count(*) filter (where n > 0)) from (values
    ((select count(*) from public.project_steps   where project_id = 'a0000000-0000-4000-8000-000000000001')),
    ((select count(*) from public.invoices        where project_id = 'a0000000-0000-4000-8000-000000000001')),
    ((select count(*) from public.documents       where project_id = 'a0000000-0000-4000-8000-000000000001')),
    ((select count(*) from public.tasks           where project_id = 'a0000000-0000-4000-8000-000000000001')),
    ((select count(*) from public.activities      where project_id = 'a0000000-0000-4000-8000-000000000001')),
    ((select count(*) from public.project_parties where project_id = 'a0000000-0000-4000-8000-000000000001')),
    ((select count(*) from public.project_members where project_id = 'a0000000-0000-4000-8000-000000000001'))) v(n)), 7);

create temp table deleted_paths on commit drop as select unnest(public.delete_project('a0000000-0000-4000-8000-000000000001')) as path;
select test.expect('Die Funktion nennt die Speicherpfade von Dokument und Entwurf',
  (select count(*) from deleted_paths where path in ('a0000000-0000-4000-8000-000000000001/x/vertrag.pdf', 'drafts/d1/entwurf.pdf')), 2);
select test.expect('… und keinen fremden Pfad', (select count(*) from deleted_paths where path = 'drafts/d2/anderer.pdf'), 0);
select test.expect('Projekt gelöscht', (select count(*) from public.projects where id = 'a0000000-0000-4000-8000-000000000001'), 0);
select test.expect('Genau ein Projekt weniger', (select count(*) from public.projects), (select projects - 1 from before_delete));
select test.expect('Abhängige Zeilen sind weg (Schritte, Rechnungen, Dokumente, Aufgaben, Aktivitäten, Beteiligte, Zuweisungen, Regeln)',
  (select count(*) from public.project_steps   where project_id = 'a0000000-0000-4000-8000-000000000001')
  + (select count(*) from public.invoices        where project_id = 'a0000000-0000-4000-8000-000000000001')
  + (select count(*) from public.documents       where project_id = 'a0000000-0000-4000-8000-000000000001')
  + (select count(*) from public.tasks           where project_id = 'a0000000-0000-4000-8000-000000000001')
  + (select count(*) from public.activities      where project_id = 'a0000000-0000-4000-8000-000000000001')
  + (select count(*) from public.project_parties where project_id = 'a0000000-0000-4000-8000-000000000001')
  + (select count(*) from public.project_members where project_id = 'a0000000-0000-4000-8000-000000000001')
  + (select count(*) from public.agent_rules     where project_id = 'a0000000-0000-4000-8000-000000000001'), 0);
select test.expect('Entwurf zu diesem Projekt aufgeräumt, der andere bleibt',
  (select count(*) from public.project_drafts where file_name = 'entwurf.pdf') * 10 + (select count(*) from public.project_drafts where file_name = 'anderer.pdf'), 1);
select test.expect('Bauherr-Kontakt mitgelöscht (hing an keinem anderen Projekt)',
  (select count(*) from public.bauherren where id = (select bauherr from before_delete)), 0);
select test.expect('Genau ein Bauherr weniger', (select count(*) from public.bauherren), (select bauherren - 1 from before_delete));
select test.expect('Rechnungen anderer Projekte unberührt', (select count(*) from public.invoices), (select other_invoices from before_delete));
select test.expect('Posteingang bleibt erhalten', (select count(*) from public.inbox_attachments), (select attachments from before_delete));
select test.expect('… ohne Verweis auf das gelöschte Projekt',
  (select count(*) from public.inbox_attachments where project_id = 'a0000000-0000-4000-8000-000000000001')
  + (select count(*) from public.inbox_items where project_id = 'a0000000-0000-4000-8000-000000000001'), 0);
rollback;

-- Ein Bauherr mit zwei Projekten bleibt, bis das letzte Projekt gelöscht ist
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
update public.projects set bauherr_id = (select bauherr_id from public.projects where id = 'a0000000-0000-4000-8000-000000000001')
  where id = 'a0000000-0000-4000-8000-000000000002';
select public.delete_project('a0000000-0000-4000-8000-000000000001');
select test.expect('Bauherr bleibt, solange ein anderes Projekt an ihm hängt',
  (select count(*) from public.bauherren b join public.projects p on p.bauherr_id = b.id where p.id = 'a0000000-0000-4000-8000-000000000002'), 1);
create temp table shared_bauherr on commit drop as select bauherr_id as id from public.projects where id = 'a0000000-0000-4000-8000-000000000002';
select public.delete_project('a0000000-0000-4000-8000-000000000002');
select test.expect('… und geht mit dem letzten Projekt', (select count(*) from public.bauherren where id = (select id from shared_bauherr)), 0);
rollback;

-- Urlaub und Krankheit (Migration 0012) ------------------------------------------
-- a1 = Admin, a2 = Mitarbeiter, a3 = Freiberufler, a4 = ohne Rolle, a5 = zweiter Admin
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000a5', 'admin2@example.com');
insert into public.user_roles (user_id, role, full_name) values ('00000000-0000-4000-8000-0000000000a5', 'admin', 'Zweiter Admin');
update public.user_roles set full_name = 'Erste Adminin' where user_id = '00000000-0000-4000-8000-0000000000a1';
update public.user_roles set full_name = 'Mia Mitarbeiterin' where user_id = '00000000-0000-4000-8000-0000000000a2';

select test.expect('Werktage: eine Woche', public.werktage('2026-10-12', '2026-10-16')::bigint, 5);
select test.expect('Werktage: Karwoche bis Ostermontag 2026', public.werktage('2026-03-30', '2026-04-06')::bigint, 4);
select test.expect('Werktage: Heiligabend zählt, 25.12. nicht', public.werktage('2026-12-21', '2026-12-25')::bigint, 4);
select test.expect('Werktage: über den Jahreswechsel', public.werktage('2026-12-28', '2027-01-08')::bigint, 8);
select test.expect('Werktage: Wochenende', public.werktage('2026-10-17', '2026-10-18')::bigint, 0);

begin;
set local role anon;
select test.throws('anon darf Abwesenheiten nicht ansprechen', $$select count(*) from public.abwesenheiten$$);
select test.throws('anon darf den Urlaubsanspruch nicht ansprechen', $$select count(*) from public.urlaubs_anspruch$$);
select test.throws('anon darf den Kalender nicht aufrufen', $$select * from public.kalender_abwesenheiten('2026-01-01', '2026-12-31')$$);
rollback;

begin;
-- Ausgangslage als Skript (service_role): Ansprüche und eine Krankmeldung der Mitarbeiterin
set local role service_role;
insert into public.urlaubs_anspruch (user_id, jahr) values
  ('00000000-0000-4000-8000-0000000000a1', 2026), ('00000000-0000-4000-8000-0000000000a2', 2026), ('00000000-0000-4000-8000-0000000000a5', 2026);

-- Mitarbeiterin: eigener Antrag, Werktage rechnet die Datenbank
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select test.expect('Anspruch: Standard 30 Tage, kein Übertrag', (select count(*) from public.urlaubs_anspruch where tage = 30 and uebertrag = 0), 3);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
insert into public.abwesenheiten (user_id, art, von, bis, notiz) values ('00000000-0000-4000-8000-0000000000a2', 'urlaub', '2026-12-28', '2027-01-08', ' Skiurlaub ');
select test.expect('Antrag angelegt: Status offen, 8 Werktage von der Datenbank, Notiz bereinigt',
  (select count(*) from public.abwesenheiten where user_id = auth.uid() and status = 'offen' and werktage = 8 and notiz = 'Skiurlaub' and entscheidung_von is null), 1);
select test.throws('Status lässt sich beim Anlegen nicht mitgeben (kein Spaltenrecht)',
  $$insert into public.abwesenheiten (user_id, art, von, bis, status) values (auth.uid(), 'urlaub', '2026-06-01', '2026-06-05', 'genehmigt')$$);
select test.throws('Werktage lassen sich nicht mitgeben (kein Spaltenrecht)',
  $$insert into public.abwesenheiten (user_id, art, von, bis, werktage) values (auth.uid(), 'urlaub', '2026-06-01', '2026-06-05', 1)$$);
select test.throws('Antrag für eine andere Person wird abgelehnt',
  $$insert into public.abwesenheiten (user_id, art, von, bis) values ('00000000-0000-4000-8000-0000000000a1', 'urlaub', '2026-06-01', '2026-06-05')$$);
select test.throws('Ende vor Beginn wird abgelehnt', $$insert into public.abwesenheiten (user_id, art, von, bis) values (auth.uid(), 'urlaub', '2026-06-05', '2026-06-01')$$);
select test.throws('Urlaub ohne Ende wird abgelehnt', $$insert into public.abwesenheiten (user_id, art, von) values (auth.uid(), 'urlaub', '2026-06-01')$$);
select test.throws('Zeitraum ohne Werktag wird abgelehnt', $$insert into public.abwesenheiten (user_id, art, von, bis) values (auth.uid(), 'urlaub', '2026-10-17', '2026-10-18')$$);
select test.throws('Überschneidung mit eigenem Antrag wird abgelehnt', $$insert into public.abwesenheiten (user_id, art, von, bis) values (auth.uid(), 'urlaub', '2027-01-08', '2027-01-12')$$);
select test.throws('Mitarbeiterin kann sich nicht selbst genehmigen', $$update public.abwesenheiten set status = 'genehmigt' where user_id = auth.uid()$$);
select test.throws('Mitarbeiterin kann den eigenen Antrag nicht ablehnen', $$update public.abwesenheiten set status = 'abgelehnt' where user_id = auth.uid()$$);
select test.throws('Zeitraum eines Antrags lässt sich nicht ändern', $$update public.abwesenheiten set bis = '2027-01-15' where user_id = auth.uid() and art = 'urlaub'$$);
select test.throws('Antrag löschen geht nicht', $$delete from public.abwesenheiten$$);
select test.throws('Mitarbeiterin darf keinen Anspruch setzen', $$insert into public.urlaubs_anspruch (user_id, jahr, tage) values (auth.uid(), 2027, 99)$$);
select test.expect('Mitarbeiterin ändert keinen Anspruch', test.affected($$update public.urlaubs_anspruch set tage = 99$$), 0);
select test.expect('Mitarbeiterin sieht nur den eigenen Anspruch', (select count(*) from public.urlaubs_anspruch), 1);

-- Krankmeldung: sofort wirksam, ohne Notiz, Ende offen
insert into public.abwesenheiten (user_id, art, von) values (auth.uid(), 'krank', '2026-09-01');
select test.expect('Krankmeldung ist sofort wirksam, ohne Werktage und ohne Ende',
  (select count(*) from public.abwesenheiten where user_id = auth.uid() and art = 'krank' and status = 'genehmigt' and bis is null and werktage is null and notiz is null), 1);
select test.throws('Krankmeldung mit Notiz wird abgelehnt (keine Diagnose)',
  $$insert into public.abwesenheiten (user_id, art, von, bis, notiz) values (auth.uid(), 'krank', '2026-03-02', '2026-03-03', 'Grippe')$$);
select test.expect('Wieder gesund ab: Ende nachtragen', test.affected($$update public.abwesenheiten set bis = '2026-09-04' where user_id = auth.uid() and art = 'krank'$$), 1);
select test.throws('Krankmeldung: Ende vor Beginn', $$update public.abwesenheiten set bis = '2026-08-30' where user_id = auth.uid() and art = 'krank'$$);
select test.throws('Krankmeldung braucht keine Entscheidung', $$update public.abwesenheiten set status = 'abgelehnt' where user_id = auth.uid() and art = 'krank'$$);
select test.expect('Mitarbeiterin sieht genau ihre zwei Einträge', (select count(*) from public.abwesenheiten), 2);

-- Erste Adminin: eigener Antrag; sie darf ihn nicht selbst entscheiden
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
insert into public.abwesenheiten (user_id, art, von, bis) values (auth.uid(), 'urlaub', '2026-11-02', '2026-11-06');
select test.expect('Adminin sieht alle Einträge, auch die Krankmeldung', (select count(*) from public.abwesenheiten), 3);
select test.throws('Adminin kann den EIGENEN Antrag nicht genehmigen', $$update public.abwesenheiten set status = 'genehmigt' where user_id = auth.uid()$$);
select test.throws('Adminin kann den EIGENEN Antrag nicht ablehnen', $$update public.abwesenheiten set status = 'abgelehnt' where user_id = auth.uid()$$);
select test.expect('Eigener Antrag ist danach noch offen', (select count(*) from public.abwesenheiten where user_id = auth.uid() and status = 'offen'), 1);
select test.expect('Adminin genehmigt den fremden Antrag',
  test.affected($$update public.abwesenheiten set status = 'genehmigt', ablehn_grund = 'egal' where user_id = '00000000-0000-4000-8000-0000000000a2' and art = 'urlaub'$$), 1);
select test.expect('Entscheidung vermerkt: wer und wann, ohne Ablehngrund',
  (select count(*) from public.abwesenheiten where user_id = '00000000-0000-4000-8000-0000000000a2' and status = 'genehmigt'
     and entscheidung_von = '00000000-0000-4000-8000-0000000000a1' and entscheidung_am is not null and ablehn_grund is null and art = 'urlaub'), 1);
select test.throws('Entschiedener Antrag lässt sich nicht noch einmal entscheiden',
  $$update public.abwesenheiten set status = 'abgelehnt' where user_id = '00000000-0000-4000-8000-0000000000a2' and art = 'urlaub'$$);
select test.throws('Adminin kann einen fremden Antrag nicht zurückziehen',
  $$update public.abwesenheiten set status = 'zurueckgezogen' where user_id = '00000000-0000-4000-8000-0000000000a2' and art = 'urlaub'$$);
select test.expect('Adminin setzt den Anspruch einer Person', test.affected($$update public.urlaubs_anspruch set tage = 28, uebertrag = 2.5 where user_id = '00000000-0000-4000-8000-0000000000a2'$$), 1);
select test.throws('Anspruch: negative Tage werden abgelehnt', $$update public.urlaubs_anspruch set tage = -1$$);

-- Zweiter Admin entscheidet den Antrag der ersten Adminin (Ablehnung mit Begründung)
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a5', true);
select test.expect('Zweiter Admin lehnt den Antrag der ersten Adminin ab',
  test.affected($$update public.abwesenheiten set status = 'abgelehnt', ablehn_grund = ' Abnahmetermin ' where user_id = '00000000-0000-4000-8000-0000000000a1'$$), 1);
select test.expect('Ablehngrund bereinigt gespeichert',
  (select count(*) from public.abwesenheiten where user_id = '00000000-0000-4000-8000-0000000000a1' and status = 'abgelehnt' and ablehn_grund = 'Abnahmetermin'
     and entscheidung_von = '00000000-0000-4000-8000-0000000000a5'), 1);

-- Kalender: Admin sieht den Grund, Mitarbeiterin nicht
select test.expect('Kalender (Admin): genehmigter Urlaub und Krankmeldung, mit Art',
  (select count(*) from public.kalender_abwesenheiten('2026-01-01', '2027-12-31') where art in ('urlaub', 'krank') and name = 'Mia Mitarbeiterin'), 2);
select test.expect('Kalender: abgelehnte Anträge fehlen', (select count(*) from public.kalender_abwesenheiten('2026-01-01', '2027-12-31') where name = 'Erste Adminin'), 0);
select test.expect('Kalender: nur der abgefragte Zeitraum', (select count(*) from public.kalender_abwesenheiten('2026-09-01', '2026-09-30')), 1);

-- Mitarbeiterin: zieht einen offenen Antrag zurück, sieht fremde Zeilen nicht, Kalender ohne Art
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
insert into public.abwesenheiten (user_id, art, von, bis) values (auth.uid(), 'urlaub', '2026-07-06', '2026-07-10');
select test.expect('Offenen Antrag zurückziehen', test.affected($$update public.abwesenheiten set status = 'zurueckgezogen' where user_id = auth.uid() and von = '2026-07-06'$$), 1);
select test.throws('Zurückgezogener Antrag lässt sich nicht wieder öffnen', $$update public.abwesenheiten set status = 'offen' where user_id = auth.uid() and von = '2026-07-06'$$);
select test.throws('Genehmigten Antrag kann man nicht mehr zurückziehen', $$update public.abwesenheiten set status = 'zurueckgezogen' where user_id = auth.uid() and von = '2026-12-28'$$);
select test.expect('Nach dem Zurückziehen ist der Zeitraum wieder frei',
  test.affected($$insert into public.abwesenheiten (user_id, art, von, bis) values (auth.uid(), 'urlaub', '2026-07-06', '2026-07-08')$$), 1);
select test.expect('Mitarbeiterin sieht keine fremden Anträge oder Krankmeldungen', (select count(*) from public.abwesenheiten where user_id <> auth.uid()), 0);
select test.expect('Mitarbeiterin ändert keine fremden Zeilen', test.affected($$update public.abwesenheiten set status = 'zurueckgezogen' where user_id <> auth.uid()$$), 0);
select test.expect('Kalender (Mitarbeiterin): Einträge da …', (select count(*) from public.kalender_abwesenheiten('2026-01-01', '2027-12-31')), 2);
select test.expect('… aber ohne Art', (select count(*) from public.kalender_abwesenheiten('2026-01-01', '2027-12-31') where art is not null), 0);

-- Krankmeldung ohne Ende verrät sich im Kalender nicht durch ein fehlendes Ende
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a5', true);
insert into public.abwesenheiten (user_id, art, von) values (auth.uid(), 'krank', current_date - 2);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
select test.expect('Kalender: offene Krankmeldung erscheint bis heute, ohne Art',
  (select count(*) from public.kalender_abwesenheiten(current_date - 5, current_date + 5) where name = 'Zweiter Admin' and bis = current_date and art is null), 1);
select test.expect('Die Krankmeldung des Admins sieht die Mitarbeiterin in der Tabelle nicht', (select count(*) from public.abwesenheiten where art = 'krank' and user_id <> auth.uid()), 0);

-- Freiberufler und ohne Rolle: nichts lesen, nichts schreiben, kein Kalender
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a3', true);
select test.expect('Freiberufler sieht keine Abwesenheit', (select count(*) from public.abwesenheiten), 0);
select test.expect('Freiberufler sieht keinen Anspruch', (select count(*) from public.urlaubs_anspruch), 0);
select test.throws('Freiberufler darf keinen Urlaub beantragen', $$insert into public.abwesenheiten (user_id, art, von, bis) values (auth.uid(), 'urlaub', '2026-06-01', '2026-06-05')$$);
select test.throws('Freiberufler darf sich nicht krank melden', $$insert into public.abwesenheiten (user_id, art, von) values (auth.uid(), 'krank', '2026-06-01')$$);
select test.expect('Freiberufler ändert nichts', test.affected($$update public.abwesenheiten set status = 'genehmigt'$$), 0);
select test.throws('Freiberufler darf den Kalender nicht aufrufen', $$select * from public.kalender_abwesenheiten('2026-01-01', '2026-12-31')$$);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a4', true);
select test.expect('Ohne Rolle: keine Abwesenheit sichtbar', (select count(*) from public.abwesenheiten), 0);
select test.throws('Ohne Rolle: kein Urlaubsantrag', $$insert into public.abwesenheiten (user_id, art, von, bis) values (auth.uid(), 'urlaub', '2026-06-01', '2026-06-05')$$);
select test.throws('Ohne Rolle: kein Kalender', $$select * from public.kalender_abwesenheiten('2026-01-01', '2026-12-31')$$);
rollback;

-- Planungsprotokoll (Migrationen 0013 und 0014) -----------------------------------
-- Datenübernahme aus den alten Feldern (läuft in der Migration vor dem Seed, hier gegen die Testdaten)
begin;
update public.bauherren set basement_builder = ' Keller Alt ', surveyor = 'Vermesser Alt' where id = 'b0000000-0000-4000-8000-000000000001';
select public.stammdaten_0013_uebernehmen();
select public.stammdaten_0013_uebernehmen();
select test.expect('Übernahme: Anschrift "Straße, PLZ Ort" aufgeteilt, alte Zeile bleibt',
  (select count(*) from public.bauherren where id = 'b0000000-0000-4000-8000-000000000001' and street = 'Lindenweg 12' and postal_code = '89073' and city = 'Ulm' and address = 'Lindenweg 12, 89073 Ulm'), 1);
select test.expect('Übernahme: E-Mail aus der Kontaktzeile, Kontaktzeile bleibt',
  (select count(*) from public.project_parties where project_id = 'a0000000-0000-4000-8000-000000000001' and role = 'vermesser' and email = 'vermessung@example.com' and phone is null and contact = 'vermessung@example.com'), 1);
select test.expect('Übernahme: Kellerbauer aus der Altspalte, genau einmal (zweimal aufgerufen)',
  (select count(*) from public.project_parties where project_id = 'a0000000-0000-4000-8000-000000000001' and role = 'kellerbauer' and name = 'Keller Alt'), 1);
select test.expect('Übernahme: vorhandener Vermesser wird nicht ersetzt',
  (select count(*) from public.project_parties where project_id = 'a0000000-0000-4000-8000-000000000001' and role = 'vermesser' and name = 'Vermessungsbüro Albrecht & Partner'), 1);
update public.bauherren set street = 'Eigene Straße 1' where id = 'b0000000-0000-4000-8000-000000000001';
select public.stammdaten_0013_uebernehmen();
select test.expect('Übernahme überschreibt nichts, was schon eingetragen ist',
  (select count(*) from public.bauherren where id = 'b0000000-0000-4000-8000-000000000001' and street = 'Eigene Straße 1'), 1);
rollback;

begin;
set local role anon;
select test.throws('anon darf die Bürodaten nicht ansprechen', $$select count(*) from public.buero_daten$$);
select test.throws('anon darf Planungsprotokolle nicht ansprechen', $$select count(*) from public.planungsprotokolle$$);
select test.throws('anon darf die Datenübernahme nicht aufrufen', $$select public.stammdaten_0013_uebernehmen()$$);
rollback;

begin;
insert into storage.objects (bucket_id, name) values ('vorlagen', 'planungsprotokoll/schwabenhaus.pdf');
set local role authenticated;

-- Mitarbeiterin: Beteiligte mit neuen Rollen und getrennten Feldern, Bauherr und Bauort getrennt, Protokoll anlegen
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
select test.expect('Mitarbeiterin liest die Bürodaten (eine Zeile)', (select count(*) from public.buero_daten), 1);
select test.expect('Mitarbeiterin ändert die Bürodaten nicht', test.affected($$update public.buero_daten set name = 'X'$$), 0);
select test.throws('Bürodaten: keine zweite Zeile', $$insert into public.buero_daten (id, name) values (true, 'X')$$);
select test.throws('Mitarbeiterin darf die Datenübernahme nicht aufrufen', $$select public.stammdaten_0013_uebernehmen()$$);
select public.update_project('a0000000-0000-4000-8000-000000000001', p_parties => '{"kellerbauer": {"name": "Keller Löffler", "phone": "0731 1", "mobile": "0170 2", "email": "k@example.de", "address": "Weg 1, 89000 Ort"}, "sachbearbeiter": {"name": "Dörte Fuß", "mobile": "0170 3"}, "gemeinde": {"name": "Gemeinde Blaustein", "fax": "0731 8"}}');
select test.expect('Neue Rollen mit getrennten Kontaktfeldern gespeichert',
  (select count(*) from public.project_parties where project_id = 'a0000000-0000-4000-8000-000000000001' and role = 'kellerbauer' and phone = '0731 1' and mobile = '0170 2' and email = 'k@example.de' and address = 'Weg 1, 89000 Ort'), 1);
select test.expect('… auch Sachbearbeiter und Gemeinde (mit Fax)',
  (select count(*) from public.project_parties where project_id = 'a0000000-0000-4000-8000-000000000001' and ((role = 'sachbearbeiter' and mobile = '0170 3') or (role = 'gemeinde' and fax = '0731 8'))), 2);
select public.update_project('a0000000-0000-4000-8000-000000000001', p_parties => '{"kellerbauer": {"name": "Keller Löffler GmbH", "contact": null}}');
select test.expect('Speichern nur mit Name und Kontaktzeile (Übersicht) lässt die getrennten Felder stehen',
  (select count(*) from public.project_parties where project_id = 'a0000000-0000-4000-8000-000000000001' and role = 'kellerbauer' and name = 'Keller Löffler GmbH' and phone = '0731 1' and mobile = '0170 2'), 1);
select public.update_project('a0000000-0000-4000-8000-000000000001', p_parties => '{"kellerbauer": {"name": "Keller Löffler GmbH", "phone": null}}');
select test.expect('Ein genanntes Feld mit null wird geleert', (select count(*) from public.project_parties where project_id = 'a0000000-0000-4000-8000-000000000001' and role = 'kellerbauer' and phone is null and mobile = '0170 2'), 1);
select test.throws('Unbekannte Rolle wird abgelehnt', $$select public.update_project('a0000000-0000-4000-8000-000000000001', p_parties => '{"hausmeister": {"name": "X"}}')$$);
select public.update_project('a0000000-0000-4000-8000-000000000001', p_project => '{"flur": " 3 "}',
  p_bauherr => '{"name": "Familie Reinhardt", "address": "Lindenweg 12, 89073 Ulm", "street": " Größlestraße 7 ", "postal_code": "89077", "city": "Ulm", "mobile": "0170 4", "site_street": "Am Hölzle 12", "site_postal_code": "89134", "site_city": "Blaustein", "site_district": "Bermaringen", "site_state": "Baden-Württemberg"}');
select test.expect('Bauherr: getrennte Anschrift, Mobil und Bauort gespeichert, Flur am Projekt',
  (select count(*) from public.bauherren b join public.projects p on p.bauherr_id = b.id where p.id = 'a0000000-0000-4000-8000-000000000001' and b.street = 'Größlestraße 7' and b.postal_code = '89077'
     and b.city = 'Ulm' and b.mobile = '0170 4' and b.site_street = 'Am Hölzle 12' and b.site_district = 'Bermaringen' and b.site_state = 'Baden-Württemberg' and p.flur = '3'), 1);
select public.set_project_bauherr('a0000000-0000-4000-8000-000000000001', '{"name": "Familie Reinhardt", "phone": "0731 5"}');
select test.expect('Aufruf ohne die neuen Schlüssel (ältere App) lässt Anschrift, Mobil und Bauort stehen',
  (select count(*) from public.bauherren b join public.projects p on p.bauherr_id = b.id where p.id = 'a0000000-0000-4000-8000-000000000001' and b.street = 'Größlestraße 7' and b.mobile = '0170 4' and b.site_city = 'Blaustein' and b.phone = '0731 5'), 1);
select public.create_project('{"bauherr_label": "Flurtest", "flur": "7"}');
select test.expect('Projekt anlegen mit Flur', (select count(*) from public.projects where bauherr_label = 'Flurtest' and flur = '7'), 1);

insert into public.documents (project_id, name, storage_path, folder_path, uploaded_by)
values ('a0000000-0000-4000-8000-000000000001', 'Planungsprotokoll_SH.pdf', 'a0000000-0000-4000-8000-000000000001/pp/pp.pdf', '08 Bauantrag', auth.uid());
select test.expect('Mitarbeiterin legt ein Planungsprotokoll an',
  test.affected($$insert into public.planungsprotokolle (project_id, vorlage, variante, erstellt_von, dokument_id)
    select 'a0000000-0000-4000-8000-000000000001', 'schwabenhaus', 'bearbeitbar', auth.uid(), id from public.documents where name = 'Planungsprotokoll_SH.pdf'$$), 1);
select test.expect('… mit Zeitstempel', (select count(*) from public.planungsprotokolle where erstellt_am is not null and erstellt_von = auth.uid()), 1);
select test.throws('Protokoll nicht im Namen einer anderen Person',
  $$insert into public.planungsprotokolle (project_id, vorlage, variante, erstellt_von) values ('a0000000-0000-4000-8000-000000000001', 'schwabenhaus', 'flach', '00000000-0000-4000-8000-0000000000a1')$$);
select test.throws('Protokoll nicht mit dem Dokument eines anderen Projekts',
  $$insert into public.planungsprotokolle (project_id, vorlage, variante, erstellt_von, dokument_id)
    select 'a0000000-0000-4000-8000-000000000002', 'schwabenhaus', 'flach', auth.uid(), id from public.documents where name = 'Planungsprotokoll_SH.pdf'$$);
select test.throws('Unbekannte Vorlage wird abgelehnt', $$insert into public.planungsprotokolle (project_id, vorlage, variante, erstellt_von) values ('a0000000-0000-4000-8000-000000000001', 'xyz', 'flach', auth.uid())$$);
select test.throws('Unbekannte Variante wird abgelehnt', $$insert into public.planungsprotokolle (project_id, vorlage, variante, erstellt_von) values ('a0000000-0000-4000-8000-000000000001', 'schwabenhaus', 'bunt', auth.uid())$$);
select test.throws('Protokoll ändern geht nicht (nichts wird überschrieben)', $$update public.planungsprotokolle set variante = 'flach'$$);
select test.throws('Protokoll löschen geht nicht', $$delete from public.planungsprotokolle$$);
select test.expect('Mitarbeiterin sieht die Vorlagen im Speicher', (select count(*) from storage.objects where bucket_id = 'vorlagen'), 1);
select test.throws('Mitarbeiterin lädt keine Vorlage hoch', $$insert into storage.objects (bucket_id, name) values ('vorlagen', 'planungsprotokoll/neu.pdf')$$);
select test.expect('Mitarbeiterin ändert keine Vorlage', test.affected($$update storage.objects set name = 'x' where bucket_id = 'vorlagen'$$), 0);

-- Admin: Bürodaten pflegen, aber keine Vorlage hochladen (nur das Skript mit Secret key)
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select test.expect('Admin ändert die Bürodaten', test.affected($$update public.buero_daten set name = ' ABM Demo-Büro ', email = 'buero@example.de', tel = ''$$), 1);
select test.expect('Bürodaten bereinigt und gestempelt (wer, wann)',
  (select count(*) from public.buero_daten where name = 'ABM Demo-Büro' and tel is null and geaendert_von = auth.uid() and geaendert_am is not null), 1);
select test.throws('Bürodaten: ungültige E-Mail wird abgelehnt', $$update public.buero_daten set email = 'kein-at'$$);
select test.throws('Bürodaten: Stempel lässt sich nicht setzen (kein Spaltenrecht)', $$update public.buero_daten set geaendert_von = null$$);
select test.throws('Bürodaten lassen sich nicht löschen', $$delete from public.buero_daten$$);
select test.throws('Admin lädt keine Vorlage über den Client hoch', $$insert into storage.objects (bucket_id, name) values ('vorlagen', 'planungsprotokoll/neu.pdf')$$);
select test.expect('Admin sieht das Protokoll der Mitarbeiterin', (select count(*) from public.planungsprotokolle), 1);

-- Freiberufler (seinem Projekt a…01 zugewiesen) und ohne Rolle: kein Zugriff
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a3', true);
select test.expect('Freiberufler sieht keine Bürodaten', (select count(*) from public.buero_daten), 0);
select test.expect('Freiberufler ändert die Bürodaten nicht', test.affected($$update public.buero_daten set name = 'X'$$), 0);
select test.expect('Freiberufler sieht keine Planungsprotokolle, auch nicht seines Projekts', (select count(*) from public.planungsprotokolle), 0);
select test.throws('Freiberufler legt kein Planungsprotokoll an',
  $$insert into public.planungsprotokolle (project_id, vorlage, variante, erstellt_von) values ('a0000000-0000-4000-8000-000000000001', 'schwabenhaus', 'flach', auth.uid())$$);
select test.expect('Freiberufler sieht keine Vorlagen im Speicher', (select count(*) from storage.objects where bucket_id = 'vorlagen'), 0);
select test.expect('Freiberufler sieht die neuen Rollen seines Projekts nicht', (select count(*) from public.project_parties where role not in ('vermesser', 'erdbauer', 'strom', 'wasser', 'elektriker_baustrom')), 0);
select test.expect('… aber weiterhin Vermesser und Strom (Rollen aus Liste.docx)', (select count(*) from public.project_parties where project_id = 'a0000000-0000-4000-8000-000000000001'), 2);
select test.expect('Freiberufler sieht Bauort und Anschrift nicht (keine Bauherren-Zeile)', (select count(*) from public.bauherren), 0);
select test.throws('Freiberufler setzt keine Beteiligten', $$select public.update_project('a0000000-0000-4000-8000-000000000001', p_parties => '{"gas": {"name": "X"}}')$$);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a4', true);
select test.expect('Ohne Rolle: keine Bürodaten', (select count(*) from public.buero_daten), 0);
select test.expect('Ohne Rolle: keine Planungsprotokolle', (select count(*) from public.planungsprotokolle), 0);
select test.expect('Ohne Rolle: keine Vorlagen', (select count(*) from storage.objects where bucket_id = 'vorlagen'), 0);

-- Projekt löschen nimmt Protokolle und ihre Dokumente mit
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select test.expect('Projekt löschen nennt auch den Pfad des Protokoll-PDFs',
  (select count(*) from unnest(public.delete_project('a0000000-0000-4000-8000-000000000001')) p where p = 'a0000000-0000-4000-8000-000000000001/pp/pp.pdf'), 1);
select test.expect('… und die Protokollzeilen sind weg', (select count(*) from public.planungsprotokolle), 0);
rollback;

-- Schornsteinfeger-Vorschlag (0015): Zwischenspeicher und Abruf-Protokoll schreibt nur die Edge Function -------------
begin;
set local role anon;
select test.throws('anon darf den Schornsteinfeger-Zwischenspeicher nicht ansprechen', $$select count(*) from public.schornsteinfeger_suche$$);
select test.throws('anon darf die Schornsteinfeger-Details nicht ansprechen', $$select count(*) from public.schornsteinfeger_details$$);
select test.throws('anon darf das Abruf-Protokoll nicht ansprechen', $$select count(*) from public.schornsteinfeger_abrufe$$);
rollback;

begin;
-- wie die Edge Function (service_role umgeht RLS)
set local role service_role;
insert into public.schornsteinfeger_suche (plz, strasse_key, suchbegriff, treffer, bsm_ids)
  values ('89000', 'musterstrasse', 'Musterstraße', '[{"strasse": "Musterstraße", "plz": "89000", "bezirke": []}]', '{"9001"}');
insert into public.schornsteinfeger_details (bsm_id, details) values ('9001', '{"name": "Erika Beispiel"}');
insert into public.schornsteinfeger_abrufe (user_id, art, http_status) values ('00000000-0000-4000-8000-0000000000a2', 'suche', 200);
select test.throws('Zwischenspeicher: PLZ muss fünfstellig sein', $$insert into public.schornsteinfeger_suche (plz, strasse_key, suchbegriff) values ('890', 'x', 'x')$$);
select test.throws('Abruf-Protokoll: unbekannte Art wird abgelehnt', $$insert into public.schornsteinfeger_abrufe (user_id, art) values ('00000000-0000-4000-8000-0000000000a2', 'alles')$$);
reset role;
set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
select test.expect('Mitarbeiterin sieht den Zwischenspeicher nicht (nur über die Funktion)', (select count(*) from public.schornsteinfeger_suche), 0);
select test.expect('Mitarbeiterin sieht keine gespeicherten Details', (select count(*) from public.schornsteinfeger_details), 0);
select test.expect('Mitarbeiterin sieht das Abruf-Protokoll nicht, auch die eigenen Abrufe nicht', (select count(*) from public.schornsteinfeger_abrufe), 0);
select test.throws('Mitarbeiterin schreibt nicht in den Zwischenspeicher', $$insert into public.schornsteinfeger_suche (plz, strasse_key, suchbegriff) values ('89000', 'andere', 'Andere')$$);
select test.throws('Mitarbeiterin schreibt keine Details', $$insert into public.schornsteinfeger_details (bsm_id, details) values ('9002', '{}')$$);
select test.throws('Mitarbeiterin umgeht das Tageslimit nicht (Protokoll löschen)', $$delete from public.schornsteinfeger_abrufe$$);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select test.expect('Admin liest den Zwischenspeicher', (select count(*) from public.schornsteinfeger_suche), 1);
select test.expect('Admin liest die Details', (select count(*) from public.schornsteinfeger_details), 1);
select test.expect('Admin liest das Abruf-Protokoll', (select count(*) from public.schornsteinfeger_abrufe), 1);
select test.throws('Admin ändert den Zwischenspeicher nicht', $$update public.schornsteinfeger_suche set treffer = '[]'$$);
select test.throws('Admin löscht keine Details', $$delete from public.schornsteinfeger_details$$);
select test.throws('Admin schreibt nicht ins Abruf-Protokoll', $$insert into public.schornsteinfeger_abrufe (user_id, art) values (auth.uid(), 'suche')$$);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a3', true);
select test.expect('Freiberufler sieht den Zwischenspeicher nicht', (select count(*) from public.schornsteinfeger_suche), 0);
select test.expect('Freiberufler sieht keine Details', (select count(*) from public.schornsteinfeger_details), 0);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a4', true);
select test.expect('Ohne Rolle: kein Zwischenspeicher', (select count(*) from public.schornsteinfeger_suche), 0);
select test.expect('Ohne Rolle: kein Abruf-Protokoll', (select count(*) from public.schornsteinfeger_abrufe), 0);
rollback;

-- ===========================================================================
-- Migration 0016: Projektverlauf (activities lesen wie das Projekt, schreiben nur über Funktionen und Trigger)
-- ===========================================================================
begin;
-- Einträge, die ein Freiberufler nie sehen darf: Rechnung und Aufgabe im eigenen Projekt, fremdes Projekt, ohne Projekt
insert into public.activities (project_id, kind, text, actor) values
  ('a0000000-0000-4000-8000-000000000001', 'rechnung', 'Rechnung versendet: Test', 'Test'),
  ('a0000000-0000-4000-8000-000000000001', 'aufgabe',  'Aufgabe angelegt: Test',   'Test'),
  ('a0000000-0000-4000-8000-000000000002', 'projekt',  'Projekt angelegt',         'Test'),
  (null,                                   'projekt',  'Eintrag ohne Projekt',     'Test');
-- Dokument im fremden Projekt (als Superuser ohne Anmeldung: kein Verlaufseintrag)
insert into public.documents (id, project_id, name, storage_path, folder_path) values
  ('d0000000-0000-4000-8000-000000000016', 'a0000000-0000-4000-8000-000000000002', 'Fremd.pdf', 'a0000000-0000-4000-8000-000000000002/v/fremd.pdf', '08 Bauantrag');
select test.expect('Verlauf: Einfügen ohne Anmeldung (Seed, Import) erzeugt keinen Dokument-Eintrag',
  (select count(*) from public.activities where text = 'Fremd.pdf abgelegt'), 0);
set local role authenticated;

-- Freiberufler (nur Projekt 1)
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a3', true);
select test.expect('Verlauf: Freiberufler sieht keine Rechnungs-, Aufgaben-, fremden oder projektlosen Einträge',
  (select count(*) from public.activities
   where project_id is distinct from 'a0000000-0000-4000-8000-000000000001' or kind in ('rechnung', 'aufgabe')), 0);
select test.expect('Verlauf: Freiberufler sieht den Verlauf seines Projekts',
  (select count(*) from public.activities where project_id = 'a0000000-0000-4000-8000-000000000001'), 2);
select test.throws('Verlauf: Freiberufler schreibt nicht direkt in die Tabelle',
  $$insert into public.activities (project_id, kind, text, actor, actor_id) values ('a0000000-0000-4000-8000-000000000001', 'datei', 'x', 'x', auth.uid())$$);
select test.throws('Verlauf: Freiberufler darf log_activity nicht aufrufen',
  $$select public.log_activity('a0000000-0000-4000-8000-000000000001', 'projekt', 'gefälscht')$$);
select public.log_document_event('d0000000-0000-4000-8000-000000000001', 'geoeffnet');
select test.expect('Verlauf: Öffnen eines Dokuments wird mit Name und Benutzer protokolliert',
  (select count(*) from public.activities where text = 'Baugenehmigung.pdf geöffnet' and actor = 'Frank Frei'
     and actor_id = '00000000-0000-4000-8000-0000000000a3' and details->>'aktion' = 'geoeffnet'), 1);
select test.throws('Verlauf: Dokument eines fremden Projekts lässt sich nicht protokollieren',
  $$select public.log_document_event('d0000000-0000-4000-8000-000000000016', 'geoeffnet')$$);
select test.throws('Verlauf: unbekannte Aktion wird abgelehnt',
  $$select public.log_document_event('d0000000-0000-4000-8000-000000000001', 'geloescht')$$);
insert into public.documents (project_id, name, storage_path, folder_path, uploaded_by) values
  ('a0000000-0000-4000-8000-000000000001', 'Skizze.pdf', 'a0000000-0000-4000-8000-000000000001/v/skizze.pdf', '08 Bauantrag', '00000000-0000-4000-8000-0000000000a3');
select test.expect('Verlauf: Hochladen wird protokolliert (Trigger)',
  (select count(*) from public.activities where text = 'Skizze.pdf abgelegt' and actor = 'Frank Frei' and details->>'aktion' = 'hochgeladen'), 1);

-- Ohne Zuweisung sieht der Freiberufler nichts mehr
reset role;
-- wie ein Skript mit Secret key: ohne Anmeldung
select set_config('request.jwt.claim.sub', '', true);
delete from public.project_members where user_id = '00000000-0000-4000-8000-0000000000a3';
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a3', true);
set local role authenticated;
select test.expect('Verlauf: Freiberufler ohne Zuweisung sieht keinen Eintrag', (select count(*) from public.activities), 0);
select test.throws('Verlauf: Freiberufler ohne Zuweisung protokolliert nichts',
  $$select public.log_document_event('d0000000-0000-4000-8000-000000000001', 'geoeffnet')$$);

-- Mitarbeiter
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
select test.expect('Verlauf: Entfernen der Zuweisung ist protokolliert (ohne Anmeldung als "System")',
  (select count(*) from public.activities where text = 'Zuweisung entfernt: Frank Frei' and actor = 'System'), 1);
-- auch mit korrektem Namen und eigener Benutzer-ID: direkt geht es nicht, nur über Funktionen (abm.verlauf)
select test.throws('Verlauf: Mitarbeiter schreibt nicht direkt in die Tabelle',
  $$insert into public.activities (project_id, kind, text, actor, actor_id) values ('a0000000-0000-4000-8000-000000000001', 'projekt', 'x', public.current_user_name(), auth.uid())$$);
select test.expect('Verlauf: die Kennung abm.verlauf gilt außerhalb der Funktionen nicht',
  (select count(*) from (select current_setting('abm.verlauf', true) v) x where v = 'an'), 0);
select public.update_project('a0000000-0000-4000-8000-000000000003', p_project => '{"location": "Verlaufsort"}', p_activity => 'Projektdaten geändert: Bauort');
select test.expect('Verlauf: update_project schreibt seinen Eintrag weiterhin selbst',
  (select count(*) from public.activities where project_id = 'a0000000-0000-4000-8000-000000000003' and text = 'Projektdaten geändert: Bauort' and actor = public.current_user_name()), 1);
select public.log_activity('a0000000-0000-4000-8000-000000000001', 'schritt', 'Testschritt erledigt', '{"schritt": "test"}');
select test.expect('Verlauf: log_activity setzt Name und Benutzer selbst',
  (select count(*) from public.activities where text = 'Testschritt erledigt' and actor = public.current_user_name()
     and actor_id = '00000000-0000-4000-8000-0000000000a2' and details->>'schritt' = 'test'), 1);
select test.throws('Verlauf: log_activity schreibt keine Dokument-Einträge',
  $$select public.log_activity('a0000000-0000-4000-8000-000000000001', 'datei', 'gefälscht.pdf abgelegt')$$);
select test.throws('Verlauf: log_activity ohne Text wird abgelehnt',
  $$select public.log_activity('a0000000-0000-4000-8000-000000000001', 'projekt', '  ')$$);
update public.projects set status = 'abgeschlossen' where id = 'a0000000-0000-4000-8000-000000000003';
select test.expect('Verlauf: Statuswechsel wird protokolliert (Trigger)',
  (select count(*) from public.activities where project_id = 'a0000000-0000-4000-8000-000000000003'
     and text = 'Projekt abgeschlossen' and actor = public.current_user_name() and details->>'nach' = 'abgeschlossen'), 1);
update public.projects set status = 'abgeschlossen' where id = 'a0000000-0000-4000-8000-000000000003';
select test.expect('Verlauf: gleicher Status ergibt keinen zweiten Eintrag',
  (select count(*) from public.activities where project_id = 'a0000000-0000-4000-8000-000000000003' and text = 'Projekt abgeschlossen'), 1);
select test.throws('Verlauf: Einträge bleiben unveränderlich', $$update public.activities set details = '{}'$$);
select test.throws('Verlauf: Einträge bleiben unlöschbar',     $$delete from public.activities$$);

-- Projekt löschen (Admin): Dokumente und Zuweisungen gehen mit, ohne dass die Trigger stören
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select public.delete_project('a0000000-0000-4000-8000-000000000002');
select test.expect('Verlauf: nach dem Löschen bleibt kein Eintrag des Projekts',
  (select count(*) from public.activities where project_id = 'a0000000-0000-4000-8000-000000000002'), 0);
rollback;

-- Seed-Plausibilität -----------------------------------------------------------
select test.expect('Seed: 12 Schritte definiert (5 aus Excel + 7 aus 0002)', (select count(*) from public.step_definitions), 12);
select test.expect('Seed: genau eine fällige, nicht versendete Rechnung',
  (select count(*) from public.invoices where status = 'faellig' and sent_on is null), 1);

\echo ''
\echo 'Alle Datenbanktests bestanden.'
