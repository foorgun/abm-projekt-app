-- ABM Projekt-App: Zwischenspeicher und Abruf-Protokoll für den Schornsteinfeger-Vorschlag (Edge Function
-- schornsteinfeger-suche, Quelle: Fegersuche des Landesinnungsverbands BW).
--   * schornsteinfeger_suche:   Treffer einer Straßensuche (Schlüssel PLZ + normalisierte Straße), Rohdaten der Kehrbezirke.
--                               Auch "nichts gefunden" wird gespeichert, damit dieselbe Anfrage nicht erneut hinausgeht.
--   * schornsteinfeger_details: Kontaktdaten eines Bezirksschornsteinfegers (Schlüssel BSM-Kennung der Quelle).
--   * schornsteinfeger_abrufe:  jeder Abruf an der Quelle (wer, wann, welche Art, HTTP-Status) für das Tageslimit.
-- Gültigkeit 90 Tage und das Limit (30 Abrufe je Person und Tag) stehen in der Funktion (logic.ts).
--
-- Wer darf was: Schreiben darf kein Client (weder GRANT noch Regel), nur die Edge Function mit service_role.
-- Lesen dürfen nur Admins (Überblick, wie oft die Quelle abgefragt wird). Mitarbeiter, Freiberufler, anon: nichts.
-- Die Datei lässt sich mehrfach ausführen (if not exists, drop … if exists).

create table if not exists public.schornsteinfeger_suche (
  plz          text not null check (plz ~ '^\d{5}$'),
  strasse_key  text not null check (strasse_key <> ''),
  -- tatsächlich verwendeter Suchbegriff (normalisiert bzw. Namensanfang beim zweiten Versuch)
  suchbegriff  text not null,
  treffer      jsonb not null default '[]'::jsonb check (jsonb_typeof(treffer) = 'array'),
  -- alle BSM-Kennungen der Treffer: Details gibt es nur für Kandidaten aus einer Suche
  bsm_ids      text[] not null default '{}',
  abgerufen_am timestamptz not null default now(),
  primary key (plz, strasse_key)
);
create index if not exists schornsteinfeger_suche_bsm_idx on public.schornsteinfeger_suche using gin (bsm_ids);

create table if not exists public.schornsteinfeger_details (
  bsm_id       text primary key check (bsm_id ~ '^\d+$'),
  details      jsonb not null check (jsonb_typeof(details) = 'object'),
  abgerufen_am timestamptz not null default now()
);

create table if not exists public.schornsteinfeger_abrufe (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  at          timestamptz not null default now(),
  art         text not null check (art in ('suche', 'details')),
  http_status integer
);
create index if not exists schornsteinfeger_abrufe_user_idx on public.schornsteinfeger_abrufe (user_id, at);

alter table public.schornsteinfeger_suche   enable row level security;
alter table public.schornsteinfeger_details enable row level security;
alter table public.schornsteinfeger_abrufe  enable row level security;

drop policy if exists schornsteinfeger_suche_admin_read   on public.schornsteinfeger_suche;
drop policy if exists schornsteinfeger_details_admin_read on public.schornsteinfeger_details;
drop policy if exists schornsteinfeger_abrufe_admin_read  on public.schornsteinfeger_abrufe;
create policy schornsteinfeger_suche_admin_read   on public.schornsteinfeger_suche   for select to authenticated using (public.is_admin());
create policy schornsteinfeger_details_admin_read on public.schornsteinfeger_details for select to authenticated using (public.is_admin());
create policy schornsteinfeger_abrufe_admin_read  on public.schornsteinfeger_abrufe  for select to authenticated using (public.is_admin());

revoke all on public.schornsteinfeger_suche, public.schornsteinfeger_details, public.schornsteinfeger_abrufe from anon, authenticated, public;
grant select on public.schornsteinfeger_suche, public.schornsteinfeger_details, public.schornsteinfeger_abrufe to authenticated;
grant all on public.schornsteinfeger_suche, public.schornsteinfeger_details, public.schornsteinfeger_abrufe to service_role;
