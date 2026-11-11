-- ABM Projekt-App: Zwischenspeicher und Abruf-Protokoll für den Vorschlag von Bauamt, Wasser, Abwasser und Strom
-- (Edge Function versorger-suche, KI mit Websuche; Planungsprotokoll Seite 1, Absprache ABM 11.11.2026).
--   * versorger_suche:  Vorschläge je Bauort (Schlüssel PLZ | Ort | Ortsteil). Enthält nur Behörden und Firmen, keine Personen.
--   * versorger_abrufe: jede Suche beim KI-Dienst (wer, wann, Modell, Tokens, Suchen, Kosten) für Tageslimit und Kostenblick.
-- Gültigkeit 180 Tage und Limit (20 Suchen je Person und Tag) stehen in der Funktion (logic.ts).
--
-- Wer darf was (wie 0015): Schreiben darf kein Client, nur die Edge Function mit service_role. Lesen dürfen nur Admins.
-- Die Datei lässt sich mehrfach ausführen.

create table if not exists public.versorger_suche (
  schluessel   text primary key check (schluessel ~ '^\d{5}\|'),
  vorschlaege  jsonb not null check (jsonb_typeof(vorschlaege) = 'object'),
  abgerufen_am timestamptz not null default now()
);

create table if not exists public.versorger_abrufe (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  at            timestamptz not null default now(),
  model         text not null,
  input_tokens  integer,
  output_tokens integer,
  suchen        integer,
  cost_eur      numeric(10, 4),
  ok            boolean not null default false
);
create index if not exists versorger_abrufe_user_idx on public.versorger_abrufe (user_id, at);

alter table public.versorger_suche  enable row level security;
alter table public.versorger_abrufe enable row level security;
drop policy if exists versorger_suche_admin_read  on public.versorger_suche;
drop policy if exists versorger_abrufe_admin_read on public.versorger_abrufe;
create policy versorger_suche_admin_read  on public.versorger_suche  for select to authenticated using (public.is_admin());
create policy versorger_abrufe_admin_read on public.versorger_abrufe for select to authenticated using (public.is_admin());

revoke all on public.versorger_suche, public.versorger_abrufe from anon, authenticated, public;
grant select on public.versorger_suche, public.versorger_abrufe to authenticated;
grant all on public.versorger_suche, public.versorger_abrufe to service_role;
