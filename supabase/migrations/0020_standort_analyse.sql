-- ABM Projekt-App: Standortangaben fürs Planungsprotokoll (Edge Function standort-analyse).
--   * standort_cache:   Ergebnisse je Thema und Standort, damit dieselbe Abfrage nicht erneut hinausgeht. Nur ermittelte
--                       Werte, nie Fehler. Die Frist je Thema steht in der Funktion (logic.ts), hier nur das Ablaufdatum.
--   * standort_abrufe:  jede Analyse, die Dienste abgefragt hat (wer, wann) für das Tageslimit.
--   * standort_angaben: die ausdrücklich übernommenen Werte je Projekt. Nur diese landen im PDF.
--
-- Wer darf was: standort_cache und standort_abrufe schreibt kein Client, nur die Edge Function mit service_role; lesen dürfen
-- nur Admins. standort_angaben lesen und schreiben Admin und Mitarbeiter. Freiberufler und Konten ohne Rolle: kein Zugriff.
-- Die Datei lässt sich mehrfach ausführen (if not exists, drop … if exists).

create table if not exists public.standort_cache (
  schluessel   text primary key check (schluessel <> ''),
  thema        text not null check (thema in ('geokodierung', 'schneelast', 'erdbeben', 'hoehe', 'radon', 'wasserschutz', 'hochwasser', 'laerm')),
  wert         jsonb not null check (jsonb_typeof(wert) = 'object'),
  abgerufen_am timestamptz not null default now(),
  gueltig_bis  timestamptz not null
);
create index if not exists standort_cache_gueltig_idx on public.standort_cache (gueltig_bis);

create table if not exists public.standort_abrufe (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists standort_abrufe_user_idx on public.standort_abrufe (user_id, at);

create table if not exists public.standort_angaben (
  project_id   uuid primary key references public.projects(id) on delete cascade,
  angaben      jsonb not null default '{}'::jsonb check (jsonb_typeof(angaben) = 'object'),
  geaendert_von uuid references auth.users(id) on delete set null default auth.uid(),
  geaendert_am timestamptz not null default now()
);

alter table public.standort_cache   enable row level security;
alter table public.standort_abrufe  enable row level security;
alter table public.standort_angaben enable row level security;

drop policy if exists standort_cache_admin_read  on public.standort_cache;
drop policy if exists standort_abrufe_admin_read on public.standort_abrufe;
drop policy if exists standort_angaben_read      on public.standort_angaben;
drop policy if exists standort_angaben_insert    on public.standort_angaben;
drop policy if exists standort_angaben_update    on public.standort_angaben;
create policy standort_cache_admin_read  on public.standort_cache  for select to authenticated using (public.is_admin());
create policy standort_abrufe_admin_read on public.standort_abrufe for select to authenticated using (public.is_admin());
create policy standort_angaben_read   on public.standort_angaben for select to authenticated using (public.is_staff());
create policy standort_angaben_insert on public.standort_angaben for insert to authenticated with check (public.is_staff() and geaendert_von = auth.uid());
create policy standort_angaben_update on public.standort_angaben for update to authenticated using (public.is_staff()) with check (public.is_staff() and geaendert_von = auth.uid());

revoke all on public.standort_cache, public.standort_abrufe, public.standort_angaben from anon, authenticated, public;
grant select on public.standort_cache, public.standort_abrufe, public.standort_angaben to authenticated;
grant insert (project_id, angaben, geaendert_von, geaendert_am), update (angaben, geaendert_von, geaendert_am) on public.standort_angaben to authenticated;
grant all on public.standort_cache, public.standort_abrufe, public.standort_angaben to service_role;
