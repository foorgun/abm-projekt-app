-- ABM Projekt-App: Einverständniserklärung / Vollmacht (Bauantrag einreichen, Schriftverkehr, Genehmigung entgegennehmen)
--   * projects.bauvorhaben: Bezeichnung des Bauvorhabens, z. B. "Neubau Einfamilienhaus mit Doppelgarage". Zugriff wie die
--     übrigen Projektfelder (Tabellenrechte aus 0004, Zeilenregeln aus 0001: ändern nur Admin und Mitarbeiter).
--   * team_members: Anrede, Berufsbezeichnung, Anschrift, Tel. und E-Mail des Architekten. Er steht als Entwurfsverfasser und
--     Vertreter der Bauherrschaft in der Erklärung. Fehlt eine Angabe, nimmt die App die Bürodaten. Es sind Geschäftsdaten
--     (keine Bauherrendaten): lesen wie bisher alle mit Rolle, ändern Admin und Mitarbeiter (nur diese Spalten).
--   * einverstaendniserklaerungen: jede erzeugte Fassung (wer, wann, welches Dokument). Das PDF liegt als normales Dokument
--     im Projektordner. Wie bei den Planungsprotokollen (0014): nichts wird überschrieben, kein Ändern, kein Löschen.
--     Admin und Mitarbeiter lesen und legen an, Freiberufler und Konten ohne Rolle sehen nichts.
-- Die Datei lässt sich mehrfach ausführen.

alter table public.projects add column if not exists bauvorhaben text;
alter table public.projects drop constraint if exists projects_bauvorhaben_len;
alter table public.projects add constraint projects_bauvorhaben_len check (bauvorhaben is null or length(bauvorhaben) <= 200);

alter table public.team_members add column if not exists anrede   text;
alter table public.team_members add column if not exists titel    text;
alter table public.team_members add column if not exists anschrift text;
alter table public.team_members add column if not exists tel      text;
alter table public.team_members add column if not exists email    text;
alter table public.team_members drop constraint if exists team_members_anrede_check;
alter table public.team_members add constraint team_members_anrede_check check (anrede is null or anrede in ('Herr', 'Frau'));
alter table public.team_members drop constraint if exists team_members_email_check;
alter table public.team_members add constraint team_members_email_check check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
alter table public.team_members drop constraint if exists team_members_kontakt_len;
alter table public.team_members add constraint team_members_kontakt_len
  check (coalesce(length(titel), 0) <= 200 and coalesce(length(anschrift), 0) <= 200 and coalesce(length(tel), 0) <= 50);

drop policy if exists team_staff_update on public.team_members;
create policy team_staff_update on public.team_members for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
grant update (anrede, titel, anschrift, tel, email) on public.team_members to authenticated;

create table if not exists public.einverstaendniserklaerungen (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  erstellt_von uuid references auth.users(id) on delete set null default auth.uid(),
  erstellt_am  timestamptz not null default now(),
  dokument_id  uuid references public.documents(id) on delete cascade
);
create index if not exists einverstaendniserklaerungen_project_idx on public.einverstaendniserklaerungen (project_id, erstellt_am desc);

alter table public.einverstaendniserklaerungen enable row level security;
drop policy if exists einverstaendnis_read   on public.einverstaendniserklaerungen;
drop policy if exists einverstaendnis_insert on public.einverstaendniserklaerungen;
create policy einverstaendnis_read on public.einverstaendniserklaerungen for select to authenticated using (public.is_staff());
-- Anlegen nur als man selbst und nur mit einem Dokument desselben Projekts
create policy einverstaendnis_insert on public.einverstaendniserklaerungen for insert to authenticated
  with check (public.is_staff() and erstellt_von = auth.uid()
              and (dokument_id is null or exists (select 1 from public.documents d where d.id = dokument_id and d.project_id = einverstaendniserklaerungen.project_id)));

revoke all on public.einverstaendniserklaerungen from anon, authenticated, public;
grant select on public.einverstaendniserklaerungen to authenticated;
grant insert (project_id, erstellt_von, dokument_id) on public.einverstaendniserklaerungen to authenticated;
grant all on public.einverstaendniserklaerungen to service_role;
