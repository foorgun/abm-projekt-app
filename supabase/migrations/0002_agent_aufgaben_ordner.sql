-- ABM Projekt-App: Ordnervorlage, Dokumente-Erweiterung, Aufgaben, Aktivitäten, Posteingangs-Agent
-- Baut auf 0001_init.sql auf. Prinzipien wie dort: sicher per Voreinstellung, RLS auf jeder Tabelle.
--   * Mitarbeiter/Admin: voller Zugriff (Regeln und Einstellungen des Agenten: nur Admin ändert Schwellen)
--   * Freiberufler: nichts davon, außer Dokumenten zugewiesener Projekte (0001), der Ordnervorlage und
--     den Projektbeteiligten (Firmen, keine Bauherren-Kontaktdaten) zugewiesener Projekte
--   * Der Agent schreibt serverseitig (Edge Function, service_role) und umgeht RLS; er löscht nie etwas.

-- ---------------------------------------------------------------------------
-- Weitere Phasen (Vorschlag aus BUILD.md Abschnitt 6, mit ABM abzustimmen).
-- Die fünf Excel-Schritte (10–50) bleiben unverändert.
-- ---------------------------------------------------------------------------
insert into public.step_definitions (key, label, sort_order) values
  ('vermesser_beauftragt',      'Vermesser beauftragt',      32),
  ('entwurf_freigegeben',       'Entwurf freigegeben',       34),
  ('vorabzug_versendet',        'Vorabzug versendet',        36),
  ('baufreigabe',               'Baufreigabe',               60),
  ('bauanlaufgespraech',        'Bauanlaufgespräch',         70),
  ('hausanschluesse_beantragt', 'Hausanschlüsse beantragt',  80),
  ('hausaufstellung',           'Hausaufstellung',           90);

-- Admins pflegen die Schrittliste selbst (Anzeige und Warnungen lesen nur aus der Tabelle)
create policy steps_def_admin on public.step_definitions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Projekte: Hausbau-Nr. (Auftragsnummer der Hausbaufirma), wichtig für die Zuordnung von Mails
-- ---------------------------------------------------------------------------
alter table public.projects add column hausbau_nr text;
create index projects_hausbau_nr_idx on public.projects (hausbau_nr);

-- Projektbeteiligte laut Liste.docx (Firmen, keine Privatpersonen)
create type public.party_role as enum ('vermesser', 'erdbauer', 'strom', 'wasser', 'elektriker_baustrom');

create table public.project_parties (
  project_id uuid not null references public.projects(id) on delete cascade,
  role       public.party_role not null,
  name       text not null,
  contact    text,
  primary key (project_id, role)
);

-- ---------------------------------------------------------------------------
-- Ordnervorlage (docs/ordnerstruktur.md). Pfade mit "/" getrennt, Datumsplatzhalter als "{datum}".
-- ---------------------------------------------------------------------------
create table public.folder_templates (
  id          uuid primary key default gen_random_uuid(),
  path        text not null unique,
  parent_path text references public.folder_templates(path) on update cascade,
  sort        integer not null,
  label       text not null,
  has_date    boolean not null default false,
  keywords    text[] not null default '{}',
  description text,
  constraint folder_templates_no_dotdot check (path !~ '(^|/)\.\.?(/|$)')
);

-- ---------------------------------------------------------------------------
-- Dokumente erweitern
-- ---------------------------------------------------------------------------
create type public.document_source as enum ('upload', 'agent');

alter table public.documents
  add column folder_path    text not null default '',
  add column source         public.document_source not null default 'upload',
  add column source_item_id uuid,
  add column received_on    date,
  add column mime           text;
create index documents_folder_idx on public.documents (project_id, folder_path);

-- ---------------------------------------------------------------------------
-- Aufgaben
-- ---------------------------------------------------------------------------
create type public.task_status as enum ('offen', 'erledigt');
create type public.task_source as enum ('manuell', 'warnung', 'agent');

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references public.projects(id) on delete cascade,
  title       text not null check (length(trim(title)) > 0),
  due_on      date,
  assignee_id uuid references public.team_members(id) on delete set null,
  status      public.task_status not null default 'offen',
  source      public.task_source not null default 'manuell',
  source_key  text unique,                  -- z. B. Warnungs-ID: verhindert doppelte Aufgaben
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  done_at     timestamptz,
  constraint tasks_done_matches_status check ((status = 'erledigt') = (done_at is not null))
);
create index tasks_open_idx on public.tasks (status, due_on);

-- ---------------------------------------------------------------------------
-- Aktivitäten (Dashboard "Letzte Aktivitäten", Projekt-Tab "Aktivität")
-- ---------------------------------------------------------------------------
create type public.activity_kind as enum ('schritt', 'datei', 'rechnung', 'aufgabe', 'projekt', 'agent');

create table public.activities (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  kind       public.activity_kind not null,
  text       text not null,
  actor      text not null,                 -- Anzeigename oder "Agent"/"System"
  actor_id   uuid references auth.users(id) on delete set null,
  at         timestamptz not null default now()
);
create index activities_at_idx on public.activities (at desc);
create index activities_project_idx on public.activities (project_id, at desc);

-- ---------------------------------------------------------------------------
-- Posteingangs-Agent
-- ---------------------------------------------------------------------------
create type public.mailbox_provider as enum ('microsoft365', 'imap', 'demo');
create type public.mailbox_status   as enum ('verbunden', 'pausiert', 'fehler');
create type public.inbox_status     as enum ('neu', 'abgelegt', 'pruefen', 'ignoriert', 'fehler');
create type public.agent_rule_kind  as enum ('absender_projekt', 'absender_ordner', 'ignorieren');

create table public.mailboxes (
  id              uuid primary key default gen_random_uuid(),
  label           text not null,
  address         text not null unique,
  provider        public.mailbox_provider not null,
  status          public.mailbox_status not null default 'pausiert',
  last_checked_at timestamptz,
  watch_folder    text not null default 'Posteingang',
  -- Nur ein Verweis auf Supabase Vault/Secret. Niemals Passwörter oder Tokens in dieser Tabelle.
  secret_ref      text check (secret_ref is null or secret_ref !~* '(password|passwort|secret=|token=)'),
  created_at      timestamptz not null default now()
);

create table public.inbox_items (
  id           uuid primary key default gen_random_uuid(),
  mailbox_id   uuid not null references public.mailboxes(id) on delete cascade,
  message_id   text not null unique,         -- Duplikate ausschließen
  received_at  timestamptz not null,
  from_name    text,
  from_email   text not null,
  subject      text not null default '',
  body_excerpt text not null default '' check (length(body_excerpt) <= 2000),  -- nur Auszug, kein vollständiger Mailtext
  status       public.inbox_status not null default 'neu',
  project_id   uuid references public.projects(id) on delete set null,
  confidence   numeric(4,3) check (confidence between 0 and 1),
  reason       text,
  created_at   timestamptz not null default now()
);
create index inbox_items_status_idx on public.inbox_items (status, received_at desc);

create table public.inbox_attachments (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.inbox_items(id) on delete cascade,
  file_name    text not null,
  mime         text not null,
  size_bytes   bigint not null check (size_bytes >= 0),
  storage_path text,
  project_id   uuid references public.projects(id) on delete set null,
  folder_path  text,
  confidence   numeric(4,3) check (confidence between 0 and 1),
  status       public.inbox_status not null default 'neu',
  document_id  uuid references public.documents(id) on delete set null,
  corrected    boolean not null default false  -- automatisch abgelegt, später von Hand korrigiert
);
create index inbox_attachments_status_idx on public.inbox_attachments (status);

alter table public.documents
  add constraint documents_source_item_fk foreign key (source_item_id)
  references public.inbox_attachments(id) on delete set null;

create table public.agent_runs (
  id          uuid primary key default gen_random_uuid(),
  mailbox_id  uuid not null references public.mailboxes(id) on delete cascade,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  fetched     integer not null default 0,
  filed       integer not null default 0,
  to_review   integer not null default 0,
  ignored     integer not null default 0,
  errors      integer not null default 0,
  note        text
);
create index agent_runs_started_idx on public.agent_runs (started_at desc);

create table public.agent_rules (
  id          uuid primary key default gen_random_uuid(),
  kind        public.agent_rule_kind not null,
  match       text not null check (match = lower(trim(match)) and length(match) > 2),
  project_id  uuid references public.projects(id) on delete cascade,
  folder_path text references public.folder_templates(path) on update cascade,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint agent_rules_target check (
    (kind = 'absender_projekt' and project_id is not null) or
    (kind = 'absender_ordner'  and folder_path is not null) or
    (kind = 'ignorieren')
  )
);

-- Genau eine Zeile mit den Schwellen (BUILD.md Abschnitt 7, Schritt 5)
create table public.agent_settings (
  id                  boolean primary key default true check (id),
  auto_file_threshold numeric(3,2) not null default 0.90,
  suggest_threshold   numeric(3,2) not null default 0.60,
  constraint agent_settings_order check (0 <= suggest_threshold and suggest_threshold < auto_file_threshold and auto_file_threshold <= 1)
);
insert into public.agent_settings (id) values (true);

-- Lernbeispiele: jede Bestätigung oder Korrektur durch einen Menschen
create table public.agent_feedback (
  id            uuid primary key default gen_random_uuid(),
  attachment_id uuid not null references public.inbox_attachments(id) on delete cascade,
  action        text not null check (action in ('bestaetigt', 'geaendert', 'ignoriert')),
  project_id    uuid references public.projects(id) on delete set null,
  folder_path   text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Zeilenschutz
-- ---------------------------------------------------------------------------
alter table public.project_parties   enable row level security;
alter table public.folder_templates  enable row level security;
alter table public.tasks             enable row level security;
alter table public.activities        enable row level security;
alter table public.mailboxes         enable row level security;
alter table public.inbox_items       enable row level security;
alter table public.inbox_attachments enable row level security;
alter table public.agent_runs        enable row level security;
alter table public.agent_rules       enable row level security;
alter table public.agent_settings    enable row level security;
alter table public.agent_feedback    enable row level security;

-- Beteiligte: lesen wie das Projekt, ändern nur Mitarbeiter
create policy parties_read  on public.project_parties for select to authenticated
  using (public.has_project_access(project_id));
create policy parties_write on public.project_parties for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Ordnervorlage: alle mit Rolle lesen (für den Ordnerbaum), nur Admins ändern
create policy folders_read  on public.folder_templates for select to authenticated
  using (public.current_app_role() is not null);
create policy folders_admin on public.folder_templates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Aufgaben, Aktivitäten, Agent: nur Mitarbeiter und Admins
create policy tasks_staff      on public.tasks             for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy activities_read  on public.activities        for select to authenticated
  using (public.is_staff());
create policy activities_write on public.activities        for insert to authenticated
  with check (public.is_staff() and actor_id = auth.uid());
create policy mailboxes_staff  on public.mailboxes         for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy inbox_items_staff on public.inbox_items      for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy inbox_att_staff  on public.inbox_attachments for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy agent_runs_read  on public.agent_runs        for select to authenticated
  using (public.is_staff());
create policy agent_rules_staff on public.agent_rules      for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy agent_settings_read  on public.agent_settings for select to authenticated
  using (public.is_staff());
create policy agent_settings_admin on public.agent_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy agent_feedback_staff on public.agent_feedback for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Aktivitäten und Lernbeispiele sind ein Protokoll: nicht ändern, nicht löschen (auch nicht durch Mitarbeiter)
create policy activities_no_update on public.activities as restrictive for update to authenticated using (false);
create policy activities_no_delete on public.activities as restrictive for delete to authenticated using (false);

-- ---------------------------------------------------------------------------
-- Ordnervorlage befüllen. ERZEUGT von scripts/gen-folder-templates.ts aus docs/ordnerstruktur.md
-- und src/data/folderHints.ts. Nicht von Hand ändern, sondern Skript ausführen.
-- ---------------------------------------------------------------------------
-- BEGIN folder_templates
insert into public.folder_templates (path, parent_path, sort, label, has_date, keywords, description) values
  ('01 Projektbeteiligte', null, 0, '01 Projektbeteiligte', false, array['projektbeteiligte', 'beteiligtenliste', 'abm-vertrag']::text[], null),
  ('02 Schriftverkehr', null, 1, '02 Schriftverkehr', false, '{}', null),
  ('02 Schriftverkehr/01 Schriftverkehr mit Bauherrschaft', '02 Schriftverkehr', 2, '01 Schriftverkehr mit Bauherrschaft', false, '{}', null),
  ('02 Schriftverkehr/01 Schriftverkehr mit Bauherrschaft/01 Überschrift {datum}', '02 Schriftverkehr/01 Schriftverkehr mit Bauherrschaft', 3, '01 Überschrift {datum}', true, '{}', null),
  ('02 Schriftverkehr/01 Schriftverkehr mit Bauherrschaft/02 BAUANTRAG VERSAND <Nr>', '02 Schriftverkehr/01 Schriftverkehr mit Bauherrschaft', 4, '02 BAUANTRAG VERSAND <Nr>', false, '{}', null),
  ('02 Schriftverkehr/02 Schriftverkehr mit Hausbaufirma', '02 Schriftverkehr', 5, '02 Schriftverkehr mit Hausbaufirma', false, '{}', null),
  ('02 Schriftverkehr/02 Schriftverkehr mit Hausbaufirma/01 <Betreff> {datum}', '02 Schriftverkehr/02 Schriftverkehr mit Hausbaufirma', 6, '01 <Betreff> {datum}', true, '{}', null),
  ('02 Schriftverkehr/03 Schriftverkehr mit Amt', '02 Schriftverkehr', 7, '03 Schriftverkehr mit Amt', false, '{}', null),
  ('02 Schriftverkehr/03 Schriftverkehr mit Amt/01 Überschrift {datum}', '02 Schriftverkehr/03 Schriftverkehr mit Amt', 8, '01 Überschrift {datum}', true, array['landratsamt', 'baurechtsamt', 'bauamt', 'anhörung']::text[], null),
  ('02 Schriftverkehr/04 Schriftverkehr mit Vermesser', '02 Schriftverkehr', 9, '04 Schriftverkehr mit Vermesser', false, '{}', null),
  ('02 Schriftverkehr/04 Schriftverkehr mit Vermesser/01 Überschrift {datum}', '02 Schriftverkehr/04 Schriftverkehr mit Vermesser', 10, '01 Überschrift {datum}', true, '{}', null),
  ('02 Schriftverkehr/04 Schriftverkehr mit Vermesser/02 amtliche Lagepläne bestellt am {datum}', '02 Schriftverkehr/04 Schriftverkehr mit Vermesser', 11, '02 amtliche Lagepläne bestellt am {datum}', true, array['bestellung lageplan']::text[], null),
  ('02 Schriftverkehr/05 Schriftverkehr mit Clayton', '02 Schriftverkehr', 12, '05 Schriftverkehr mit Clayton', false, '{}', null),
  ('03 Hausbaufirma', null, 13, '03 Hausbaufirma', false, array['werkplanung', 'hausbeschreibung', 'bauleistungsbeschreibung']::text[], null),
  ('04 Vermesser', null, 14, '04 Vermesser', false, '{}', null),
  ('04 Vermesser/01 Vermesser beauftragt am {datum}', '04 Vermesser', 15, '01 Vermesser beauftragt am {datum}', true, '{}', null),
  ('04 Vermesser/02 Vermesserunterlagen erhalten am {datum}', '04 Vermesser', 16, '02 Vermesserunterlagen erhalten am {datum}', true, array['vermesserunterlagen', 'bestandsplan', 'höhenaufnahme', 'vermessung']::text[], null),
  ('04 Vermesser/03 Geländeprofile', '04 Vermesser', 17, '03 Geländeprofile', false, '{}', null),
  ('04 Vermesser/03 Geländeprofile/01 Geländeprofile bestellt am {datum}', '04 Vermesser/03 Geländeprofile', 18, '01 Geländeprofile bestellt am {datum}', true, '{}', null),
  ('04 Vermesser/03 Geländeprofile/02 Geländeprofile erhalten am {datum}', '04 Vermesser/03 Geländeprofile', 19, '02 Geländeprofile erhalten am {datum}', true, array['geländeprofil', 'geländeschnitt']::text[], null),
  ('05 Entwurf', null, 20, '05 Entwurf', false, '{}', null),
  ('05 Entwurf/01 Entwurf 1 Pläne', '05 Entwurf', 21, '01 Entwurf 1 Pläne', false, array['entwurf']::text[], null),
  ('05 Entwurf/02 Entwurf 2 Pläne', '05 Entwurf', 22, '02 Entwurf 2 Pläne', false, '{}', null),
  ('06 Technische Prüfung', null, 23, '06 Technische Prüfung', false, array['technische prüfung', 'statik', 'wärmeschutz']::text[], null),
  ('07 Vorabzug', null, 24, '07 Vorabzug', false, '{}', null),
  ('07 Vorabzug/01 Brief', '07 Vorabzug', 25, '01 Brief', false, '{}', null),
  ('07 Vorabzug/02 Vorabzugspläne', '07 Vorabzug', 26, '02 Vorabzugspläne', false, array['vorabzug']::text[], null),
  ('07 Vorabzug/03 PP', '07 Vorabzug', 27, '03 PP', false, '{}', null),
  ('07 Vorabzug/04 Formular Bodengutachten', '07 Vorabzug', 28, '04 Formular Bodengutachten', false, array['formular bodengutachten']::text[], null),
  ('08 Bauantrag', null, 29, '08 Bauantrag', false, '{}', null),
  ('08 Bauantrag/01 Digitaler Bauantrag', '08 Bauantrag', 30, '01 Digitaler Bauantrag', false, array['digitaler bauantrag', 'bauantragsformular']::text[], null),
  ('08 Bauantrag/02 Bauantragspläne', '08 Bauantrag', 31, '02 Bauantragspläne', false, '{}', null),
  ('08 Bauantrag/02 Bauantragspläne/01 Blanko', '08 Bauantrag/02 Bauantragspläne', 32, '01 Blanko', false, '{}', null),
  ('08 Bauantrag/02 Bauantragspläne/01 Blanko/01 PDFs', '08 Bauantrag/02 Bauantragspläne/01 Blanko', 33, '01 PDFs', false, '{}', null),
  ('08 Bauantrag/02 Bauantragspläne/01 Blanko/02 DWGs', '08 Bauantrag/02 Bauantragspläne/01 Blanko', 34, '02 DWGs', false, '{}', null),
  ('08 Bauantrag/02 Bauantragspläne/02 Unterzeichnet', '08 Bauantrag/02 Bauantragspläne', 35, '02 Unterzeichnet', false, array['bauantragspläne unterschrieben', 'unterzeichnete pläne']::text[], null),
  ('08 Bauantrag/03 Wohnflächenberechnung', '08 Bauantrag', 36, '03 Wohnflächenberechnung', false, array['wohnflächenberechnung', 'wohnfläche']::text[], null),
  ('08 Bauantrag/04 Amtliche Lagepläne', '08 Bauantrag', 37, '04 Amtliche Lagepläne', false, array['amtlicher lageplan', 'lageplan']::text[], null),
  ('08 Bauantrag/05 Eingangsbestätigung', '08 Bauantrag', 38, '05 Eingangsbestätigung', false, '{}', null),
  ('08 Bauantrag/05 Eingangsbestätigung/01 Eingangsbestätigung', '08 Bauantrag/05 Eingangsbestätigung', 39, '01 Eingangsbestätigung', false, array['eingangsbestätigung', 'eingangsbescheinigung', 'eingang ihres bauantrags']::text[], null),
  ('08 Bauantrag/05 Eingangsbestätigung/02 Unvollständigkeitsmitteilung', '08 Bauantrag/05 Eingangsbestätigung', 40, '02 Unvollständigkeitsmitteilung', false, array['unvollständigkeit', 'unvollständig']::text[], null),
  ('08 Bauantrag/06 Nachforderungen', '08 Bauantrag', 41, '06 Nachforderungen', false, array['nachforderung', 'nachreichung', 'fehlende unterlagen']::text[], null),
  ('08 Bauantrag/07 Deckblatt', '08 Bauantrag', 42, '07 Deckblatt', false, '{}', null),
  ('08 Bauantrag/07 Deckblatt/Deckblatt 1', '08 Bauantrag/07 Deckblatt', 43, 'Deckblatt 1', false, '{}', null),
  ('08 Bauantrag/07 Deckblatt/Deckblatt 1/01 Pläne', '08 Bauantrag/07 Deckblatt/Deckblatt 1', 44, '01 Pläne', false, '{}', null),
  ('08 Bauantrag/07 Deckblatt/Deckblatt 2', '08 Bauantrag/07 Deckblatt', 45, 'Deckblatt 2', false, '{}', null),
  ('08 Bauantrag/07 Deckblatt/Deckblatt 2/01 Pläne', '08 Bauantrag/07 Deckblatt/Deckblatt 2', 46, '01 Pläne', false, '{}', null),
  ('08 Bauantrag/08 Entwässerungsantrag', '08 Bauantrag', 47, '08 Entwässerungsantrag', false, '{}', null),
  ('08 Bauantrag/08 Entwässerungsantrag/01 Formular', '08 Bauantrag/08 Entwässerungsantrag', 48, '01 Formular', false, array['entwässerungsantrag']::text[], null),
  ('08 Bauantrag/08 Entwässerungsantrag/02 Pläne', '08 Bauantrag/08 Entwässerungsantrag', 49, '02 Pläne', false, '{}', null),
  ('09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige', null, 50, '09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige', false, '{}', null),
  ('09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige/01 Baugenehmigung', '09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige', 51, '01 Baugenehmigung', false, '{}', null),
  ('09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige/01 Baugenehmigung/01 erhalten am {datum}', '09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige/01 Baugenehmigung', 52, '01 erhalten am {datum}', true, array['baugenehmigung', 'genehmigungsbescheid', 'baugenehmigungsbescheid']::text[], null),
  ('09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige/02 Baugenehmigung Entwässerung', '09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige', 53, '02 Baugenehmigung Entwässerung', false, array['entwässerungsgenehmigung', 'genehmigung entwässerung']::text[], null),
  ('09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige/03 Baufreigabe', '09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige', 54, '03 Baufreigabe', false, '{}', null),
  ('09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige/03 Baufreigabe/01 erhalten am {datum}', '09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige/03 Baufreigabe', 55, '01 erhalten am {datum}', true, array['baufreigabe', 'baufreigabeschein', 'roter punkt']::text[], null),
  ('09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige/03 Baufreigabe/02 verteilt am {datum}', '09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige/03 Baufreigabe', 56, '02 verteilt am {datum}', true, '{}', null),
  ('09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige/04 Baubeginnsanzeige', '09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige', 57, '04 Baubeginnsanzeige', false, array['baubeginnsanzeige']::text[], null),
  ('10 Bodengutachten', null, 58, '10 Bodengutachten', false, '{}', null),
  ('10 Bodengutachten/Bodengutachten erhalten am {datum}', '10 Bodengutachten', 59, 'Bodengutachten erhalten am {datum}', true, array['bodengutachten', 'baugrundgutachten', 'baugrund']::text[], null),
  ('11 Baubegleitung', null, 60, '11 Baubegleitung', false, '{}', null),
  ('11 Baubegleitung/01 Ausschreibung', '11 Baubegleitung', 61, '01 Ausschreibung', false, '{}', null),
  ('11 Baubegleitung/01 Ausschreibung/01 Massenermittlung', '11 Baubegleitung/01 Ausschreibung', 62, '01 Massenermittlung', false, '{}', null),
  ('11 Baubegleitung/01 Ausschreibung/02 Ausschreibung versendet', '11 Baubegleitung/01 Ausschreibung', 63, '02 Ausschreibung versendet', false, '{}', null),
  ('11 Baubegleitung/01 Ausschreibung/02 Ausschreibung versendet/01 <Firma> am {datum}', '11 Baubegleitung/01 Ausschreibung/02 Ausschreibung versendet', 64, '01 <Firma> am {datum}', true, '{}', null),
  ('11 Baubegleitung/01 Ausschreibung/02 Ausschreibung versendet/02 <Firma 2> am {datum}', '11 Baubegleitung/01 Ausschreibung/02 Ausschreibung versendet', 65, '02 <Firma 2> am {datum}', true, '{}', null),
  ('11 Baubegleitung/01 Ausschreibung/03 Angebote erhalten', '11 Baubegleitung/01 Ausschreibung', 66, '03 Angebote erhalten', false, array['angebot erdarbeiten', 'angebot tiefbau']::text[], null),
  ('11 Baubegleitung/01 Ausschreibung/04 Preisspiegel', '11 Baubegleitung/01 Ausschreibung', 67, '04 Preisspiegel', false, '{}', null),
  ('11 Baubegleitung/01 Ausschreibung/04 Preisspiegel/01 Preisspiegel', '11 Baubegleitung/01 Ausschreibung/04 Preisspiegel', 68, '01 Preisspiegel', false, array['preisspiegel']::text[], null),
  ('11 Baubegleitung/01 Ausschreibung/04 Preisspiegel/02 Preisspiegel versendet am {datum}', '11 Baubegleitung/01 Ausschreibung/04 Preisspiegel', 69, '02 Preisspiegel versendet am {datum}', true, '{}', null),
  ('11 Baubegleitung/01 Ausschreibung/05 Vergabe Auftragsbestätigung', '11 Baubegleitung/01 Ausschreibung', 70, '05 Vergabe Auftragsbestätigung', false, '{}', null),
  ('11 Baubegleitung/02 Hausanschlüsse', '11 Baubegleitung', 71, '02 Hausanschlüsse', false, '{}', null),
  ('11 Baubegleitung/02 Hausanschlüsse/01 Formular Schumann Haustechnik', '11 Baubegleitung/02 Hausanschlüsse', 72, '01 Formular Schumann Haustechnik', false, '{}', null),
  ('11 Baubegleitung/02 Hausanschlüsse/02 Strom', '11 Baubegleitung/02 Hausanschlüsse', 73, '02 Strom', false, '{}', null),
  ('11 Baubegleitung/02 Hausanschlüsse/02 Strom/01 beantragt am {datum}', '11 Baubegleitung/02 Hausanschlüsse/02 Strom', 74, '01 beantragt am {datum}', true, '{}', null),
  ('11 Baubegleitung/02 Hausanschlüsse/02 Strom/02 Angebot erhalten am {datum}', '11 Baubegleitung/02 Hausanschlüsse/02 Strom', 75, '02 Angebot erhalten am {datum}', true, array['angebot strom', 'netzanschluss', 'stromanschluss', 'angebot hausanschluss strom']::text[], null),
  ('11 Baubegleitung/02 Hausanschlüsse/02 Strom/03 Auftragsbestätigung', '11 Baubegleitung/02 Hausanschlüsse/02 Strom', 76, '03 Auftragsbestätigung', false, array['auftragsbestätigung strom']::text[], null),
  ('11 Baubegleitung/02 Hausanschlüsse/03 Baustrom', '11 Baubegleitung/02 Hausanschlüsse', 77, '03 Baustrom', false, '{}', null),
  ('11 Baubegleitung/02 Hausanschlüsse/03 Baustrom/01 Angebotsabfrage', '11 Baubegleitung/02 Hausanschlüsse/03 Baustrom', 78, '01 Angebotsabfrage', false, '{}', null),
  ('11 Baubegleitung/02 Hausanschlüsse/03 Baustrom/01 Angebotsabfrage/01 <Firma> am {datum}', '11 Baubegleitung/02 Hausanschlüsse/03 Baustrom/01 Angebotsabfrage', 79, '01 <Firma> am {datum}', true, '{}', null),
  ('11 Baubegleitung/02 Hausanschlüsse/03 Baustrom/02 Auftragsbestätigung', '11 Baubegleitung/02 Hausanschlüsse/03 Baustrom', 80, '02 Auftragsbestätigung', false, array['baustrom']::text[], null),
  ('11 Baubegleitung/02 Hausanschlüsse/04 Wasser', '11 Baubegleitung/02 Hausanschlüsse', 81, '04 Wasser', false, '{}', null),
  ('11 Baubegleitung/02 Hausanschlüsse/04 Wasser/01 Wasser beantragt am {datum}', '11 Baubegleitung/02 Hausanschlüsse/04 Wasser', 82, '01 Wasser beantragt am {datum}', true, array['wasseranschluss', 'hausanschluss wasser']::text[], null),
  ('11 Baubegleitung/02 Hausanschlüsse/05 Bauwasser', '11 Baubegleitung/02 Hausanschlüsse', 83, '05 Bauwasser', false, '{}', null),
  ('11 Baubegleitung/02 Hausanschlüsse/05 Bauwasser/01 Bauwasser beantragt am {datum}', '11 Baubegleitung/02 Hausanschlüsse/05 Bauwasser', 84, '01 Bauwasser beantragt am {datum}', true, '{}', null),
  ('11 Baubegleitung/02 Hausanschlüsse/06 Medien', '11 Baubegleitung/02 Hausanschlüsse', 85, '06 Medien', false, '{}', null),
  ('11 Baubegleitung/02 Hausanschlüsse/06 Medien/01 Medien beauftragt am {datum}', '11 Baubegleitung/02 Hausanschlüsse/06 Medien', 86, '01 Medien beauftragt am {datum}', true, array['glasfaser', 'telekom', 'medienanschluss']::text[], null),
  ('11 Baubegleitung/02 Hausanschlüsse/07 Lieferung MSH und Grabarbeiten', '11 Baubegleitung/02 Hausanschlüsse', 87, '07 Lieferung MSH und Grabarbeiten', false, '{}', 'Infos.docx: Wer liefert die Mehrsparten-Hauseinführung? Wer führt die Grabarbeiten aus?'),
  ('11 Baubegleitung/02 Hausanschlüsse/08 KG2000,Dichtheitsprüfung,Sichtabnahme', '11 Baubegleitung/02 Hausanschlüsse', 88, '08 KG2000,Dichtheitsprüfung,Sichtabnahme', false, '{}', 'Infos.docx: KG-2000-Rohre Pflicht? Dichtheitsprüfung? Sichtabnahme? je Ja/Nein'),
  ('11 Baubegleitung/03 Ausführungspläne', '11 Baubegleitung', 89, '03 Ausführungspläne', false, '{}', null),
  ('11 Baubegleitung/04 Bauanlaufgespräch', '11 Baubegleitung', 90, '04 Bauanlaufgespräch', false, '{}', null),
  ('11 Baubegleitung/04 Bauanlaufgespräch/01 Einladung versendet', '11 Baubegleitung/04 Bauanlaufgespräch', 91, '01 Einladung versendet', false, '{}', null),
  ('11 Baubegleitung/04 Bauanlaufgespräch/01 Einladung versendet/01 Zusagen', '11 Baubegleitung/04 Bauanlaufgespräch/01 Einladung versendet', 92, '01 Zusagen', false, '{}', null),
  ('11 Baubegleitung/04 Bauanlaufgespräch/01 Einladung versendet/02 Absagen', '11 Baubegleitung/04 Bauanlaufgespräch/01 Einladung versendet', 93, '02 Absagen', false, '{}', null),
  ('11 Baubegleitung/04 Bauanlaufgespräch/02 Bauanlaufgespräch', '11 Baubegleitung/04 Bauanlaufgespräch', 94, '02 Bauanlaufgespräch', false, '{}', null),
  ('11 Baubegleitung/04 Bauanlaufgespräch/02 Bauanlaufgespräch/01 Protokoll', '11 Baubegleitung/04 Bauanlaufgespräch/02 Bauanlaufgespräch', 95, '01 Protokoll', false, array['bauanlaufgespräch', 'protokoll bauanlauf']::text[], null),
  ('11 Baubegleitung/04 Bauanlaufgespräch/02 Bauanlaufgespräch/02 Fotos', '11 Baubegleitung/04 Bauanlaufgespräch/02 Bauanlaufgespräch', 96, '02 Fotos', false, '{}', null),
  ('11 Baubegleitung/05 Vermesser', '11 Baubegleitung', 97, '05 Vermesser', false, '{}', null),
  ('11 Baubegleitung/05 Vermesser/01 Grobabsteckung', '11 Baubegleitung/05 Vermesser', 98, '01 Grobabsteckung', false, '{}', null),
  ('11 Baubegleitung/05 Vermesser/01 Grobabsteckung/01 bestellt am {datum}', '11 Baubegleitung/05 Vermesser/01 Grobabsteckung', 99, '01 bestellt am {datum}', true, '{}', null),
  ('11 Baubegleitung/05 Vermesser/01 Grobabsteckung/02 erhalten am {datum}', '11 Baubegleitung/05 Vermesser/01 Grobabsteckung', 100, '02 erhalten am {datum}', true, array['grobabsteckung']::text[], null),
  ('11 Baubegleitung/05 Vermesser/02 Feineinmessung', '11 Baubegleitung/05 Vermesser', 101, '02 Feineinmessung', false, '{}', null),
  ('11 Baubegleitung/05 Vermesser/02 Feineinmessung/01 bestellt am {datum}', '11 Baubegleitung/05 Vermesser/02 Feineinmessung', 102, '01 bestellt am {datum}', true, '{}', null),
  ('11 Baubegleitung/05 Vermesser/02 Feineinmessung/02 erhalten am {datum}', '11 Baubegleitung/05 Vermesser/02 Feineinmessung', 103, '02 erhalten am {datum}', true, array['feineinmessung', 'schnurgerüst']::text[], null),
  ('11 Baubegleitung/06 Straßensperrung', '11 Baubegleitung', 104, '06 Straßensperrung', false, '{}', null),
  ('11 Baubegleitung/06 Straßensperrung/01 Straßensperrung für BP&Keller', '11 Baubegleitung/06 Straßensperrung', 105, '01 Straßensperrung für BP&Keller', false, '{}', null),
  ('11 Baubegleitung/06 Straßensperrung/01 Straßensperrung für BP&Keller/01 beauftragt am {datum}', '11 Baubegleitung/06 Straßensperrung/01 Straßensperrung für BP&Keller', 106, '01 beauftragt am {datum}', true, '{}', null),
  ('11 Baubegleitung/06 Straßensperrung/01 Straßensperrung für BP&Keller/02 Angebote erhalten am {datum}', '11 Baubegleitung/06 Straßensperrung/01 Straßensperrung für BP&Keller', 107, '02 Angebote erhalten am {datum}', true, '{}', null),
  ('11 Baubegleitung/06 Straßensperrung/01 Straßensperrung für BP&Keller/03 Auftragsbestätigung', '11 Baubegleitung/06 Straßensperrung/01 Straßensperrung für BP&Keller', 108, '03 Auftragsbestätigung', false, '{}', null),
  ('11 Baubegleitung/06 Straßensperrung/02 Straßensperrung für Haus', '11 Baubegleitung/06 Straßensperrung', 109, '02 Straßensperrung für Haus', false, '{}', null),
  ('11 Baubegleitung/06 Straßensperrung/02 Straßensperrung für Haus/01 beauftragt am {datum}', '11 Baubegleitung/06 Straßensperrung/02 Straßensperrung für Haus', 110, '01 beauftragt am {datum}', true, '{}', null),
  ('11 Baubegleitung/06 Straßensperrung/02 Straßensperrung für Haus/02 Angebote erhalten am {datum}', '11 Baubegleitung/06 Straßensperrung/02 Straßensperrung für Haus', 111, '02 Angebote erhalten am {datum}', true, '{}', null),
  ('11 Baubegleitung/06 Straßensperrung/02 Straßensperrung für Haus/03 Auftragsbestätigung', '11 Baubegleitung/06 Straßensperrung/02 Straßensperrung für Haus', 112, '03 Auftragsbestätigung', false, array['straßensperrung', 'verkehrsrechtliche anordnung']::text[], null),
  ('11 Baubegleitung/07 BP-Kellerbaufirma', '11 Baubegleitung', 113, '07 BP-Kellerbaufirma', false, '{}', null),
  ('11 Baubegleitung/07 BP-Kellerbaufirma/01 Protokoll', '11 Baubegleitung/07 BP-Kellerbaufirma', 114, '01 Protokoll', false, '{}', null),
  ('11 Baubegleitung/07 BP-Kellerbaufirma/02 Zeitschiene', '11 Baubegleitung/07 BP-Kellerbaufirma', 115, '02 Zeitschiene', false, array['zeitschiene', 'bauzeitenplan']::text[], null),
  ('11 Baubegleitung/09 Hausanschlüsse nach der Hausaufstellung', '11 Baubegleitung', 116, '09 Hausanschlüsse nach der Hausaufstellung', false, '{}', null),
  ('11 Baubegleitung/09 Hausanschlüsse nach der Hausaufstellung/01 Einladung versendet', '11 Baubegleitung/09 Hausanschlüsse nach der Hausaufstellung', 117, '01 Einladung versendet', false, '{}', null),
  ('11 Baubegleitung/09 Hausanschlüsse nach der Hausaufstellung/02 Wasser eingeführt', '11 Baubegleitung/09 Hausanschlüsse nach der Hausaufstellung', 118, '02 Wasser eingeführt', false, '{}', null),
  ('11 Baubegleitung/09 Hausanschlüsse nach der Hausaufstellung/03 Strom eingeführt', '11 Baubegleitung/09 Hausanschlüsse nach der Hausaufstellung', 119, '03 Strom eingeführt', false, '{}', null),
  ('11 Baubegleitung/09 Hausanschlüsse nach der Hausaufstellung/04 Medien eingeführt', '11 Baubegleitung/09 Hausanschlüsse nach der Hausaufstellung', 120, '04 Medien eingeführt', false, '{}', null),
  ('11 Baubegleitung/09 Hausanschlüsse nach der Hausaufstellung/05 Baustellenfotos', '11 Baubegleitung/09 Hausanschlüsse nach der Hausaufstellung', 121, '05 Baustellenfotos', false, '{}', null),
  ('11 Baubegleitung/10 Baustellentermine', '11 Baubegleitung', 122, '10 Baustellentermine', false, '{}', null),
  ('11 Baubegleitung/10 Baustellentermine/01 Baustellentermin am {datum}', '11 Baubegleitung/10 Baustellentermine', 123, '01 Baustellentermin am {datum}', true, '{}', null),
  ('11 Baubegleitung/10 Baustellentermine/01 Baustellentermin am {datum}/01 Einladung versendet {datum}', '11 Baubegleitung/10 Baustellentermine/01 Baustellentermin am {datum}', 124, '01 Einladung versendet {datum}', true, '{}', null),
  ('11 Baubegleitung/10 Baustellentermine/01 Baustellentermin am {datum}/02 Fotos', '11 Baubegleitung/10 Baustellentermine/01 Baustellentermin am {datum}', 125, '02 Fotos', false, '{}', null);
-- END folder_templates
