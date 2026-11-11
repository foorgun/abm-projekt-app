-- ABM Projekt-App: Baugrundauftrag an clayton Umwelt-Consult GmbH (nur Projekte von Schwabenhaus)
--   * baugrundauftraege: jede erzeugte Fassung (wer, wann, welches Dokument). Das PDF (Auftragsformular plus Anlage A,
--     aus den Projektdaten befüllt) liegt als normales Dokument im Projektordner "10 Bodengutachten". Die App versendet
--     nichts: der Kunde unterschreibt, ABM schickt den Auftrag wie bisher selbst an Clayton.
--     Wie bei den Einverständniserklärungen (0028): nichts wird überschrieben, kein Ändern, kein Löschen. Admin und
--     Mitarbeiter lesen und legen an; Freiberufler und Konten ohne Rolle sehen nichts (das PDF enthält Kontaktdaten der
--     Bauherren).
--   * Die beiden Vorlagen liegen im Bucket "vorlagen" (0014) unter clayton/; dessen Regeln gelten unverändert.
-- Die Datei lässt sich mehrfach ausführen.

create table if not exists public.baugrundauftraege (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  erstellt_von uuid references auth.users(id) on delete set null default auth.uid(),
  erstellt_am  timestamptz not null default now(),
  dokument_id  uuid references public.documents(id) on delete cascade
);
create index if not exists baugrundauftraege_project_idx on public.baugrundauftraege (project_id, erstellt_am desc);

alter table public.baugrundauftraege enable row level security;
drop policy if exists baugrundauftrag_read   on public.baugrundauftraege;
drop policy if exists baugrundauftrag_insert on public.baugrundauftraege;
create policy baugrundauftrag_read on public.baugrundauftraege for select to authenticated using (public.is_staff());
-- Anlegen nur als man selbst und nur mit einem Dokument desselben Projekts
create policy baugrundauftrag_insert on public.baugrundauftraege for insert to authenticated
  with check (public.is_staff() and erstellt_von = auth.uid()
              and (dokument_id is null or exists (select 1 from public.documents d where d.id = dokument_id and d.project_id = baugrundauftraege.project_id)));

revoke all on public.baugrundauftraege from anon, authenticated, public;
grant select on public.baugrundauftraege to authenticated;
grant insert (project_id, erstellt_von, dokument_id) on public.baugrundauftraege to authenticated;
grant all on public.baugrundauftraege to service_role;
