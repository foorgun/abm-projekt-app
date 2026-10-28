-- ABM Projekt-App: Neues Projekt aus mehreren Dokumenten (z. B. Werkvertrag und Vermesservertrag).
--   * Dokumentarten: zusätzlich Baugrundauftrag und Honorarvereinbarung.
--   * project_draft_files: jede Datei eines Entwurfs einzeln (Art, Status, Ergebnis der Auslesung, Metadaten). Die Datei
--     wird zuerst gespeichert und dann ausgelesen; scheitert die Auslesung, bleibt sie mit Fehlermeldung im Entwurf.
--     Nur Admin und Mitarbeiter (wie project_drafts, 0010). Nie löschen: "entfernt" statt Löschen der Zeile.
--   * Höchstens 30 MB je Datei (wie in der App und in der Edge Function).
--   * extraction_log: Datei und Dokumentart je Auslesung. Darüber lassen sich die Kosten Projekten zuordnen
--     (Datei → Entwurf → Projekt, sobald der Entwurf übernommen ist).
--   * Kostenübersicht für Admins: extraction_costs_by_month und extraction_costs_by_project (Rechte des Aufrufers:
--     extraction_log lesen nur Admins, 0010).
-- Hinweis: Die neuen Werte von document_type werden in dieser Datei nicht verwendet (sonst scheitert sie in einer
-- Transaktion).

alter type public.document_type add value if not exists 'baugrundauftrag';
alter type public.document_type add value if not exists 'honorarvereinbarung';

alter table public.project_drafts add constraint project_drafts_file_size_max check (file_size <= 31457280);

-- ---------------------------------------------------------------------------
-- Dateien eines Entwurfs
-- ---------------------------------------------------------------------------
create table public.project_draft_files (
  id           uuid primary key default gen_random_uuid(),
  draft_id     uuid not null references public.project_drafts(id) on delete cascade,
  sort         integer not null default 0 check (sort >= 0),
  file_name    text not null check (length(btrim(file_name)) between 1 and 255),
  -- 30 MB je Datei
  file_size    bigint not null check (file_size between 1 and 31457280),
  file_mime    text,
  doc_type     public.document_type not null default 'sonstiges',
  status       text not null default 'offen' check (status in ('offen', 'ausgelesen', 'fehler', 'entfernt', 'abgelegt')),
  -- Grund, warum die Auslesung scheiterte (keine Inhalte des Dokuments)
  error        text check (error is null or length(error) <= 500),
  -- Ergebnis der Auslesung dieser Datei: {"felder": {...}, "hinweise": [...], "seiten": {...}, ...}
  fields       jsonb not null default '{}'::jsonb,
  -- Metadaten am Dokument (Vertragsdatum, Vertragspreis, Angebotsnummer, Haustyp), wie in der Prüfmaske bestätigt
  meta         jsonb not null default '{}'::jsonb,
  -- Datei im privaten Speicher unter "drafts/<Entwurf>/<Datei>-<Name>", bis sie im Projekt abgelegt ist
  storage_path text unique,
  document_id  uuid references public.documents(id) on delete set null,
  created_by   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint project_draft_files_fields_object check (jsonb_typeof(fields) = 'object'),
  constraint project_draft_files_meta_object   check (jsonb_typeof(meta) = 'object')
);
create index project_draft_files_draft_idx on public.project_draft_files (draft_id, sort);
create trigger project_draft_files_touch before update on public.project_draft_files
  for each row execute function public.touch_updated_at();

alter table public.project_draft_files enable row level security;
-- Nur Admin und Mitarbeiter, und nur an offenen Entwürfen. Freiberufler sehen und schreiben nichts.
create policy project_draft_files_read on public.project_draft_files for select to authenticated
  using (public.is_staff());
create policy project_draft_files_insert on public.project_draft_files for insert to authenticated
  with check (public.is_staff() and exists (select 1 from public.project_drafts d where d.id = draft_id and d.status = 'offen'));
create policy project_draft_files_update on public.project_draft_files for update to authenticated
  using (public.is_staff() and exists (select 1 from public.project_drafts d where d.id = draft_id and d.status = 'offen'))
  with check (public.is_staff());

grant select on public.project_draft_files to authenticated;
grant insert (draft_id, sort, file_name, file_size, file_mime, doc_type) on public.project_draft_files to authenticated;
grant update (doc_type, status, error, fields, meta, storage_path, document_id) on public.project_draft_files to authenticated;

-- ---------------------------------------------------------------------------
-- Protokoll der Auslesungen: welche Datei, welche Art (schreibt weiterhin nur die Edge Function)
-- ---------------------------------------------------------------------------
alter table public.extraction_log
  add column draft_file_id uuid references public.project_draft_files(id) on delete set null,
  add column doc_type      public.document_type;
create index extraction_log_draft_file_idx on public.extraction_log (draft_file_id);

-- ---------------------------------------------------------------------------
-- Kostenübersicht (nur Admin, über die Zeilenregel von extraction_log). Monate in UTC wie die Kostenbremse.
-- ---------------------------------------------------------------------------
create view public.extraction_costs_by_month with (security_invoker = true) as
select to_char(l.at at time zone 'UTC', 'YYYY-MM')       as monat,
       count(*)                                         as auslesungen,
       count(*) filter (where not l.ok)                  as fehlgeschlagen,
       coalesce(sum(l.input_tokens), 0)                  as input_tokens,
       coalesce(sum(l.output_tokens), 0)                 as output_tokens,
       round(coalesce(sum(l.cost_eur), 0), 4)            as kosten_eur
from public.extraction_log l
group by 1;

create view public.extraction_costs_by_project with (security_invoker = true) as
select d.project_id,
       p.abm_nr,
       p.bauherr_label,
       count(*)                                         as auslesungen,
       count(*) filter (where not l.ok)                  as fehlgeschlagen,
       coalesce(sum(l.input_tokens), 0)                  as input_tokens,
       coalesce(sum(l.output_tokens), 0)                 as output_tokens,
       round(coalesce(sum(l.cost_eur), 0), 4)            as kosten_eur
from public.extraction_log l
left join public.project_draft_files f on f.id = l.draft_file_id
left join public.project_drafts d      on d.id = f.draft_id and d.status = 'uebernommen'
left join public.projects p            on p.id = d.project_id
group by d.project_id, p.abm_nr, p.bauherr_label;

revoke all on public.extraction_costs_by_month, public.extraction_costs_by_project from anon, public;
grant select on public.extraction_costs_by_month, public.extraction_costs_by_project to authenticated;
