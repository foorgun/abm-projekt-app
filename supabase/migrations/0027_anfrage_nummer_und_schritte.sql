-- ABM Projekt-App: Anfrage-Nummer und eigene Schritte für Anfragen
--   Anlass: Wunsch von ABM. Anfragen bekommen eine eigene Nummer "A-<Kürzel der Hausbaufirma>-<laufende Nummer>",
--   z. B. A-SH-12, und einen eigenen, kurzen Ablauf: Anfrage eingegangen, Bearbeitet, Beauftragt.
--   * companies.kuerzel: ein bis vier Großbuchstaben, eindeutig, ändern nur Admins (wie der Nummernkreis, 0017).
--     Vorbelegt für Living Haus (LH), Schwabenhaus (SH) und Bien-Zenker (BZ), nur wenn der Name genau eine Firma trifft.
--   * Eindeutigkeit der Anfrage-Nummer je Kürzel (Nummer als Zahl verglichen), wie bei der ABM-Nr. (0017).
--   * Schritte der Stufe "Anfrage" in step_definitions (sort_order 1 bis 3, vor allen Projektschritten). Die App führt sie
--     getrennt von den Projektschritten (Pipeline, Liste, Warnungen sehen sie nicht).
--   * "Anfrage eingegangen" setzt sich beim Anlegen einer Anfrage selbst, "Beauftragt" beim Annehmen als Projekt
--     (Trigger, gilt für jeden Weg). Zurück zu den Anfragen nimmt "Beauftragt" wieder heraus.

-- ---------------------------------------------------------------------------
-- Kürzel der Hausbaufirma
-- ---------------------------------------------------------------------------
alter table public.companies add column if not exists kuerzel text;
alter table public.companies add constraint companies_kuerzel_format check (kuerzel is null or kuerzel ~ '^[A-Z]{1,4}$');
create unique index companies_kuerzel_unique on public.companies (kuerzel);

-- Nur Admins ändern (die Zeilenregel companies_update_admin aus 0017 gilt für jede Spalte)
grant insert (kuerzel) on public.companies to authenticated;
grant update (kuerzel) on public.companies to authenticated;
create policy companies_kuerzel_insert_admin on public.companies as restrictive for insert to authenticated
  with check (kuerzel is null or public.is_admin());

update public.companies c set kuerzel = v.k
from (values ('LH', 'living\s*-?\s*haus'), ('SH', 'schwaben\s*-?\s*haus'), ('BZ', 'bien\s*-?\s*zenker')) as v(k, re)
where c.kuerzel is null
  and lower(c.name) ~ v.re
  and (select count(*) from public.companies x where lower(x.name) ~ v.re) = 1
  and not exists (select 1 from public.companies y where y.kuerzel = v.k);

-- ---------------------------------------------------------------------------
-- Anfrage-Nummer: A-<Kürzel>-<Nummer>, eindeutig je Kürzel
-- ---------------------------------------------------------------------------
create unique index projects_anfrage_nr_unique on public.projects (split_part(abm_nr, '-', 2), (split_part(abm_nr, '-', 3)::numeric))
  where abm_nr ~ '^A-[A-Z]{1,4}-\d+$';

-- ---------------------------------------------------------------------------
-- Schritte der Anfrage
-- ---------------------------------------------------------------------------
insert into public.step_definitions (key, label, sort_order, stage) values
  ('anfrage_eingegangen', 'Anfrage eingegangen', 1, 'Anfrage'),
  ('anfrage_bearbeitet',  'Bearbeitet',          2, 'Anfrage'),
  ('anfrage_beauftragt',  'Beauftragt',          3, 'Anfrage')
on conflict (key) do nothing;

create or replace function public.projects_anfrage_schritte() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_heute date := (now() at time zone 'Europe/Berlin')::date;
begin
  if tg_op = 'INSERT' then
    if new.status::text = 'anfrage' then
      insert into public.project_steps (project_id, step_key, occurred_on) values (new.id, 'anfrage_eingegangen', v_heute)
      on conflict (project_id, step_key) do nothing;
    end if;
  elsif new.status is distinct from old.status then
    if old.status::text = 'anfrage' and new.status::text = 'aktiv' then
      insert into public.project_steps (project_id, step_key, occurred_on) values (new.id, 'anfrage_beauftragt', v_heute)
      on conflict (project_id, step_key) do nothing;
    elsif new.status::text = 'anfrage' then
      delete from public.project_steps where project_id = new.id and step_key = 'anfrage_beauftragt';
    end if;
  end if;
  return new;
end $$;

revoke all on function public.projects_anfrage_schritte() from public, anon, authenticated;

create trigger projects_anfrage_schritte after insert or update of status on public.projects
  for each row execute function public.projects_anfrage_schritte();

-- Bestehende Anfragen: eingegangen am Tag des Anlegens
insert into public.project_steps (project_id, step_key, occurred_on)
select id, 'anfrage_eingegangen', (created_at at time zone 'Europe/Berlin')::date from public.projects where status::text = 'anfrage'
on conflict (project_id, step_key) do nothing;
