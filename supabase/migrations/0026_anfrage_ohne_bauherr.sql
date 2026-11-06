-- ABM Projekt-App: Anfrage ohne Bauherr
--   Anlass: Verkäufer fragen oft erst einen Bauplatz an (Prüfung Bebauungsplan), ein Bauherr steht noch nicht fest.
--   * projects.bauherr_offen: der Projektname (bauherr_label) ist dann z. B. der Bauort, nicht der Nachname von Bauherr 1.
--     Nur bei Anfragen (und abgesagten Anfragen): als aktives Projekt annehmen geht erst mit Bauherr (Constraint).
--   * Ändert sich der Projektname (Nachname von Bauherr 1 eingetragen, update_project), ist der Bauherr nicht mehr offen
--     (Trigger, gilt für jeden Weg).
--   * create_project wie in 0022, zusätzlich mit "bauherr_offen" (nur bei Status "anfrage").
--   * set_project_bauherr wie in 0024, nimmt bei offenem Bauherrn den Projektnamen nicht als Namen des Bauherrn.

alter table public.projects add column if not exists bauherr_offen boolean not null default false;

alter table public.projects add constraint projects_bauherr_offen_nur_anfrage
  check (not bauherr_offen or status::text in ('anfrage', 'storno'));

create or replace function public.projects_bauherr_benannt() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.bauherr_label is distinct from old.bauherr_label then new.bauherr_offen := false; end if;
  return new;
end $$;

create trigger projects_bauherr_benannt before update of bauherr_label on public.projects
  for each row execute function public.projects_bauherr_benannt();

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
  v_offen boolean;
begin
  if not public.is_staff() then raise exception 'Keine Berechtigung für diese Aktion'; end if;
  v_offen := coalesce((p_project->>'bauherr_offen')::boolean, false) and public.clean_text(p_project->>'status') = 'anfrage';
  if length(coalesce(public.clean_text(p_project->>'bauherr_label'), '')) < 2 then
    raise exception '%', case when v_offen then 'Ohne Bauherr braucht die Anfrage einen Namen (z. B. den Bauort).' else 'Bitte den Nachnamen des Bauherrn eintragen.' end;
  end if;

  insert into public.projects (bauherr_label, kind, status, abm_nr, hausbau_nr, company_id, salesperson_id, location, architect_id, planer_id, intake_month, flurstueck, gemarkung, flur, bundesland, baubegleitung, anfrage_text, bauherr_offen)
  values (public.clean_text(p_project->>'bauherr_label'),
          coalesce(public.clean_text(p_project->>'kind'), 'neubau')::public.project_kind,
          case when public.clean_text(p_project->>'status') = 'anfrage' then 'anfrage'::public.project_status else 'aktiv'::public.project_status end,
          public.clean_text(p_project->>'abm_nr'), public.clean_text(p_project->>'hausbau_nr'),
          public.clean_text(p_project->>'company_id')::uuid, public.clean_text(p_project->>'salesperson_id')::uuid,
          public.clean_text(p_project->>'location'),
          public.clean_text(p_project->>'architect_id')::uuid, public.clean_text(p_project->>'planer_id')::uuid,
          public.clean_text(p_project->>'intake_month')::date,
          public.clean_text(p_project->>'flurstueck'), public.clean_text(p_project->>'gemarkung'), public.clean_text(p_project->>'flur'),
          upper(public.clean_text(p_project->>'bundesland')),
          coalesce((p_project->>'baubegleitung')::boolean, true),
          public.clean_text(p_project->>'anfrage_text'),
          v_offen)
  returning id into v_id;

  perform public.set_project_bauherr(v_id, p_bauherr);

  if public.clean_text(p_vermesser) is not null then
    insert into public.project_parties (project_id, role, name) values (v_id, 'vermesser', public.clean_text(p_vermesser));
  end if;

  insert into public.activities (project_id, kind, text, actor, actor_id) values (v_id, 'projekt', case when public.clean_text(p_project->>'status') = 'anfrage' then 'Anfrage angelegt' else 'Projekt angelegt' end, v_name, auth.uid());
  if public.clean_text(p_folders_note) is not null then
    insert into public.activities (project_id, kind, text, actor, actor_id) values (v_id, 'projekt', public.clean_text(p_folders_note), v_name, auth.uid());
  end if;

  if public.clean_text(p_followup_title) is not null then
    perform public.sync_followup_task(v_id, p_followup_title, p_followup_due);
  end if;
  return v_id;
end $$;


create or replace function public.set_project_bauherr(p_project uuid, p_bauherr jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_b     uuid;
  v_label text;
  v_name  text;
  j       jsonb := p_bauherr;
begin
  if not public.is_staff() then raise exception 'Keine Berechtigung für diese Aktion'; end if;
  if j is null or jsonb_typeof(j) <> 'object' then return; end if;
  -- Bauherr noch offen: der Projektname ist dann z. B. der Bauort und kein Name eines Bauherrn
  select bauherr_id, case when bauherr_offen then null else bauherr_label end into v_b, v_label from public.projects where id = p_project;
  v_name := coalesce(public.clean_text(j->>'name'), v_label, 'Bauherr noch offen');
  if v_b is null then
    -- ohne jede Angabe keinen leeren Bauherrn anlegen
    if coalesce(public.clean_text(j->>'phone'), public.clean_text(j->>'email'), public.clean_text(j->>'address'),
                public.clean_text(j->>'building_address'), public.clean_text(j->>'name'), public.clean_text(j->>'name2'),
                public.clean_text(j->>'phone2'), public.clean_text(j->>'email2'),
                public.clean_text(j->>'name3'), public.clean_text(j->>'phone3'), public.clean_text(j->>'email3'),
                public.clean_text(j->>'name4'), public.clean_text(j->>'phone4'), public.clean_text(j->>'email4'),
                public.clean_text(j->>'vorname'), public.clean_text(j->>'vorname2'), public.clean_text(j->>'nachname2'),
                public.clean_text(j->>'vorname3'), public.clean_text(j->>'nachname3'),
                public.clean_text(j->>'vorname4'), public.clean_text(j->>'nachname4'),
                public.clean_text(j->>'street'),
                public.clean_text(j->>'postal_code'), public.clean_text(j->>'city'), public.clean_text(j->>'mobile'),
                public.clean_text(j->>'site_street'), public.clean_text(j->>'site_postal_code'), public.clean_text(j->>'site_city'),
                public.clean_text(j->>'site_district'), public.clean_text(j->>'site_state')) is null then
      return;
    end if;
    insert into public.bauherren (name, address, phone, email, building_address, name2, phone2, email2,
                                  name3, phone3, email3, name4, phone4, email4,
                                  vorname, nachname, vorname2, nachname2, vorname3, nachname3, vorname4, nachname4,
                                  street, postal_code, city, mobile, site_street, site_postal_code, site_city, site_district, site_state)
    values (v_name, public.clean_text(j->>'address'), public.clean_text(j->>'phone'), public.clean_text(j->>'email'),
            public.clean_text(j->>'building_address'), public.clean_text(j->>'name2'), public.clean_text(j->>'phone2'),
            public.clean_text(j->>'email2'),
            public.clean_text(j->>'name3'), public.clean_text(j->>'phone3'), public.clean_text(j->>'email3'),
            public.clean_text(j->>'name4'), public.clean_text(j->>'phone4'), public.clean_text(j->>'email4'),
            public.clean_text(j->>'vorname'), public.clean_text(j->>'nachname'),
            public.clean_text(j->>'vorname2'), public.clean_text(j->>'nachname2'),
            public.clean_text(j->>'vorname3'), public.clean_text(j->>'nachname3'),
            public.clean_text(j->>'vorname4'), public.clean_text(j->>'nachname4'),
            public.clean_text(j->>'street'), public.clean_text(j->>'postal_code'),
            public.clean_text(j->>'city'), public.clean_text(j->>'mobile'), public.clean_text(j->>'site_street'),
            public.clean_text(j->>'site_postal_code'), public.clean_text(j->>'site_city'), public.clean_text(j->>'site_district'),
            public.clean_text(j->>'site_state'))
    returning id into v_b;
    update public.projects set bauherr_id = v_b where id = p_project;
  else
    update public.bauherren
      set name = v_name,
          address = public.clean_text(j->>'address'),
          phone = public.clean_text(j->>'phone'),
          email = public.clean_text(j->>'email'),
          building_address = public.clean_text(j->>'building_address'),
          name2 = public.clean_text(j->>'name2'),
          phone2 = public.clean_text(j->>'phone2'),
          email2 = public.clean_text(j->>'email2'),
          name3            = case when j ? 'name3'            then public.clean_text(j->>'name3')            else name3            end,
          phone3           = case when j ? 'phone3'           then public.clean_text(j->>'phone3')           else phone3           end,
          email3           = case when j ? 'email3'           then public.clean_text(j->>'email3')           else email3           end,
          name4            = case when j ? 'name4'            then public.clean_text(j->>'name4')            else name4            end,
          phone4           = case when j ? 'phone4'           then public.clean_text(j->>'phone4')           else phone4           end,
          email4           = case when j ? 'email4'           then public.clean_text(j->>'email4')           else email4           end,
          vorname          = case when j ? 'vorname'          then public.clean_text(j->>'vorname')          else vorname          end,
          nachname         = case when j ? 'nachname'         then public.clean_text(j->>'nachname')         else nachname         end,
          vorname2         = case when j ? 'vorname2'         then public.clean_text(j->>'vorname2')         else vorname2         end,
          nachname2        = case when j ? 'nachname2'        then public.clean_text(j->>'nachname2')        else nachname2        end,
          vorname3         = case when j ? 'vorname3'         then public.clean_text(j->>'vorname3')         else vorname3         end,
          nachname3        = case when j ? 'nachname3'        then public.clean_text(j->>'nachname3')        else nachname3        end,
          vorname4         = case when j ? 'vorname4'         then public.clean_text(j->>'vorname4')         else vorname4         end,
          nachname4        = case when j ? 'nachname4'        then public.clean_text(j->>'nachname4')        else nachname4        end,
          street           = case when j ? 'street'           then public.clean_text(j->>'street')           else street           end,
          postal_code      = case when j ? 'postal_code'      then public.clean_text(j->>'postal_code')      else postal_code      end,
          city             = case when j ? 'city'             then public.clean_text(j->>'city')             else city             end,
          mobile           = case when j ? 'mobile'           then public.clean_text(j->>'mobile')           else mobile           end,
          site_street      = case when j ? 'site_street'      then public.clean_text(j->>'site_street')      else site_street      end,
          site_postal_code = case when j ? 'site_postal_code' then public.clean_text(j->>'site_postal_code') else site_postal_code end,
          site_city        = case when j ? 'site_city'        then public.clean_text(j->>'site_city')        else site_city        end,
          site_district    = case when j ? 'site_district'    then public.clean_text(j->>'site_district')    else site_district    end,
          site_state       = case when j ? 'site_state'       then public.clean_text(j->>'site_state')       else site_state       end
      where id = v_b;
  end if;
end $$;

-- "create or replace" behält die Rechte; zur Sicherheit erneut wie in 0013
revoke all on function public.set_project_bauherr(uuid, jsonb), public.create_project(jsonb, jsonb, text, text, date, text) from public, anon;
grant execute on function public.set_project_bauherr(uuid, jsonb), public.create_project(jsonb, jsonb, text, text, date, text) to authenticated, service_role;
revoke all on function public.projects_bauherr_benannt() from public, anon, authenticated;
