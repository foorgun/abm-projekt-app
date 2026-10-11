-- ABM Projekt-App: Hausbaufirmen als echte Stammdaten, Stammdaten direkt beim Anlegen eines Projekts ergänzen,
-- Projekt anlegen als eine Transaktion.

-- ---------------------------------------------------------------------------
-- Hausbaufirmen (echte Stammdaten, kein is_demo). Weitere legt das Büro in der App an.
-- Die IDs entsprechen dem Schema des Excel-Imports (tools/import_excel.py: uuid5 aus "company|<Name>"),
-- damit der spätere Import dieselben Zeilen trifft statt Dubletten zu erzeugen.
-- Der Nummernkreis (number_prefix) bleibt leer, bis er bestätigt ist: ohne ihn schlägt die App keine ABM-Nr. vor.
-- ---------------------------------------------------------------------------
insert into public.companies (id, name) values
  ('0cab8f3a-799c-571f-b4dd-aec84a8a7f05', 'Bien-Zenker'),
  ('a82dbfb8-d1e1-5056-b3e5-59faa402eeeb', 'Living Haus'),
  ('82fb4b3f-479e-5350-bf75-99b0717d2408', 'Schwabenhaus')
on conflict do nothing;

-- Namen ohne Rand-Leerzeichen und nicht leer (gilt für alle Wege, auch Import und Skripte)
alter table public.companies    add constraint companies_name_clean    check (name = trim(name) and length(name) >= 2);
alter table public.salespeople  add constraint salespeople_name_clean  check (name = trim(name) and length(name) >= 2);
alter table public.team_members add constraint team_members_name_clean check (name = trim(name) and length(name) >= 2);

-- ---------------------------------------------------------------------------
-- Rechte: Admin und Mitarbeiter legen Stammdaten an (nur anlegen, nicht ändern oder löschen), Freiberufler nicht.
-- Spaltengenau: nur der Name (und die nötige Zuordnung). Kein Nummernkreis, kein Benutzerkonto, kein is_demo.
-- ---------------------------------------------------------------------------
grant insert (name)             on public.companies    to authenticated;   -- Zeilenregel: companies_staff (0001)
grant insert (company_id, name) on public.salespeople  to authenticated;   -- Zeilenregel: salespeople_staff (0001)
grant insert (name, role)       on public.team_members to authenticated;
grant insert (project_id, role, name, contact) on public.project_parties to authenticated;  -- Zeilenregel: parties_write (0002)

-- Team: bisher durften nur Admins schreiben. Anlegen jetzt auch Mitarbeiter; ändern und löschen weiter nur Admins (ohne GRANT ohnehin nicht).
create policy team_insert_staff on public.team_members for insert to authenticated
  with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Projekt anlegen: Projekt, Vermesser (als Projektbeteiligter), Aufgabe "fehlende Angaben nachfragen" und Protokoll
-- in einer Transaktion. security invoker: es gelten Rechte und Zeilenregeln des angemeldeten Benutzers.
-- Pflicht ist nur der Bauherr. Titel und Fälligkeit der Aufgabe berechnet die App (dieselbe Regel wie im Demo-Modus).
-- ---------------------------------------------------------------------------
create function public.create_project(
  p_bauherr_label text,
  p_kind          public.project_kind default 'neubau',
  p_abm_nr        text default null,
  p_hausbau_nr    text default null,
  p_company       uuid default null,
  p_salesperson   uuid default null,
  p_location      text default null,
  p_architect     uuid default null,
  p_planer        uuid default null,
  p_intake_month  date default null,
  p_vermesser     text default null,
  p_followup_title text default null,
  p_followup_due   date default null,
  p_folders_note   text default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id   uuid;
  v_name text := public.current_user_name();
begin
  if not public.is_staff() then raise exception 'Keine Berechtigung für diese Aktion'; end if;
  if length(trim(coalesce(p_bauherr_label, ''))) < 2 then raise exception 'Bitte den Nachnamen des Bauherrn eintragen.'; end if;

  insert into public.projects (bauherr_label, kind, status, abm_nr, hausbau_nr, company_id, salesperson_id, location, architect_id, planer_id, intake_month)
  values (trim(p_bauherr_label), p_kind, 'aktiv', nullif(trim(p_abm_nr), ''), nullif(trim(p_hausbau_nr), ''), p_company, p_salesperson,
          nullif(trim(p_location), ''), p_architect, p_planer, p_intake_month)
  returning id into v_id;

  if nullif(trim(p_vermesser), '') is not null then
    insert into public.project_parties (project_id, role, name) values (v_id, 'vermesser', trim(p_vermesser));
  end if;

  insert into public.activities (project_id, kind, text, actor, actor_id) values (v_id, 'projekt', 'Projekt angelegt', v_name, auth.uid());
  if nullif(trim(p_folders_note), '') is not null then
    insert into public.activities (project_id, kind, text, actor, actor_id) values (v_id, 'projekt', trim(p_folders_note), v_name, auth.uid());
  end if;

  if nullif(trim(p_followup_title), '') is not null then
    insert into public.tasks (project_id, title, due_on, assignee_id, source, source_key, created_by)
    values (v_id, trim(p_followup_title), p_followup_due, p_architect, 'manuell', 'angaben:' || v_id::text, auth.uid());
  end if;

  return v_id;
end $$;

revoke all on function public.create_project(text, public.project_kind, text, text, uuid, uuid, text, uuid, uuid, date, text, text, date, text) from public, anon;
grant execute on function public.create_project(text, public.project_kind, text, text, uuid, uuid, text, uuid, uuid, date, text, text, date, text) to authenticated, service_role;
