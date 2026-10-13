-- ABM Projekt-App: Urlaub und Krankheit ("Abwesenheit").
--   * urlaubs_anspruch: Urlaubstage je Person und Jahr (Standard 30) und Übertrag aus dem Vorjahr
--   * abwesenheiten:    Urlaubsanträge (offen → genehmigt/abgelehnt, oder zurückgezogen) und Krankmeldungen
--   * Werktage rechnet die Datenbank selbst (Montag bis Freitag ohne Feiertage in Baden-Württemberg)
--   * Kalender für alle Mitarbeiter über eine Funktion, die anderen nur "abwesend" zeigt, nie den Grund
--
-- Wer darf was (zusätzlich zu den GRANTs unten):
--   * Admin und Mitarbeiter sehen die eigenen Zeilen, legen eigene Urlaubsanträge und Krankmeldungen an,
--     ziehen eigene offene Anträge zurück und tragen bei der eigenen Krankmeldung das Ende nach.
--   * Admins sehen alle Zeilen und entscheiden offene Anträge. Den EIGENEN Antrag kann ein Admin nicht entscheiden,
--     das muss ein anderer Admin tun (Trigger, nicht nur Oberfläche).
--   * Krankmeldungen: sofort wirksam, ohne Notiz (keine Diagnose). Sichtbar nur für die Person selbst und Admins.
--   * Freiberufler und Konten ohne Rolle: kein Zugriff.
--
-- Die Datei lässt sich mehrfach ausführen (if not exists, or replace, drop … if exists).

-- ---------------------------------------------------------------------------
-- Feiertage und Werktage (gleiche Regeln wie src/lib/abwesenheit im Frontend)
-- ---------------------------------------------------------------------------

-- Ostersonntag (gregorianisch, Verfahren nach Gauß/Butcher)
create or replace function public.ostersonntag(p_jahr integer) returns date
language plpgsql immutable as $$
declare
  a integer := p_jahr % 19;
  b integer := p_jahr / 100;
  c integer := p_jahr % 100;
  d integer := b / 4;
  e integer := b % 4;
  f integer := (b + 8) / 25;
  g integer := (b - f + 1) / 3;
  h integer := (19 * a + b - d - g + 15) % 30;
  i integer := c / 4;
  k integer := c % 4;
  l integer := (32 + 2 * e + 2 * i - h - k) % 7;
  m integer := (a + 11 * h + 22 * l) / 451;
begin
  return make_date(p_jahr, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
end $$;

-- Gesetzlicher Feiertag in Baden-Württemberg? Der 24.12. und der 31.12. sind keine.
create or replace function public.bw_feiertag(p_tag date) returns boolean
language sql immutable as $$
  select to_char(p_tag, 'MM-DD') in ('01-01', '01-06', '05-01', '10-03', '11-01', '12-25', '12-26')
      or (p_tag - public.ostersonntag(extract(year from p_tag)::integer)) in (-2, 1, 39, 50, 60)
$$;

-- Werktage von p_von bis p_bis (beide eingeschlossen): Montag bis Freitag ohne Feiertage. 0 bei vertauschten Daten.
create or replace function public.werktage(p_von date, p_bis date) returns numeric
language sql immutable as $$
  select count(*)::numeric
  from generate_series(p_von::timestamp, p_bis::timestamp, interval '1 day') as t(tag)
  where extract(isodow from t.tag) < 6 and not public.bw_feiertag(t.tag::date)
$$;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------
create table if not exists public.urlaubs_anspruch (
  user_id   uuid not null references auth.users(id) on delete cascade,
  jahr      integer not null check (jahr between 2000 and 2100),
  tage      numeric(5, 1) not null default 30 check (tage >= 0 and tage <= 366),
  uebertrag numeric(5, 1) not null default 0 check (uebertrag >= 0 and uebertrag <= 366),
  primary key (user_id, jahr)
);

create table if not exists public.abwesenheiten (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  art              text not null check (art in ('urlaub', 'krank')),
  von              date not null,
  bis              date,                         -- leer nur bei Krankmeldungen ("noch krank")
  werktage         numeric(5, 1),                -- nur Urlaub; setzt die Datenbank
  status           text not null default 'offen' check (status in ('offen', 'genehmigt', 'abgelehnt', 'zurueckgezogen')),
  notiz            text,                         -- nur Urlaub
  entscheidung_von uuid references auth.users(id) on delete set null,
  entscheidung_am  timestamptz,
  ablehn_grund     text,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  constraint abwesenheiten_bis_nach_von   check (bis is null or bis >= von),
  constraint abwesenheiten_urlaub_mit_ende check (art <> 'urlaub' or bis is not null),
  -- Krankmeldung: sofort wirksam, ohne Notiz (keine Diagnose, kein Freitext), ohne Entscheidung
  constraint abwesenheiten_krank_schlicht check (art <> 'krank' or (status = 'genehmigt' and notiz is null and ablehn_grund is null and entscheidung_von is null)),
  constraint abwesenheiten_notiz_kurz     check (notiz is null or length(notiz) <= 500),
  constraint abwesenheiten_grund_kurz     check (ablehn_grund is null or length(ablehn_grund) <= 300)
);
create index if not exists abwesenheiten_user_idx   on public.abwesenheiten (user_id, von);
create index if not exists abwesenheiten_status_idx on public.abwesenheiten (status, von);

-- ---------------------------------------------------------------------------
-- Regeln beim Anlegen und Ändern (Trigger). Skripte mit service_role (kein angemeldeter Benutzer) sind ausgenommen,
-- die Werktage werden aber immer von der Datenbank gesetzt.
-- ---------------------------------------------------------------------------
create or replace function public.abwesenheiten_regeln() returns trigger
language plpgsql security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  -- Dem Client wird bei den Werktagen nicht vertraut
  new.werktage := case when new.art = 'urlaub' then public.werktage(new.von, new.bis) else null end;
  if v_uid is null then return new; end if;

  if tg_op = 'INSERT' then
    if new.user_id is distinct from v_uid then raise exception 'Keine Berechtigung für diese Aktion'; end if;
    new.entscheidung_von := null;
    new.entscheidung_am := null;
    new.ablehn_grund := null;
    new.created_at := now();
    new.is_demo := false;
    if new.art = 'urlaub' then
      new.status := 'offen';
      new.notiz := public.clean_text(new.notiz);
      if new.werktage < 1 then raise exception 'Im gewählten Zeitraum liegt kein Werktag.'; end if;
    else
      new.status := 'genehmigt';
      if new.notiz is not null then raise exception 'Bei einer Krankmeldung ist keine Notiz erlaubt (bitte keine Diagnose angeben).'; end if;
    end if;
    -- keine Überschneidung mit eigenen offenen Anträgen, genehmigtem Urlaub oder Krankmeldungen
    -- (eine Krankmeldung ohne Ende reicht bis heute)
    if exists (
      select 1 from public.abwesenheiten a
      where a.user_id = new.user_id and a.status in ('offen', 'genehmigt')
        and a.von <= coalesce(new.bis, greatest(new.von, current_date))
        and coalesce(a.bis, greatest(a.von, current_date)) >= new.von
    ) then
      raise exception 'Der Zeitraum überschneidet sich mit einem eigenen Antrag oder einer Krankmeldung.';
    end if;
    return new;
  end if;

  -- UPDATE: was sich nie ändert
  if new.user_id is distinct from old.user_id or new.art is distinct from old.art or new.von is distinct from old.von
     or new.notiz is distinct from old.notiz or new.created_at is distinct from old.created_at or new.is_demo is distinct from old.is_demo then
    raise exception 'Diese Angaben lassen sich nicht ändern.';
  end if;

  if old.art = 'krank' then
    -- nur das Ende nachtragen ("wieder gesund ab"): die Person selbst oder ein Admin
    if new.status is distinct from old.status or new.ablehn_grund is not null or new.entscheidung_von is not null then
      raise exception 'Eine Krankmeldung braucht keine Entscheidung.';
    end if;
    if old.user_id <> v_uid and not public.is_admin() then raise exception 'Keine Berechtigung für diese Aktion'; end if;
    if new.bis is not null and exists (
      select 1 from public.abwesenheiten a
      where a.user_id = new.user_id and a.id <> new.id and a.status in ('offen', 'genehmigt')
        and a.von <= new.bis and coalesce(a.bis, greatest(a.von, current_date)) >= new.von
    ) then
      raise exception 'Der Zeitraum überschneidet sich mit einem eigenen Antrag oder einer Krankmeldung.';
    end if;
    return new;
  end if;

  -- Urlaub: der Zeitraum steht fest, es ändert sich nur der Status
  if new.bis is distinct from old.bis then raise exception 'Der Zeitraum eines Antrags lässt sich nicht ändern. Bitte zurückziehen und neu beantragen.'; end if;
  if new.status is not distinct from old.status then
    if new.ablehn_grund is distinct from old.ablehn_grund then raise exception 'Diese Angaben lassen sich nicht ändern.'; end if;
    return new;
  end if;
  if old.status <> 'offen' then raise exception 'Der Antrag ist nicht mehr offen.'; end if;

  if new.status = 'zurueckgezogen' then
    if old.user_id <> v_uid then raise exception 'Nur die Person selbst kann ihren Antrag zurückziehen.'; end if;
    new.ablehn_grund := null;
    new.entscheidung_von := null;
    new.entscheidung_am := null;
  elsif new.status in ('genehmigt', 'abgelehnt') then
    if not public.is_admin() then raise exception 'Keine Berechtigung für diese Aktion'; end if;
    -- Vier-Augen-Prinzip: nie der eigene Antrag
    if old.user_id = v_uid then raise exception 'Den eigenen Antrag kann nur ein anderer Admin entscheiden.'; end if;
    new.entscheidung_von := v_uid;
    new.entscheidung_am := now();
    new.ablehn_grund := case when new.status = 'abgelehnt' then public.clean_text(new.ablehn_grund) else null end;
  else
    raise exception 'Dieser Statuswechsel ist nicht vorgesehen.';
  end if;
  return new;
end $$;

drop trigger if exists abwesenheiten_regeln on public.abwesenheiten;
create trigger abwesenheiten_regeln before insert or update on public.abwesenheiten
  for each row execute function public.abwesenheiten_regeln();

-- ---------------------------------------------------------------------------
-- Zeilenregeln
-- ---------------------------------------------------------------------------
alter table public.urlaubs_anspruch enable row level security;
alter table public.abwesenheiten    enable row level security;

drop policy if exists urlaubs_anspruch_read  on public.urlaubs_anspruch;
drop policy if exists urlaubs_anspruch_admin_insert on public.urlaubs_anspruch;
drop policy if exists urlaubs_anspruch_admin_update on public.urlaubs_anspruch;
create policy urlaubs_anspruch_read on public.urlaubs_anspruch for select to authenticated
  using (public.is_admin() or (public.is_staff() and user_id = auth.uid()));
create policy urlaubs_anspruch_admin_insert on public.urlaubs_anspruch for insert to authenticated
  with check (public.is_admin());
create policy urlaubs_anspruch_admin_update on public.urlaubs_anspruch for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists abwesenheiten_read   on public.abwesenheiten;
drop policy if exists abwesenheiten_insert on public.abwesenheiten;
drop policy if exists abwesenheiten_update on public.abwesenheiten;
-- eigene Zeilen; Admins alle. Krankmeldungen anderer sieht damit nur ein Admin.
create policy abwesenheiten_read on public.abwesenheiten for select to authenticated
  using (public.is_admin() or (public.is_staff() and user_id = auth.uid()));
create policy abwesenheiten_insert on public.abwesenheiten for insert to authenticated
  with check (public.is_staff() and user_id = auth.uid());
-- wer was ändern darf, entscheidet der Trigger oben; die Regel grenzt nur auf eigene Zeilen bzw. Admins ein
create policy abwesenheiten_update on public.abwesenheiten for update to authenticated
  using (public.is_admin() or (public.is_staff() and user_id = auth.uid()))
  with check (public.is_admin() or (public.is_staff() and user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Rechte (Muster aus 0004): anon nichts, authenticated nur, was die App tut. Nie löschen.
-- ---------------------------------------------------------------------------
revoke all on public.urlaubs_anspruch, public.abwesenheiten from anon, authenticated, public;
grant select on public.urlaubs_anspruch to authenticated;
grant insert (user_id, jahr, tage, uebertrag) on public.urlaubs_anspruch to authenticated;
grant update (tage, uebertrag) on public.urlaubs_anspruch to authenticated;
grant select on public.abwesenheiten to authenticated;
-- Status, Werktage, Entscheidung und is_demo setzt nie der Client
grant insert (user_id, art, von, bis, notiz) on public.abwesenheiten to authenticated;
grant update (status, bis, ablehn_grund) on public.abwesenheiten to authenticated;
grant all on public.urlaubs_anspruch, public.abwesenheiten to service_role;

-- ---------------------------------------------------------------------------
-- Kalender: wer wann abwesend ist. Für Nicht-Admins ohne Grund (art ist null) und ohne offene Enden:
-- eine Krankmeldung ohne Ende erscheint bis heute, damit "kein Ende" nicht verrät, dass es eine Krankmeldung ist.
-- Enthält nur genehmigten Urlaub und Krankmeldungen. Freiberufler werden abgewiesen.
-- ---------------------------------------------------------------------------
create or replace function public.kalender_abwesenheiten(p_von date, p_bis date)
returns table (user_id uuid, name text, von date, bis date, art text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Keine Berechtigung für diese Aktion'; end if;
  return query
    select a.user_id,
           coalesce(nullif(trim(r.full_name), ''), 'Unbekannt'),
           a.von,
           coalesce(a.bis, greatest(a.von, current_date)),
           case when public.is_admin() then a.art else null end
    from public.abwesenheiten a
    left join public.user_roles r on r.user_id = a.user_id
    where a.status = 'genehmigt'
      and a.von <= p_bis
      and coalesce(a.bis, greatest(a.von, current_date)) >= p_von
    order by a.von, 2;
end $$;

revoke all on function public.ostersonntag(integer), public.bw_feiertag(date), public.werktage(date, date),
  public.abwesenheiten_regeln(), public.kalender_abwesenheiten(date, date) from public, anon;
grant execute on function public.ostersonntag(integer), public.bw_feiertag(date), public.werktage(date, date),
  public.kalender_abwesenheiten(date, date) to authenticated, service_role;
