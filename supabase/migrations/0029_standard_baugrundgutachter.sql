-- ABM Projekt-App: Standard-Baugrundgutachter in den Bürodaten (Planungsprotokoll, Seite 1).
--   * ABM beauftragt für die Bauherren meist dasselbe Büro (Auskunft ABM, 10.11.2026). Die Bürodaten bekommen dafür Name,
--     Anschrift, Tel., Mobil und E-Mail. Hat ein Projekt keinen eigenen Baugrundgutachter, nimmt das Protokoll diese Angaben.
--     Ein Eintrag im Projekt geht immer vor.
--   * Rechte wie die übrigen Bürodaten: lesen und ändern Admin und Mitarbeiter (0013, 0025), Freiberufler weder noch.
--     Bereinigen, E-Mail prüfen und Stempel macht der Trigger, jetzt auch für die neuen Spalten.
-- Die Datei lässt sich mehrfach ausführen.

alter table public.buero_daten add column if not exists gutachter_name      text;
alter table public.buero_daten add column if not exists gutachter_anschrift text;
alter table public.buero_daten add column if not exists gutachter_tel       text;
alter table public.buero_daten add column if not exists gutachter_mobil     text;
alter table public.buero_daten add column if not exists gutachter_email     text;

create or replace function public.buero_daten_stempel() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  new.name := public.clean_text(new.name);
  new.anschrift := public.clean_text(new.anschrift);
  new.tel := public.clean_text(new.tel);
  new.mobil := public.clean_text(new.mobil);
  new.email := public.clean_text(new.email);
  new.gutachter_name := public.clean_text(new.gutachter_name);
  new.gutachter_anschrift := public.clean_text(new.gutachter_anschrift);
  new.gutachter_tel := public.clean_text(new.gutachter_tel);
  new.gutachter_mobil := public.clean_text(new.gutachter_mobil);
  new.gutachter_email := public.clean_text(new.gutachter_email);
  if new.email is not null and new.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Bitte eine gültige E-Mail-Adresse eintragen.'; end if;
  if new.gutachter_email is not null and new.gutachter_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Bitte eine gültige E-Mail-Adresse beim Baugrundgutachter eintragen.'; end if;
  if new.gutachter_name is null and coalesce(new.gutachter_anschrift, new.gutachter_tel, new.gutachter_mobil, new.gutachter_email) is not null then
    raise exception 'Bitte beim Baugrundgutachter einen Namen eintragen.';
  end if;
  new.geaendert_am := now();
  new.geaendert_von := auth.uid();
  return new;
end $$;
revoke all on function public.buero_daten_stempel() from public, anon, authenticated;

grant update (gutachter_name, gutachter_anschrift, gutachter_tel, gutachter_mobil, gutachter_email) on public.buero_daten to authenticated;
