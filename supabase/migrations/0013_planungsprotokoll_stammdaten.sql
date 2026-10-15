-- ABM Projekt-App: Stammdaten für das Planungsprotokoll (Seite 1 automatisch befüllen).
--   * Projektbeteiligte: neue Rollen (Kellerbauer/Bodenplatte, Baugrundgutachter, Gemeinde, Bauamt, Schornsteinfeger,
--     Gas, Fernwärme, Abwasser, Sonstige, Sachbearbeiter) und getrennt Anschrift, Telefon, Mobil, E-Mail, Fax.
--     Die alte Kontaktzeile ("contact") bleibt erhalten.
--   * Bauherren: Wohnanschrift getrennt (Straße, PLZ, Ort), Mobil getrennt vom Telefon, Bauort getrennt (Straße/Baugebiet,
--     PLZ, Ort, Ortsteil, Bundesland). Der Bauort liegt wie die Bauadresse beim Bauherrn: Freiberufler sehen ihn nicht.
--   * Projekte: Flur (getrennt vom Flurstück)
--   * Bürodaten (buero_daten): eine Zeile mit Name/Anschrift, Tel., Mobil, E-Mail des Büros. Lesen Admin und Mitarbeiter,
--     ändern nur Admins. Freiberufler: kein Zugriff.
--   * Bestehende Daten werden übernommen, wo es eindeutig ist (Anschrift "Straße, PLZ Ort" aufteilen, Telefon und E-Mail
--     aus der Kontaktzeile, alte Spalten surveyor/basement_builder als Beteiligte). Nichts wird gelöscht.
--
-- Wer darf was:
--   * Neue Rollen: nur Admin und Mitarbeiter (Lesen und Schreiben). Freiberufler sehen wie bisher nur die fünf Rollen aus
--     Liste.docx (Vermesser, Erdbauer, Strom, Wasser, Elektriker Baustrom) ihrer zugewiesenen Projekte, mit allen Spalten.
--   * Schreiben bleibt bei Admin und Mitarbeiter (Regel parties_write aus 0002, bauherren_staff aus 0001).
--
-- Die Rolle ist ab hier Text mit Prüfregel statt Enum: neue Werte eines Enums ließen sich in derselben Transaktion
-- (npm run db:bundle fasst alles in eine) nicht verwenden, und die Datenübernahme unten braucht sie.
-- Die Datei lässt sich mehrfach ausführen (if not exists, or replace, drop … if exists).

-- ---------------------------------------------------------------------------
-- Projektbeteiligte: Rollen und getrennte Kontaktangaben
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'project_parties' and column_name = 'role' and data_type = 'USER-DEFINED') then
    alter table public.project_parties alter column role type text using role::text;
  end if;
end $$;

alter table public.project_parties drop constraint if exists project_parties_role_check;
alter table public.project_parties add constraint project_parties_role_check check (role in (
  'vermesser', 'erdbauer', 'strom', 'wasser', 'elektriker_baustrom',
  'kellerbauer', 'baugrundgutachter', 'gemeinde', 'bauamt', 'schornsteinfeger', 'gas', 'fernwaerme', 'abwasser', 'sonstige',
  'sachbearbeiter'));

alter table public.project_parties
  add column if not exists address text,
  add column if not exists phone   text,
  add column if not exists mobile  text,
  add column if not exists email   text,
  add column if not exists fax     text;

grant insert (address, phone, mobile, email, fax) on public.project_parties to authenticated;  -- Zeilenregel: parties_write (0002)
grant update (address, phone, mobile, email, fax) on public.project_parties to authenticated;

-- Lesen: wie das Projekt, die neuen Rollen aber nur Admin und Mitarbeiter
drop policy if exists parties_read on public.project_parties;
create policy parties_read on public.project_parties for select to authenticated
  using (public.has_project_access(project_id)
         and (public.is_staff() or role in ('vermesser', 'erdbauer', 'strom', 'wasser', 'elektriker_baustrom')));

-- ---------------------------------------------------------------------------
-- Bauherren: Anschrift, Mobil und Bauort getrennt
-- ---------------------------------------------------------------------------
alter table public.bauherren
  add column if not exists street           text,
  add column if not exists postal_code      text,
  add column if not exists city             text,
  add column if not exists mobile           text,
  add column if not exists site_street      text,
  add column if not exists site_postal_code text,
  add column if not exists site_city        text,
  add column if not exists site_district    text,
  add column if not exists site_state       text;

grant insert (street, postal_code, city, mobile, site_street, site_postal_code, site_city, site_district, site_state) on public.bauherren to authenticated;
grant update (street, postal_code, city, mobile, site_street, site_postal_code, site_city, site_district, site_state) on public.bauherren to authenticated;

-- Projekte: Flur (Rechte: projects ist für authenticated tabellenweit änderbar, 0004; Zeilenregeln unverändert)
alter table public.projects add column if not exists flur text;

-- ---------------------------------------------------------------------------
-- Bürodaten (Einstellungen): genau eine Zeile
-- ---------------------------------------------------------------------------
create table if not exists public.buero_daten (
  id            boolean primary key default true check (id),
  name          text,
  anschrift     text,
  tel           text,
  mobil         text,
  email         text,
  geaendert_von uuid references auth.users(id) on delete set null,
  geaendert_am  timestamptz not null default now()
);
insert into public.buero_daten (id) values (true) on conflict (id) do nothing;

-- Werte bereinigen und Änderung stempeln (wer, wann); gilt für jeden Weg, auch Skripte
create or replace function public.buero_daten_stempel() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  new.name := public.clean_text(new.name);
  new.anschrift := public.clean_text(new.anschrift);
  new.tel := public.clean_text(new.tel);
  new.mobil := public.clean_text(new.mobil);
  new.email := public.clean_text(new.email);
  if new.email is not null and new.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Bitte eine gültige E-Mail-Adresse eintragen.'; end if;
  new.geaendert_am := now();
  new.geaendert_von := auth.uid();
  return new;
end $$;
drop trigger if exists buero_daten_stempel on public.buero_daten;
create trigger buero_daten_stempel before insert or update on public.buero_daten
  for each row execute function public.buero_daten_stempel();

alter table public.buero_daten enable row level security;
drop policy if exists buero_daten_read on public.buero_daten;
drop policy if exists buero_daten_admin_update on public.buero_daten;
create policy buero_daten_read on public.buero_daten for select to authenticated using (public.is_staff());
create policy buero_daten_admin_update on public.buero_daten for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.buero_daten from anon, authenticated, public;
grant select on public.buero_daten to authenticated;
grant update (name, anschrift, tel, mobil, email) on public.buero_daten to authenticated;   -- keine neue Zeile, kein Löschen
grant all on public.buero_daten to service_role;
revoke all on function public.buero_daten_stempel() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Bestehende Daten übernehmen (nur wo eindeutig, nur in leere Felder; alte Spalten bleiben).
-- Als Funktion, damit supabase/tests/rls_test.sql sie gegen Testdaten prüfen kann. Mehrfach aufrufbar.
-- ---------------------------------------------------------------------------
create or replace function public.stammdaten_0013_uebernehmen() returns void
language plpgsql security invoker set search_path = public as $$
begin
  -- "Straße 1, 89077 Ort" → Straße, PLZ, Ort
  update public.bauherren b set street = x.m[1], postal_code = x.m[2], city = x.m[3]
  from (select id, regexp_match(address, '^\s*(.+?)\s*,\s*(\d{5})\s+(.+?)\s*$') as m from public.bauherren) x
  where x.id = b.id and x.m is not null and b.street is null and b.postal_code is null and b.city is null;

  update public.bauherren b set site_street = x.m[1], site_postal_code = x.m[2], site_city = x.m[3]
  from (select id, regexp_match(building_address, '^\s*(.+?)\s*,\s*(\d{5})\s+(.+?)\s*$') as m from public.bauherren) x
  where x.id = b.id and x.m is not null and b.site_street is null and b.site_postal_code is null and b.site_city is null;

  -- Kontaktzeile der Beteiligten: E-Mail und Telefonnummer herauslösen
  update public.project_parties set email = substring(contact from '[^\s,;]+@[^\s,;]+\.[A-Za-z]{2,}')
  where email is null and contact ~ '[^\s,;]+@[^\s,;]+\.[A-Za-z]{2,}';
  update public.project_parties set phone = trim(substring(contact from '\+?\d[\d\s/()-]{5,}\d'))
  where phone is null and contact ~ '\+?\d[\d\s/()-]{5,}\d';

  -- Altspalten aus 0001 (Excel-Import): Vermesser und Kellerbauer als Beteiligte, wenn das Projekt noch keinen hat
  insert into public.project_parties (project_id, role, name)
  select p.id, 'vermesser', public.clean_text(b.surveyor) from public.projects p join public.bauherren b on b.id = p.bauherr_id
  where public.clean_text(b.surveyor) is not null
  on conflict (project_id, role) do nothing;
  insert into public.project_parties (project_id, role, name)
  select p.id, 'kellerbauer', public.clean_text(b.basement_builder) from public.projects p join public.bauherren b on b.id = p.bauherr_id
  where public.clean_text(b.basement_builder) is not null
  on conflict (project_id, role) do nothing;
end $$;
revoke all on function public.stammdaten_0013_uebernehmen() from public, anon, authenticated;
select public.stammdaten_0013_uebernehmen();

-- ---------------------------------------------------------------------------
-- Kontaktdaten des Bauherrn: jetzt mit getrennter Anschrift, Mobil und Bauort.
-- Neue Schlüssel ändern nur, wenn sie im JSON stehen (ältere Aufrufer lassen sie damit unverändert).
-- Sonst unverändert zu 0010.
-- ---------------------------------------------------------------------------
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
                public.clean_text(j->>'phone2'), public.clean_text(j->>'email2'), public.clean_text(j->>'street'),
                public.clean_text(j->>'postal_code'), public.clean_text(j->>'city'), public.clean_text(j->>'mobile'),
                public.clean_text(j->>'site_street'), public.clean_text(j->>'site_postal_code'), public.clean_text(j->>'site_city'),
                public.clean_text(j->>'site_district'), public.clean_text(j->>'site_state')) is null then
      return;
    end if;
    insert into public.bauherren (name, address, phone, email, building_address, name2, phone2, email2,
                                  street, postal_code, city, mobile, site_street, site_postal_code, site_city, site_district, site_state)
    values (v_name, public.clean_text(j->>'address'), public.clean_text(j->>'phone'), public.clean_text(j->>'email'),
            public.clean_text(j->>'building_address'), public.clean_text(j->>'name2'), public.clean_text(j->>'phone2'),
            public.clean_text(j->>'email2'), public.clean_text(j->>'street'), public.clean_text(j->>'postal_code'),
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

-- ---------------------------------------------------------------------------
-- Projekt anlegen: jetzt mit "flur". Sonst unverändert zu 0010.
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

  insert into public.projects (bauherr_label, kind, status, abm_nr, hausbau_nr, company_id, salesperson_id, location, architect_id, planer_id, intake_month, flurstueck, gemarkung, flur)
  values (public.clean_text(p_project->>'bauherr_label'),
          coalesce(public.clean_text(p_project->>'kind'), 'neubau')::public.project_kind, 'aktiv',
          public.clean_text(p_project->>'abm_nr'), public.clean_text(p_project->>'hausbau_nr'),
          public.clean_text(p_project->>'company_id')::uuid, public.clean_text(p_project->>'salesperson_id')::uuid,
          public.clean_text(p_project->>'location'),
          public.clean_text(p_project->>'architect_id')::uuid, public.clean_text(p_project->>'planer_id')::uuid,
          public.clean_text(p_project->>'intake_month')::date,
          public.clean_text(p_project->>'flurstueck'), public.clean_text(p_project->>'gemarkung'), public.clean_text(p_project->>'flur'))
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
-- Projektdaten bearbeiten: jetzt mit "flur" und getrennten Kontaktangaben der Beteiligten.
--   p_parties: {"vermesser": {"name", "contact", "address", "phone", "mobile", "email", "fax"}, "gas": null, …}
--   Fehlt ein Schlüssel (außer "name"), bleibt der bisherige Wert: die Übersicht speichert nur Name und Kontaktzeile.
--   null trägt den Beteiligten aus. Sonst unverändert zu 0010.
-- ---------------------------------------------------------------------------
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
    flur           = case when j ? 'flur'           then public.clean_text(j->>'flur')                  else flur           end
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

-- "create or replace" behält die Rechte aus 0008 (nur authenticated und service_role); zur Sicherheit erneut:
revoke all on function public.set_project_bauherr(uuid, jsonb), public.create_project(jsonb, jsonb, text, text, date, text),
  public.update_project(uuid, jsonb, jsonb, jsonb, text, text, date) from public, anon;
grant execute on function public.set_project_bauherr(uuid, jsonb), public.create_project(jsonb, jsonb, text, text, date, text),
  public.update_project(uuid, jsonb, jsonb, jsonb, text, text, date) to authenticated, service_role;
