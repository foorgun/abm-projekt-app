-- ABM Projekt-App: Projektverlauf (aufklappbarer Verlauf in der Projektliste: wer hat wann was gemacht).
--
-- Ein Protokoll gibt es seit 0002: public.activities (Projekt, Art, Text, Anzeigename, Benutzer-ID, Zeitpunkt; nicht
-- änderbar, nicht löschbar). Statt einer zweiten Tabelle wird es erweitert:
--   * details jsonb: strukturierte Angaben zum Eintrag (z. B. Dokument-ID, Ordner, neuer Status). Nie Kontaktdaten.
--   * Lesen: wer das Projekt sehen darf. Freiberufler nur zugewiesene Projekte und dort keine Einträge zu Rechnungen
--     und Aufgaben (die sehen sie auch sonst nicht). Einträge ohne Projekt bleiben bei Admin und Mitarbeitern.
--   * Schreiben: nicht mehr direkt aus der App, nur noch über Funktionen und Trigger. Anzeigename und Benutzer-ID setzt
--     immer die Datenbank, nie der Client. Das INSERT-Recht und die Zeilenregel bleiben, weil create_project,
--     update_project und resolve_review mit den Rechten des Aufrufers laufen und ihre Einträge selbst schreiben.
--     Ein Trigger lehnt aber jedes Einfügen eines angemeldeten Benutzers ab, das nicht aus einer dieser drei
--     Funktionen kommt (Aufrufkette PG_CONTEXT). Ein INSERT über die Daten-API hat keine davon in der Kette.
--     Eine neue Funktion, die mit den Rechten des Aufrufers in activities schreibt, muss in die Liste.
--     (ALTER FUNCTION … SET mit einer eigenen Kennung ginge auch, ist bei Supabase aber nicht erlaubt.)
--   * Neu protokolliert, unabhängig davon, über welchen Weg die Änderung kommt:
--       - Dokument abgelegt (Trigger auf documents, nur Herkunft "upload"; der Agent protokolliert selbst)
--       - Dokument entfernt (Trigger auf documents)
--       - Dokument geöffnet / heruntergeladen (Funktion log_document_event, ruft die App beim Öffnen)
--       - Status geändert (Trigger auf projects)
--       - Zuweisung eines Freiberuflers (Trigger auf project_members, auch aus Skripten: dann als "System")
--     Dokumente und Status nur, wenn ein angemeldeter Benutzer handelt: Seed, Excel-Import und Demo-Daten (ohne
--     Anmeldung) sollen keine Flut von "System"-Einträgen erzeugen.
--   * Bleibt wie bisher: "Projekt angelegt" und "Projektdaten geändert: …" (Funktionen create_project/update_project),
--     Schritte, Aufgaben, Rechnungen (jetzt über log_activity statt direktem INSERT).

alter table public.activities add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.activities add constraint activities_details_object check (jsonb_typeof(details) = 'object');

-- ---------------------------------------------------------------------------
-- Lesen
-- ---------------------------------------------------------------------------
drop policy if exists activities_read on public.activities;
create policy activities_read on public.activities for select to authenticated
  using (public.is_staff()
         or (project_id is not null
             and kind not in ('rechnung', 'aufgabe')
             and public.has_project_access(project_id)));

-- ---------------------------------------------------------------------------
-- Schreiben nur über Funktionen und Trigger
-- ---------------------------------------------------------------------------
-- Zeilenregel activities_write (0002) bleibt: nur Admin und Mitarbeiter, nur mit der eigenen Benutzer-ID.
-- Zusätzlich: angemeldete Benutzer nur aus diesen Funktionen heraus. Funktionen mit den Rechten des Eigentümers
-- (log_activity, Trigger dieser Migration), Superuser und Secret key (Seed, Import, Agent) sind nicht betroffen.
create function public.activities_only_from_functions() returns trigger
language plpgsql set search_path = public as $$
declare
  v_ctx text;
begin
  if current_user <> 'authenticated' then return new; end if;
  get diagnostics v_ctx = pg_context;
  if v_ctx !~ '\m(create_project|update_project|resolve_review)\(' then
    raise exception 'Verlaufseinträge entstehen nur über die Funktionen der App' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger activities_only_from_functions before insert on public.activities
  for each row execute function public.activities_only_from_functions();

-- Anzeigename für Trigger: angemeldeter Benutzer, sonst "System" (SQL-Editor, Skripte mit Secret key)
create function public.activity_actor() returns text
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then 'System' else coalesce(public.current_user_name(), 'Unbekannt') end
$$;

-- Eintrag aus der App (Schritte, Aufgaben, Rechnungen, sonstige Projektereignisse). Nur Admin und Mitarbeiter.
-- Dokument- und Agent-Einträge entstehen nur in der Datenbank (Trigger, log_document_event, Prüfliste).
create function public.log_activity(p_project_id uuid, p_kind public.activity_kind, p_text text, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Keine Berechtigung für diese Aktion'; end if;
  if p_kind in ('datei', 'agent') then raise exception 'Diese Einträge schreibt nur die Datenbank'; end if;
  if public.clean_text(p_text) is null then raise exception 'Text für den Verlauf fehlt'; end if;
  if p_project_id is not null and not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'Projekt nicht gefunden';
  end if;
  insert into public.activities (project_id, kind, text, actor, actor_id, details)
  values (p_project_id, p_kind, left(public.clean_text(p_text), 300), public.current_user_name(), auth.uid(),
          case when jsonb_typeof(p_details) = 'object' then p_details else '{}'::jsonb end);
end $$;

-- Dokument geöffnet bzw. heruntergeladen. Jede Rolle, die das Dokument sehen darf. Text kommt aus der Datenbank.
create function public.log_document_event(p_document_id uuid, p_event text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_doc public.documents%rowtype;
begin
  if p_event not in ('geoeffnet', 'heruntergeladen') then raise exception 'Unbekannte Aktion'; end if;
  select * into v_doc from public.documents where id = p_document_id;
  -- unbekannt und nicht sichtbar melden dasselbe: es wird nichts über fremde Projekte verraten
  if not found or not public.has_project_access(v_doc.project_id) then raise exception 'Dokument nicht gefunden'; end if;
  insert into public.activities (project_id, kind, text, actor, actor_id, details)
  values (v_doc.project_id, 'datei',
          v_doc.name || case p_event when 'geoeffnet' then ' geöffnet' else ' heruntergeladen' end,
          coalesce(public.current_user_name(), 'Unbekannt'), auth.uid(),
          jsonb_build_object('aktion', p_event, 'document_id', v_doc.id, 'ordner', v_doc.folder_path));
end $$;

-- Dokument abgelegt (manuell hochgeladen) oder entfernt
create function public.activities_on_document() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    if new.source = 'upload' then
      insert into public.activities (project_id, kind, text, actor, actor_id, details)
      values (new.project_id, 'datei', new.name || ' abgelegt', public.activity_actor(), auth.uid(),
              jsonb_build_object('aktion', 'hochgeladen', 'document_id', new.id, 'ordner', new.folder_path));
    end if;
    return new;
  end if;
  -- Beim Löschen des ganzen Projekts (delete_project) gibt es das Projekt nicht mehr: dann kein Eintrag
  if exists (select 1 from public.projects where id = old.project_id) then
    insert into public.activities (project_id, kind, text, actor, actor_id, details)
    values (old.project_id, 'datei', old.name || ' entfernt', public.activity_actor(), auth.uid(),
            jsonb_build_object('aktion', 'geloescht', 'document_id', old.id, 'ordner', old.folder_path));
  end if;
  return old;
end $$;

create trigger documents_activity after insert or delete on public.documents
  for each row execute function public.activities_on_document();

-- Status geändert (aktiv, abgeschlossen, storno)
create function public.activities_on_project_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  insert into public.activities (project_id, kind, text, actor, actor_id, details)
  values (new.id, 'projekt',
          case new.status::text
            when 'aktiv' then 'Projekt wieder aktiv'
            when 'abgeschlossen' then 'Projekt abgeschlossen'
            when 'storno' then 'Projekt storniert'
            else 'Status geändert: ' || new.status::text
          end,
          public.activity_actor(), auth.uid(),
          jsonb_build_object('aktion', 'status', 'von', old.status, 'nach', new.status));
  return new;
end $$;

create trigger projects_status_activity after update of status on public.projects
  for each row when (old.status is distinct from new.status)
  execute function public.activities_on_project_status();

-- Zuweisung eines Freiberuflers (project_members). Name aus user_roles, sonst "Unbekannt".
create function public.activities_on_member() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_project uuid := coalesce(new.project_id, old.project_id);
  v_user    uuid := coalesce(new.user_id, old.user_id);
  v_name    text;
begin
  if not exists (select 1 from public.projects where id = v_project) then return null; end if;
  select coalesce(nullif(trim(full_name), ''), 'Unbekannt') into v_name from public.user_roles where user_id = v_user;
  insert into public.activities (project_id, kind, text, actor, actor_id, details)
  values (v_project, 'projekt',
          case tg_op when 'INSERT' then 'Zugewiesen: ' else 'Zuweisung entfernt: ' end || coalesce(v_name, 'Unbekannt'),
          public.activity_actor(), auth.uid(),
          jsonb_build_object('aktion', case tg_op when 'INSERT' then 'zugewiesen' else 'zuweisung_entfernt' end, 'user_id', v_user));
  return null;
end $$;

create trigger project_members_activity after insert or delete on public.project_members
  for each row execute function public.activities_on_member();

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------
revoke all on function public.activity_actor() from public, anon;
revoke all on function public.activities_only_from_functions() from public, anon;
revoke all on function public.log_activity(uuid, public.activity_kind, text, jsonb) from public, anon;
revoke all on function public.log_document_event(uuid, text) from public, anon;
revoke all on function public.activities_on_document() from public, anon;
revoke all on function public.activities_on_project_status() from public, anon;
revoke all on function public.activities_on_member() from public, anon;
grant execute on function public.log_activity(uuid, public.activity_kind, text, jsonb) to authenticated, service_role;
grant execute on function public.log_document_event(uuid, text) to authenticated, service_role;
