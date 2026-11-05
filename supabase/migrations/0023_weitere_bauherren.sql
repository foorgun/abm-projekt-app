-- ABM Projekt-App: bis zu vier Bauherren je Projekt (bisher zwei).
--   * Dritter und vierter Bauherr liegen wie der zweite (0010) bei den Kontaktdaten, nicht am Projekt: Projekte sehen auch
--     Freiberufler, Kontaktdaten der Bauherren nie. Die Zeilenregel bauherren_staff (0001) gilt damit auch für die neuen Spalten.
--   * set_project_bauherr wie in 0013, zusätzlich mit den neuen Feldern. Neue Schlüssel ändern nur, wenn sie im JSON stehen
--     (ältere Aufrufer lassen sie damit unverändert).
-- Die Datei lässt sich mehrfach ausführen.

alter table public.bauherren
  add column if not exists name3  text,
  add column if not exists phone3 text,
  add column if not exists email3 text,
  add column if not exists name4  text,
  add column if not exists phone4 text,
  add column if not exists email4 text;

grant insert (name3, phone3, email3, name4, phone4, email4) on public.bauherren to authenticated;
grant update (name3, phone3, email3, name4, phone4, email4) on public.bauherren to authenticated;

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
  select bauherr_id, bauherr_label into v_b, v_label from public.projects where id = p_project;
  v_name := coalesce(public.clean_text(j->>'name'), v_label);
  if v_b is null then
    -- ohne jede Angabe keinen leeren Bauherrn anlegen
    if coalesce(public.clean_text(j->>'phone'), public.clean_text(j->>'email'), public.clean_text(j->>'address'),
                public.clean_text(j->>'building_address'), public.clean_text(j->>'name'), public.clean_text(j->>'name2'),
                public.clean_text(j->>'phone2'), public.clean_text(j->>'email2'),
                public.clean_text(j->>'name3'), public.clean_text(j->>'phone3'), public.clean_text(j->>'email3'),
                public.clean_text(j->>'name4'), public.clean_text(j->>'phone4'), public.clean_text(j->>'email4'),
                public.clean_text(j->>'street'),
                public.clean_text(j->>'postal_code'), public.clean_text(j->>'city'), public.clean_text(j->>'mobile'),
                public.clean_text(j->>'site_street'), public.clean_text(j->>'site_postal_code'), public.clean_text(j->>'site_city'),
                public.clean_text(j->>'site_district'), public.clean_text(j->>'site_state')) is null then
      return;
    end if;
    insert into public.bauherren (name, address, phone, email, building_address, name2, phone2, email2,
                                  name3, phone3, email3, name4, phone4, email4,
                                  street, postal_code, city, mobile, site_street, site_postal_code, site_city, site_district, site_state)
    values (v_name, public.clean_text(j->>'address'), public.clean_text(j->>'phone'), public.clean_text(j->>'email'),
            public.clean_text(j->>'building_address'), public.clean_text(j->>'name2'), public.clean_text(j->>'phone2'),
            public.clean_text(j->>'email2'),
            public.clean_text(j->>'name3'), public.clean_text(j->>'phone3'), public.clean_text(j->>'email3'),
            public.clean_text(j->>'name4'), public.clean_text(j->>'phone4'), public.clean_text(j->>'email4'),
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
