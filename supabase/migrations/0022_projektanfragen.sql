-- ABM Projekt-App: Projektanfragen
--   * Neuer Status "anfrage": eine Anfrage vom Verkäufer, noch kein laufendes Projekt. Ablauf: Anfrage, aktiv, abgeschlossen.
--     Warnungen, Dashboard und Pipeline zählen weiter nur "aktiv". Zeilenregeln wie bei allen Projekten (0001).
--   * projects.anfrage_text: Nachricht des Verkäufers, z. B. mit Terminvorschlägen. Eigene Spalte, weil in notes Hinweise
--     aus dem Excel-Import stehen.
--   * create_project und update_project wie in 0021, zusätzlich mit "status" (nur beim Anlegen, nur "anfrage" oder aktiv)
--     und "anfrage_text". Verlaufstexte für den neuen Status.
--   * Der neue Enum-Wert wird hier nur in Funktionsrümpfen genannt, die erst später laufen. Deshalb geht das auch in einer
--     Transaktion (npm run db:bundle).

alter type public.project_status add value if not exists 'anfrage';

alter table public.projects add column if not exists anfrage_text text;

create or replace function public.activities_on_project_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  insert into public.activities (project_id, kind, text, actor, actor_id, details)
  values (new.id, 'projekt',
          case
            when new.status::text = 'aktiv' and old.status::text = 'anfrage' then 'Anfrage als Projekt angenommen'
            when new.status::text = 'aktiv' then 'Projekt wieder aktiv'
            when new.status::text = 'anfrage' then 'Zurück zu den Anfragen'
            when new.status::text = 'abgeschlossen' then 'Projekt abgeschlossen'
            when new.status::text = 'storno' then 'Projekt storniert'
            else 'Status geändert: ' || new.status::text
          end,
          public.activity_actor(), auth.uid(),
          jsonb_build_object('aktion', 'status', 'von', old.status, 'nach', new.status));
  return new;
end $$;

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

  insert into public.projects (bauherr_label, kind, status, abm_nr, hausbau_nr, company_id, salesperson_id, location, architect_id, planer_id, intake_month, flurstueck, gemarkung, flur, bundesland, baubegleitung, anfrage_text)
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
          public.clean_text(p_project->>'anfrage_text'))
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
    gemarkung      = case when j ? 'gemarkung'      then public.clean_text(j->>'gemarkung')             else gemarkung      end,
    flur           = case when j ? 'flur'           then public.clean_text(j->>'flur')                  else flur           end,
    bundesland     = case when j ? 'bundesland'     then upper(public.clean_text(j->>'bundesland'))     else bundesland     end,
    baubegleitung  = case when j ? 'baubegleitung'  then coalesce((j->>'baubegleitung')::boolean, baubegleitung) else baubegleitung end,
    anfrage_text   = case when j ? 'anfrage_text'   then public.clean_text(j->>'anfrage_text')          else anfrage_text   end
  where id = p_id;

  perform public.set_project_bauherr(p_id, p_bauherr);

  if p_parties is not null and jsonb_typeof(p_parties) = 'object' then
    for v_role, v_val in select key, value from jsonb_each(p_parties) loop
      if jsonb_typeof(v_val) = 'object' and public.clean_text(v_val->>'name') is not null then
        insert into public.project_parties as pp (project_id, role, name, contact, address, phone, mobile, email, fax)
        values (p_id, v_role, public.clean_text(v_val->>'name'), public.clean_text(v_val->>'contact'),
                public.clean_text(v_val->>'address'), public.clean_text(v_val->>'phone'), public.clean_text(v_val->>'mobile'),
                public.clean_text(v_val->>'email'), public.clean_text(v_val->>'fax'))
        on conflict (project_id, role) do update set
          name    = excluded.name,
          contact = case when v_val ? 'contact' then excluded.contact else pp.contact end,
          address = case when v_val ? 'address' then excluded.address else pp.address end,
          phone   = case when v_val ? 'phone'   then excluded.phone   else pp.phone   end,
          mobile  = case when v_val ? 'mobile'  then excluded.mobile  else pp.mobile  end,
          email   = case when v_val ? 'email'   then excluded.email   else pp.email   end,
          fax     = case when v_val ? 'fax'     then excluded.fax     else pp.fax     end;
      else
        delete from public.project_parties where project_id = p_id and role = v_role;
      end if;
    end loop;
  end if;

  if public.clean_text(p_activity) is not null then
    insert into public.activities (project_id, kind, text, actor, actor_id)
    values (p_id, 'projekt', public.clean_text(p_activity), public.current_user_name(), auth.uid());
  end if;

  perform public.sync_followup_task(p_id, p_followup_title, p_followup_due);
end $$;


-- "create or replace" behält die Rechte; zur Sicherheit erneut wie in 0021
revoke all on function public.create_project(jsonb, jsonb, text, text, date, text),
  public.update_project(uuid, jsonb, jsonb, jsonb, text, text, date) from public, anon;
grant execute on function public.create_project(jsonb, jsonb, text, text, date, text),
  public.update_project(uuid, jsonb, jsonb, jsonb, text, text, date) to authenticated, service_role;
