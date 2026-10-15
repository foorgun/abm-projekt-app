-- ABM Projekt-App: Planungsprotokolle (Stufe a: Seite 1 automatisch befüllt).
--   * planungsprotokolle: jede erzeugte Fassung (Vorlage, bearbeitbar oder flach, wer, wann, welches Dokument).
--     Das PDF selbst liegt als normales Dokument im Projektordner (documents + Bucket project-documents).
--     Nichts wird überschrieben: jede Fassung ist eine neue Zeile und ein neues Dokument. Kein Ändern, kein Löschen
--     (außer über delete_project: die Zeilen gehen mit dem Projekt bzw. dem Dokument).
--   * Bucket "vorlagen": die PDF-Vorlagen der Hausbaufirmen (Firmendokumente, nicht im Repo). Privat; lesen dürfen nur
--     Admin und Mitarbeiter. Hochladen nur mit dem Secret key (scripts/vorlagen-hochladen.ts), kein Client schreibt.
--
-- Wer darf was: Admin und Mitarbeiter lesen und legen an. Freiberufler und Konten ohne Rolle: kein Zugriff.
-- Die Datei lässt sich mehrfach ausführen (if not exists, drop … if exists).

create table if not exists public.planungsprotokolle (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  vorlage     text not null check (vorlage in ('schwabenhaus', 'living-haus', 'bien-zenker')),
  variante    text not null check (variante in ('bearbeitbar', 'flach')),
  erstellt_von uuid references auth.users(id) on delete set null default auth.uid(),
  erstellt_am timestamptz not null default now(),
  dokument_id uuid references public.documents(id) on delete cascade
);
create index if not exists planungsprotokolle_project_idx on public.planungsprotokolle (project_id, erstellt_am desc);

alter table public.planungsprotokolle enable row level security;
drop policy if exists planungsprotokolle_read   on public.planungsprotokolle;
drop policy if exists planungsprotokolle_insert on public.planungsprotokolle;
create policy planungsprotokolle_read on public.planungsprotokolle for select to authenticated using (public.is_staff());
-- Anlegen nur als man selbst und nur mit einem Dokument desselben Projekts
create policy planungsprotokolle_insert on public.planungsprotokolle for insert to authenticated
  with check (public.is_staff() and erstellt_von = auth.uid()
              and (dokument_id is null or exists (select 1 from public.documents d where d.id = dokument_id and d.project_id = planungsprotokolle.project_id)));

revoke all on public.planungsprotokolle from anon, authenticated, public;
grant select on public.planungsprotokolle to authenticated;
grant insert (project_id, vorlage, variante, erstellt_von, dokument_id) on public.planungsprotokolle to authenticated;
grant all on public.planungsprotokolle to service_role;

-- ---------------------------------------------------------------------------
-- Speicher: Bucket "vorlagen" (privat), nur lesen für Admin und Mitarbeiter
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('vorlagen', 'vorlagen', false)
on conflict (id) do nothing;

drop policy if exists vorlagen_read on storage.objects;
create policy vorlagen_read on storage.objects for select to authenticated
  using (bucket_id = 'vorlagen' and public.is_staff());
