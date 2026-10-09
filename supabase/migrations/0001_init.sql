-- ABM Projekt-App: Grundschema
-- Prinzipien:
--   * Sicher per Voreinstellung: Wer keine Rolle in user_roles hat, sieht nichts.
--   * Freiberufler sehen nur Projekte, denen sie in project_members zugeordnet sind,
--     und weder Rechnungen noch Kontaktdaten der Bauherren.
--   * Der Ablauf eines Projekts steht in project_steps (ein Datum pro Schritt),
--     nicht in festen Spalten. Neue Schritte brauchen nur eine Zeile in step_definitions.

-- ---------------------------------------------------------------------------
-- Typen
-- ---------------------------------------------------------------------------
create type public.app_role       as enum ('admin', 'mitarbeiter', 'freiberufler');
create type public.team_role      as enum ('architekt', 'planer');
create type public.project_kind   as enum ('neubau', 'bauvoranfrage');
create type public.project_status as enum ('aktiv', 'storno', 'abgeschlossen');
create type public.invoice_status as enum ('geplant', 'faellig', 'versendet', 'bezahlt');

-- ---------------------------------------------------------------------------
-- Stammdaten
-- ---------------------------------------------------------------------------
-- Fertighausfirmen, für die ABM plant (Bien-Zenker, Living Haus, ...)
create table public.companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  number_prefix text,                       -- z. B. "8161" aus den ABM-Nummern
  created_at    timestamptz not null default now()
);

-- Verkäufer der Fertighausfirmen (die "Kunden" im Alltag)
create table public.salespeople (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

-- Interne Architekten (Kürzel BE, MC) und Planer
create table public.team_members (
  id      uuid primary key default gen_random_uuid(),
  code    text unique,                      -- Kürzel, z. B. "BE"
  name    text not null,
  role    public.team_role not null,
  user_id uuid references auth.users(id) on delete set null,
  active  boolean not null default true
);

-- Reihenfolge der Projektschritte (entspricht den Spalten der bisherigen Excel)
create table public.step_definitions (
  key        text primary key,
  label      text not null,
  sort_order integer not null unique
);

insert into public.step_definitions (key, label, sort_order) values
  ('plangespraech',       'Plangespräch',            10),
  ('vertrag_versendet',   'ABM-Vertrag versendet',   20),
  ('vertrag_zurueck',     'ABM-Vertrag zurück',      30),
  ('baugesuch_uebergabe', 'Übergabe Baugesuch',      40),
  ('baugenehmigung',      'Baugenehmigung',          50);

-- Bauherren (Endkunden). Enthält personenbezogene Daten, nur für Mitarbeiter lesbar.
create table public.bauherren (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  address          text,
  phone            text,
  email            text,
  building_address text,
  surveyor         text,                    -- Vermesser
  builder_order_no text,                    -- Auftragsnummer der Hausfirma
  basement_builder text,                    -- Kellerbauer
  customer_advisor text,                    -- Kundenbetreuer der Hausfirma
  notes            text,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Projekte
-- ---------------------------------------------------------------------------
create table public.projects (
  id             uuid primary key default gen_random_uuid(),
  abm_nr         text,                      -- bewusst NICHT unique: in der Excel gibt es Dubletten
  kind           public.project_kind   not null default 'neubau',
  status         public.project_status not null default 'aktiv',
  company_id     uuid references public.companies(id)    on delete set null,
  salesperson_id uuid references public.salespeople(id)  on delete set null,
  bauherr_id     uuid references public.bauherren(id)    on delete set null,
  bauherr_label  text not null,             -- Nachname(n) wie in der Projektliste
  location       text,                      -- Bauort
  architect_id   uuid references public.team_members(id) on delete set null,
  planer_id      uuid references public.team_members(id) on delete set null,
  baubetreuung   text,                      -- z. B. "3.1+3.2", Freitext wie in der Excel
  intake_month   date,                      -- erster Tag des Eingangsmonats
  notes          text,
  source_row     integer,                   -- Zeile in der alten Excel (Nachvollziehbarkeit)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index projects_abm_nr_idx   on public.projects (abm_nr);
create index projects_company_idx  on public.projects (company_id);
create index projects_status_idx   on public.projects (status);

create table public.project_steps (
  project_id  uuid not null references public.projects(id) on delete cascade,
  step_key    text not null references public.step_definitions(key),
  occurred_on date not null,
  note        text,
  primary key (project_id, step_key)
);

-- ---------------------------------------------------------------------------
-- Rechnungen (fehlt in der Excel komplett)
-- ---------------------------------------------------------------------------
create table public.invoices (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  label            text not null,
  amount_cents     integer not null check (amount_cents >= 0),
  trigger_step_key text references public.step_definitions(key),  -- Schritt, ab dem die Rechnung fällig wird
  status           public.invoice_status not null default 'geplant',
  due_on           date,
  sent_on          date,
  paid_on          date,
  created_at       timestamptz not null default now(),
  constraint invoices_sent_matches_status
    check ((status in ('versendet', 'bezahlt')) = (sent_on is not null)),
  constraint invoices_paid_matches_status
    check ((status = 'bezahlt') = (paid_on is not null))
);
create index invoices_project_idx on public.invoices (project_id);
create index invoices_status_idx  on public.invoices (status);

-- ---------------------------------------------------------------------------
-- Dokumente (Dateien liegen in Supabase Storage, hier nur die Metadaten)
-- ---------------------------------------------------------------------------
create table public.documents (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  name         text not null,
  storage_path text not null unique,        -- "<project_id>/<dateiname>"
  kind         text,
  size_bytes   bigint,
  uploaded_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index documents_project_idx on public.documents (project_id);

-- ---------------------------------------------------------------------------
-- Benutzer und Zugriff
-- ---------------------------------------------------------------------------
create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role    public.app_role not null default 'mitarbeiter'
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  primary key (project_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger projects_touch_updated_at
before update on public.projects
for each row execute function public.touch_updated_at();

create function public.try_uuid(t text) returns uuid
language plpgsql immutable as $$
begin
  return t::uuid;
exception when others then
  return null;
end $$;

-- security definer, damit die Policies auf user_roles/project_members nicht in sich selbst laufen
create function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.user_roles where user_id = auth.uid()
$$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() in ('admin', 'mitarbeiter'), false)
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() = 'admin', false)
$$;

create function public.has_project_access(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff()
      or exists (select 1 from public.project_members m
                 where m.project_id = p and m.user_id = auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- Zeilenschutz (Row Level Security)
-- ---------------------------------------------------------------------------
alter table public.companies        enable row level security;
alter table public.salespeople      enable row level security;
alter table public.team_members     enable row level security;
alter table public.step_definitions enable row level security;
alter table public.bauherren        enable row level security;
alter table public.projects         enable row level security;
alter table public.project_steps    enable row level security;
alter table public.invoices         enable row level security;
alter table public.documents        enable row level security;
alter table public.user_roles       enable row level security;
alter table public.project_members  enable row level security;

-- Stammdaten: Mitarbeiter lesen und pflegen, Freiberufler lesen nur die Schrittnamen
create policy companies_staff   on public.companies   for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy salespeople_staff on public.salespeople for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy team_read  on public.team_members for select to authenticated
  using (public.current_app_role() is not null);
create policy team_admin on public.team_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy steps_def_read on public.step_definitions for select to authenticated
  using (public.current_app_role() is not null);

-- Bauherren mit Kontaktdaten: nur Mitarbeiter
create policy bauherren_staff on public.bauherren for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Projekte
create policy projects_read   on public.projects for select to authenticated
  using (public.has_project_access(id));
create policy projects_write  on public.projects for insert to authenticated
  with check (public.is_staff());
create policy projects_update on public.projects for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy projects_delete on public.projects for delete to authenticated
  using (public.is_admin());

create policy steps_read  on public.project_steps for select to authenticated
  using (public.has_project_access(project_id));
create policy steps_write on public.project_steps for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Rechnungen: nur Mitarbeiter, Freiberufler sehen keine Beträge
create policy invoices_staff on public.invoices for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Dokumente
create policy documents_read   on public.documents for select to authenticated
  using (public.has_project_access(project_id));
create policy documents_insert on public.documents for insert to authenticated
  with check (public.has_project_access(project_id) and uploaded_by = auth.uid());
create policy documents_modify on public.documents for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy documents_delete on public.documents for delete to authenticated
  using (public.is_staff());

-- Benutzer und Zuordnung
create policy user_roles_read  on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy user_roles_admin on public.user_roles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy members_read  on public.project_members for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy members_write on public.project_members for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Dateiablage (Supabase Storage): privater Bucket, Pfad "<project_id>/<datei>"
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('project-documents', 'project-documents', false)
on conflict (id) do nothing;

create policy project_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'project-documents'
         and public.has_project_access(public.try_uuid((storage.foldername(name))[1])));

create policy project_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'project-documents'
              and public.has_project_access(public.try_uuid((storage.foldername(name))[1])));

create policy project_documents_modify on storage.objects for update to authenticated
  using (bucket_id = 'project-documents' and public.is_staff())
  with check (bucket_id = 'project-documents' and public.is_staff());

create policy project_documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'project-documents' and public.is_staff());
