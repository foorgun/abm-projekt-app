-- ABM Projekt-App: Neues Projekt aus einem Vertrag.
--   * Entwürfe (project_drafts): ausgelesene Felder mit Wert/Quelle/Sicherheit, zum Abbrechen und späteren Fortsetzen
--   * Dokumente: Typ (doc_type) und Metadaten des Vertrags (Vertragsdatum, Vertragspreis, Angebotsnummer, Haustyp)
--   * Projekte: Flurstück und Gemarkung (optional, auch für die Duplikatprüfung)
--   * Bauherren: zweiter Bauherr (Name, Telefon, E-Mail). Liegt bewusst bei den Kontaktdaten und nicht am Projekt:
--     Projekte sehen auch Freiberufler, Kontaktdaten der Bauherren nicht.
--   * extraction_log: Protokoll der KI-Auslesungen für die Kostenbremse; schreibt nur die Edge Function (service_role)
--   * Ordnervorlage: "00 Verträge" (vorläufiger Ablageort für den Werkvertrag, siehe docs/offene-fragen.md)

-- ---------------------------------------------------------------------------
-- Neue Spalten
-- ---------------------------------------------------------------------------
create type public.document_type as enum ('werkvertrag', 'vermessungsvertrag', 'sonstiges');

alter table public.documents
  add column doc_type public.document_type,
  add column meta     jsonb not null default '{}'::jsonb,
  add constraint documents_meta_object check (jsonb_typeof(meta) = 'object');

alter table public.projects
  add column flurstueck text,
  add column gemarkung  text;

alter table public.bauherren
  add column name2  text,
  add column phone2 text,
  add column email2 text;

grant insert (name2, phone2, email2) on public.bauherren to authenticated;
grant update (name2, phone2, email2) on public.bauherren to authenticated;

-- ---------------------------------------------------------------------------
-- Ordnervorlage: Ablageort für Verträge (steht vor "01 Projektbeteiligte"). Ohne Schlüsselwörter: der Posteingangs-Agent
-- sortiert dort vorerst nichts von selbst ein.
-- ---------------------------------------------------------------------------
-- BEGIN folder_templates
insert into public.folder_templates (path, parent_path, sort, label, has_date, keywords, description) values
  ('00 Verträge', null, -1, '00 Verträge', false, '{}', 'Werkvertrag mit der Hausbaufirma; vorläufiger Ort, siehe offene-fragen.md');
-- END folder_templates

-- ---------------------------------------------------------------------------
-- Entwürfe
-- ---------------------------------------------------------------------------
create type public.draft_status as enum ('offen', 'uebernommen', 'verworfen');

create table public.project_drafts (
  id           uuid primary key default gen_random_uuid(),
  status       public.draft_status not null default 'offen',
  -- Ergebnis des Extractors: {"felder": {"<feld>": {"wert", "quelle", "sicherheit"}}, "hinweise": [...], ...}
  fields       jsonb not null default '{}'::jsonb,
  -- Stand der Prüfmaske (vom Menschen geänderte Werte), damit man später weitermachen kann
  form         jsonb not null default '{}'::jsonb,
  doc_type     public.document_type not null default 'sonstiges',
  file_name    text not null,
  file_size    bigint not null check (file_size >= 0),
  file_mime    text,
  -- Datei im privaten Speicher unter "drafts/<Entwurf>/…", bis sie in ein Projekt übernommen wird
  storage_path text unique,
  -- gesetzt, sobald der Entwurf übernommen wurde (neues oder bestehendes Projekt)
  project_id   uuid references public.projects(id) on delete set null,
  document_id  uuid references public.documents(id) on delete set null,
  created_by   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint project_drafts_fields_object check (jsonb_typeof(fields) = 'object'),
  constraint project_drafts_form_object   check (jsonb_typeof(form) = 'object')
);
create index project_drafts_status_idx on public.project_drafts (status, created_at);
create trigger project_drafts_touch before update on public.project_drafts
  for each row execute function public.touch_updated_at();

alter table public.project_drafts enable row level security;
-- Nur Admin und Mitarbeiter. Freiberufler haben keine einzige Zeile und dürfen nichts schreiben.
create policy project_drafts_staff on public.project_drafts for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Anlegen, ändern, als übernommen/verworfen markieren. Nie löschen (wie überall: Status statt Löschen).
grant select, insert on public.project_drafts to authenticated;
grant update (status, fields, form, doc_type, storage_path, project_id, document_id) on public.project_drafts to authenticated;

-- ---------------------------------------------------------------------------
-- Protokoll der KI-Auslesungen (Kostenbremse). Keine Inhalte, nur Zähler.
-- ---------------------------------------------------------------------------
create table public.extraction_log (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  at            timestamptz not null default now(),
  model         text not null,
  images        integer not null default 0,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  -- geschätzte Kosten in Euro (aus Tokens und den in der Funktion hinterlegten Preisen)
  cost_eur      numeric(10, 4) not null default 0,
  ok            boolean not null default true
);
create index extraction_log_at_idx   on public.extraction_log (at);
create index extraction_log_user_idx on public.extraction_log (user_id, at);

alter table public.extraction_log enable row level security;
-- Lesen dürfen nur Admins (Kostenübersicht). Schreiben darf kein Client: es gibt weder ein GRANT noch eine Regel dafür,
-- nur die Edge Function mit service_role (umgeht RLS).
create policy extraction_log_admin_read on public.extraction_log for select to authenticated
  using (public.is_admin());
grant select on public.extraction_log to authenticated;

-- ---------------------------------------------------------------------------
-- Speicher: Dateien von Entwürfen liegen unter "drafts/…" und sind nur für Admin und Mitarbeiter erreichbar.
-- (Die bestehenden Regeln greifen über die Projekt-ID im ersten Pfadteil; "drafts" ist keine Projekt-ID.)
-- Verschieben in den Projektordner und Löschen decken die Regeln project_documents_modify/_delete aus 0001 ab.
-- ---------------------------------------------------------------------------
create policy project_documents_drafts_read on storage.objects for select to authenticated
  using (bucket_id = 'project-documents' and (storage.foldername(name))[1] = 'drafts' and public.is_staff());

create policy project_documents_drafts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'project-documents' and (storage.foldername(name))[1] = 'drafts' and public.is_staff());

-- ---------------------------------------------------------------------------
-- Kontaktdaten des Bauherrn: jetzt mit zweitem Bauherrn (name2, phone2, email2). Sonst unverändert zu 0008.
-- ---------------------------------------------------------------------------
create or replace function public.set_project_bauherr(p_project uuid, p_bauherr jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_b     uuid;
  v_label text;
  v_name  text;
begin
  if not public.is_staff() then raise exception 'Keine Berechtigung für diese Aktion'; end if;
  if p_bauherr is null or jsonb_typeof(p_bauherr) <> 'object' then return; end if;
  select bauherr_id, bauherr_label into v_b, v_label from public.projects where id = p_project;
  v_name := coalesce(public.clean_text(p_bauherr->>'name'), v_label);
  if v_b is null then
    -- ohne jede Angabe keinen leeren Bauherrn anlegen
    if coalesce(public.clean_text(p_bauherr->>'phone'), public.clean_text(p_bauherr->>'email'),
                public.clean_text(p_bauherr->>'address'), public.clean_text(p_bauherr->>'building_address'),
                public.clean_text(p_bauherr->>'name'), public.clean_text(p_bauherr->>'name2'),
                public.clean_text(p_bauherr->>'phone2'), public.clean_text(p_bauherr->>'email2')) is null then
      return;
    end if;
    insert into public.bauherren (name, address, phone, email, building_address, name2, phone2, email2)
    values (v_name, public.clean_text(p_bauherr->>'address'), public.clean_text(p_bauherr->>'phone'),
            public.clean_text(p_bauherr->>'email'), public.clean_text(p_bauherr->>'building_address'),
            public.clean_text(p_bauherr->>'name2'), public.clean_text(p_bauherr->>'phone2'), public.clean_text(p_bauherr->>'email2'))
    returning id into v_b;
    update public.projects set bauherr_id = v_b where id = p_project;
  else
    update public.bauherren
      set name = v_name,
          address = public.clean_text(p_bauherr->>'address'),
          phone = public.clean_text(p_bauherr->>'phone'),
          email = public.clean_text(p_bauherr->>'email'),
          building_address = public.clean_text(p_bauherr->>'building_address'),
          name2 = public.clean_text(p_bauherr->>'name2'),
          phone2 = public.clean_text(p_bauherr->>'phone2'),
          email2 = public.clean_text(p_bauherr->>'email2')
      where id = v_b;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Projekt anlegen und bearbeiten: jetzt mit "flurstueck" und "gemarkung". Sonst unverändert zu 0008.
-- ---------------------------------------------------------------------------
create or replace function public.create_project(
  p_project        jsonb,
  p_bauherr        jsonb default null,
  p_vermesser      text  default null,
  p_followup_title text  default null,
  p_followup_due   date  default null,
  p_folders_note   text  default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id   uuid;
  v_name text := public.current_user_name();
begin
  if not public.is_staff() then raise exception 'Keine Berechtigung für diese Aktion'; end if;
  if length(coalesce(public.clean_text(p_project->>'bauherr_label'), '')) < 2 then
    raise exception 'Bitte den Nachnamen des Bauherrn eintragen.';
  end if;

  insert into public.projects (bauherr_label, kind, status, abm_nr, hausbau_nr, company_id, salesperson_id, location, architect_id, planer_id, intake_month, flurstueck, gemarkung)
  values (public.clean_text(p_project->>'bauherr_label'),
          coalesce(public.clean_text(p_project->>'kind'), 'neubau')::public.project_kind, 'aktiv',
          public.clean_text(p_project->>'abm_nr'), public.clean_text(p_project->>'hausbau_nr'),
          public.clean_text(p_project->>'company_id')::uuid, public.clean_text(p_project->>'salesperson_id')::uuid,
          public.clean_text(p_project->>'location'),
          public.clean_text(p_project->>'architect_id')::uuid, public.clean_text(p_project->>'planer_id')::uuid,
          public.clean_text(p_project->>'intake_month')::date,
          public.clean_text(p_project->>'flurstueck'), public.clean_text(p_project->>'gemarkung'))
  returning id into v_id;

  perform public.set_project_bauherr(v_id, p_bauherr);

  if public.clean_text(p_vermesser) is not null then
    insert into public.project_parties (project_id, role, name) values (v_id, 'vermesser', public.clean_text(p_vermesser));
  end if;

  insert into public.activities (project_id, kind, text, actor, actor_id) values (v_id, 'projekt', 'Projekt angelegt', v_name, auth.uid());
  if public.clean_text(p_folders_note) is not null then
    insert into public.activities (project_id, kind, text, actor, actor_id) values (v_id, 'projekt', public.clean_text(p_folders_note), v_name, auth.uid());
  end if;

  if public.clean_text(p_followup_title) is not null then
    perform public.sync_followup_task(v_id, p_followup_title, p_followup_due);
  end if;
  return v_id;
end $$;

create or replace function public.update_project(
  p_id             uuid,
  p_project        jsonb default '{}'::jsonb,
  p_bauherr        jsonb default null,
  p_parties        jsonb default null,
  p_activity       text  default null,
  p_followup_title text  default null,
  p_followup_due   date  default null
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_role text;
  v_val  jsonb;
  j      jsonb := coalesce(p_project, '{}'::jsonb);
begin
  if not public.is_staff() then raise exception 'Keine Berechtigung für diese Aktion'; end if;
  perform 1 from public.projects where id = p_id for update;
  if not found then raise exception 'Projekt nicht gefunden'; end if;
  if j ? 'bauherr_label' and length(coalesce(public.clean_text(j->>'bauherr_label'), '')) < 2 then
    raise exception 'Bitte den Nachnamen des Bauherrn eintragen.';
  end if;

  update public.projects set
    bauherr_label  = case when j ? 'bauherr_label'  then public.clean_text(j->>'bauherr_label')         else bauherr_label  end,
    abm_nr         = case when j ? 'abm_nr'         then public.clean_text(j->>'abm_nr')                else abm_nr         end,
    hausbau_nr     = case when j ? 'hausbau_nr'     then public.clean_text(j->>'hausbau_nr')            else hausbau_nr     end,
    company_id     = case when j ? 'company_id'     then public.clean_text(j->>'company_id')::uuid      else company_id     end,
    salesperson_id = case when j ? 'salesperson_id' then public.clean_text(j->>'salesperson_id')::uuid  else salesperson_id end,
    location       = case when j ? 'location'       then public.clean_text(j->>'location')              else location       end,
    architect_id   = case when j ? 'architect_id'   then public.clean_text(j->>'architect_id')::uuid    else architect_id   end,
    planer_id      = case when j ? 'planer_id'      then public.clean_text(j->>'planer_id')::uuid       else planer_id      end,
    intake_month   = case when j ? 'intake_month'   then public.clean_text(j->>'intake_month')::date    else intake_month   end,
    baubetreuung   = case when j ? 'baubetreuung'   then public.clean_text(j->>'baubetreuung')          else baubetreuung   end,
    flurstueck     = case when j ? 'flurstueck'     then public.clean_text(j->>'flurstueck')            else flurstueck     end,
    gemarkung      = case when j ? 'gemarkung'      then public.clean_text(j->>'gemarkung')             else gemarkung      end
  where id = p_id;

  perform public.set_project_bauherr(p_id, p_bauherr);

  if p_parties is not null and jsonb_typeof(p_parties) = 'object' then
    for v_role, v_val in select key, value from jsonb_each(p_parties) loop
      if jsonb_typeof(v_val) = 'object' and public.clean_text(v_val->>'name') is not null then
        insert into public.project_parties (project_id, role, name, contact)
        values (p_id, v_role::public.party_role, public.clean_text(v_val->>'name'), public.clean_text(v_val->>'contact'))
        on conflict (project_id, role) do update set name = excluded.name, contact = excluded.contact;
      else
        delete from public.project_parties where project_id = p_id and role = v_role::public.party_role;
      end if;
    end loop;
  end if;

  if public.clean_text(p_activity) is not null then
    insert into public.activities (project_id, kind, text, actor, actor_id)
    values (p_id, 'projekt', public.clean_text(p_activity), public.current_user_name(), auth.uid());
  end if;

  perform public.sync_followup_task(p_id, p_followup_title, p_followup_due);
end $$;

-- "create or replace" behält die Rechte aus 0008 (nur authenticated und service_role); zur Sicherheit erneut:
revoke all on function public.set_project_bauherr(uuid, jsonb), public.create_project(jsonb, jsonb, text, text, date, text),
  public.update_project(uuid, jsonb, jsonb, jsonb, text, text, date) from public, anon;
