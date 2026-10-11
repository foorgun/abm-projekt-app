-- ABM Projekt-App: Projektdaten bearbeiten, Kontaktdaten des Bauherrn anlegen und pflegen,
-- Aufgabe "Fehlende Angaben nachfragen" schließt sich, sobald nichts mehr fehlt.

-- ---------------------------------------------------------------------------
-- Rechte. Zeilenregeln bestehen schon: bauherren_staff (0001) und parties_write (0002) lassen nur Admin und
-- Mitarbeiter schreiben. Freiberufler haben auf bauherren weiterhin keine einzige Zeile.
-- ---------------------------------------------------------------------------
grant insert (name, address, phone, email, building_address) on public.bauherren to authenticated;
grant update (name, address, phone, email, building_address) on public.bauherren to authenticated;
grant update (name, contact) on public.project_parties to authenticated;
grant delete on public.project_parties to authenticated;   -- Beteiligten wieder austragen

-- Leere Zeichenkette → null, sonst ohne Rand-Leerzeichen
create function public.clean_text(t text) returns text
language sql immutable as $$ select nullif(trim(t), '') $$;

-- Kontaktdaten des Bauherrn zu einem Projekt setzen (legt den Bauherrn an, falls es noch keinen gibt).
-- p_bauherr: {"name", "phone", "email", "address", "building_address"}; fehlende oder leere Werte werden geleert.
create function public.set_project_bauherr(p_project uuid, p_bauherr jsonb) returns void
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
                public.clean_text(p_bauherr->>'name')) is null then
      return;
    end if;
    insert into public.bauherren (name, address, phone, email, building_address)
    values (v_name, public.clean_text(p_bauherr->>'address'), public.clean_text(p_bauherr->>'phone'),
            public.clean_text(p_bauherr->>'email'), public.clean_text(p_bauherr->>'building_address'))
    returning id into v_b;
    update public.projects set bauherr_id = v_b where id = p_project;
  else
    update public.bauherren
      set name = v_name,
          address = public.clean_text(p_bauherr->>'address'),
          phone = public.clean_text(p_bauherr->>'phone'),
          email = public.clean_text(p_bauherr->>'email'),
          building_address = public.clean_text(p_bauherr->>'building_address')
      where id = v_b;
  end if;
end $$;

-- Aufgabe "Fehlende Angaben nachfragen" eines Projekts abgleichen (eine je Projekt, Schlüssel "angaben:<Projekt>").
--   Titel leer  → offene Aufgabe erledigen (nichts fehlt mehr)
--   Titel da    → offene Aufgabe umbenennen; gibt es noch gar keine, anlegen.
--   Eine von Hand erledigte Aufgabe bleibt erledigt und wird nicht neu angelegt.
create function public.sync_followup_task(p_project uuid, p_title text, p_due date) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_key   text := 'angaben:' || p_project::text;
  v_title text := public.clean_text(p_title);
begin
  if not public.is_staff() then raise exception 'Keine Berechtigung für diese Aktion'; end if;
  if v_title is null then
    update public.tasks set status = 'erledigt', done_at = now() where source_key = v_key and status = 'offen';
  elsif exists (select 1 from public.tasks where source_key = v_key) then
    update public.tasks set title = v_title where source_key = v_key and status = 'offen' and title <> v_title;
  else
    insert into public.tasks (project_id, title, due_on, assignee_id, source, source_key, created_by)
    select p_project, v_title, p_due, p.architect_id, 'manuell', v_key, auth.uid() from public.projects p where p.id = p_project;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Projekt anlegen (ersetzt die Fassung aus 0007): jetzt mit Kontaktdaten des Bauherrn.
-- p_project: {"bauherr_label", "kind", "abm_nr", "hausbau_nr", "company_id", "salesperson_id", "location",
--             "architect_id", "planer_id", "intake_month"}
-- ---------------------------------------------------------------------------
drop function public.create_project(text, public.project_kind, text, text, uuid, uuid, text, uuid, uuid, date, text, text, date, text);

create function public.create_project(
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

  insert into public.projects (bauherr_label, kind, status, abm_nr, hausbau_nr, company_id, salesperson_id, location, architect_id, planer_id, intake_month)
  values (public.clean_text(p_project->>'bauherr_label'),
          coalesce(public.clean_text(p_project->>'kind'), 'neubau')::public.project_kind, 'aktiv',
          public.clean_text(p_project->>'abm_nr'), public.clean_text(p_project->>'hausbau_nr'),
          public.clean_text(p_project->>'company_id')::uuid, public.clean_text(p_project->>'salesperson_id')::uuid,
          public.clean_text(p_project->>'location'),
          public.clean_text(p_project->>'architect_id')::uuid, public.clean_text(p_project->>'planer_id')::uuid,
          public.clean_text(p_project->>'intake_month')::date)
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

-- ---------------------------------------------------------------------------
-- Projektdaten bearbeiten: Projekt, Bauherr, Beteiligte, Aufgabe und Protokoll in einer Transaktion.
--   p_project: nur die Schlüssel, die sich ändern sollen (dieselben wie beim Anlegen, dazu "baubetreuung");
--              null als Wert leert das Feld
--   p_bauherr: null = unverändert, sonst alle Kontaktfelder (siehe set_project_bauherr)
--   p_parties: {"vermesser": {"name", "contact"}, "strom": null, …}; null trägt den Beteiligten aus
--   p_activity: Text für das Protokoll (welche Felder geändert wurden, ohne die Werte)
--   p_followup_title/_due: siehe sync_followup_task; wird bei jedem Speichern abgeglichen
-- ---------------------------------------------------------------------------
create function public.update_project(
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
    baubetreuung   = case when j ? 'baubetreuung'   then public.clean_text(j->>'baubetreuung')          else baubetreuung   end
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

revoke all on function public.clean_text(text), public.set_project_bauherr(uuid, jsonb), public.sync_followup_task(uuid, text, date),
  public.create_project(jsonb, jsonb, text, text, date, text),
  public.update_project(uuid, jsonb, jsonb, jsonb, text, text, date) from public, anon;
grant execute on function public.clean_text(text), public.set_project_bauherr(uuid, jsonb), public.sync_followup_task(uuid, text, date),
  public.create_project(jsonb, jsonb, text, text, date, text),
  public.update_project(uuid, jsonb, jsonb, jsonb, text, text, date) to authenticated, service_role;
