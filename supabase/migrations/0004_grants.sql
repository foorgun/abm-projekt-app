-- ABM Projekt-App: Zugriffsrechte (GRANT) für die Daten-API.
-- Im Supabase-Projekt ist "Automatically expose new tables" AUS: ohne ausdrückliches GRANT sieht die API keine Tabelle.
-- Zwei Ebenen, beide nötig:
--   * GRANT  = welche Tabelle/Spalte/Aktion eine Rolle überhaupt ansprechen darf (hier)
--   * RLS    = welche Zeilen davon (Migrationen 0001/0002)
-- Grundsatz: anon (nicht angemeldet) bekommt nichts. authenticated bekommt nur, was die App tatsächlich tut.
-- service_role (Skripte und später der Agent, nur serverseitig mit dem Secret key) bekommt alles und umgeht RLS.

-- Alles zurücknehmen, was durch Voreinstellungen vergeben sein könnte
revoke all on all tables    in schema public from anon, authenticated, public;
revoke all on all sequences in schema public from anon, authenticated, public;
revoke all on all functions in schema public from anon, authenticated, public;

-- Künftige Tabellen: ebenfalls nichts automatisch (jede Migration vergibt ihre Rechte selbst).
-- Achtung Funktionen: Postgres gibt neuen Funktionen immer EXECUTE für PUBLIC, das lässt sich pro Schema nicht
-- abstellen. Jede Migration, die eine Funktion anlegt, nimmt das deshalb selbst zurück (revoke ... from public, anon).
alter default privileges in schema public revoke all on tables    from anon, authenticated, public;
alter default privileges in schema public revoke all on sequences from anon, authenticated, public;

grant usage on schema public to authenticated, service_role;

-- Server (Skripte, Agent)
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- Hilfsfunktionen der Zeilenregeln
grant execute on function public.current_app_role()        to authenticated;
grant execute on function public.is_staff()                to authenticated;
grant execute on function public.is_admin()                to authenticated;
grant execute on function public.has_project_access(uuid)  to authenticated;
grant execute on function public.try_uuid(text)            to authenticated;

-- Stammdaten: nur lesen (Pflege kommt mit der Einstellungsseite, dann eigene Migration)
grant select on public.companies, public.salespeople, public.team_members,
                public.step_definitions, public.folder_templates,
                public.bauherren, public.project_parties to authenticated;

-- Projekte: anlegen und ändern, nie löschen (Storno ist ein Status)
grant select, insert, update on public.projects to authenticated;
grant select, insert, update, delete on public.project_steps to authenticated;  -- Datum zurücksetzen = Zeile löschen

-- Rechnungen: lesen, als versendet/bezahlt markieren. Beträge und Auslöser ändert die App nicht.
grant select on public.invoices to authenticated;
grant update (status, sent_on, paid_on, due_on) on public.invoices to authenticated;

-- Dokumente: ablegen und umsortieren, nie löschen
grant select, insert on public.documents to authenticated;
grant update (project_id, folder_path, name) on public.documents to authenticated;

-- Aufgaben und Protokoll
grant select, insert, update on public.tasks to authenticated;
grant select, insert on public.activities to authenticated;

-- Posteingang: lesen und Entscheidungen der Prüfliste. Mails und Läufe schreibt nur der Agent (service_role).
-- secret_ref (Verweis auf die Zugangsdaten im Vault) bleibt für die Oberfläche unsichtbar.
grant select (id, label, address, provider, status, last_checked_at, watch_folder, created_at) on public.mailboxes to authenticated;
grant insert (label, address, provider, status, watch_folder) on public.mailboxes to authenticated;
grant update (label, address, provider, status, watch_folder) on public.mailboxes to authenticated;
grant select on public.inbox_items, public.inbox_attachments, public.agent_runs to authenticated;
grant update (status, project_id) on public.inbox_items to authenticated;
grant update (status, project_id, folder_path, document_id, storage_path, corrected) on public.inbox_attachments to authenticated;
grant select, insert, delete on public.agent_rules to authenticated;
grant select on public.agent_settings to authenticated;
grant update (auto_file_threshold, suggest_threshold) on public.agent_settings to authenticated;
grant select, insert on public.agent_feedback to authenticated;

-- Benutzer: eigene Rolle lesen (Admins alle, per RLS). Vergabe läuft vorerst über Skript bzw. Dashboard.
grant select on public.user_roles, public.project_members to authenticated;
