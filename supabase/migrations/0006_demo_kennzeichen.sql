-- ABM Projekt-App: Kennzeichen für erfundene Demo-Daten in der echten Datenbank.
-- Das Seed-Skript setzt is_demo = true auf allen Wurzeldatensätzen; abhängige Zeilen (Schritte, Rechnungen,
-- Dokumente, Mails, Anhänge, Läufe) hängen per Fremdschlüssel daran und verschwinden beim Löschen mit.
-- So lassen sich Demo-Daten jederzeit vollständig entfernen, ohne echte Daten zu berühren.

alter table public.companies    add column is_demo boolean not null default false;
alter table public.team_members add column is_demo boolean not null default false;
alter table public.bauherren    add column is_demo boolean not null default false;
alter table public.projects     add column is_demo boolean not null default false;
alter table public.mailboxes    add column is_demo boolean not null default false;
alter table public.tasks        add column is_demo boolean not null default false;
alter table public.activities   add column is_demo boolean not null default false;
alter table public.agent_rules  add column is_demo boolean not null default false;

create index projects_demo_idx on public.projects (is_demo) where is_demo;

-- Die Oberfläche darf das Kennzeichen lesen (Hinweis "Demo-Daten"), aber nie setzen: Spaltenrechte aus 0004
-- nennen is_demo nicht, und bei Tabellen mit vollem INSERT/UPDATE verhindert es dieser Trigger.
create function public.forbid_demo_flag() returns trigger
language plpgsql as $$
begin
  if current_user = 'authenticated'
     and ((tg_op = 'INSERT' and new.is_demo) or (tg_op = 'UPDATE' and new.is_demo is distinct from old.is_demo)) then
    raise exception 'is_demo darf nur das Seed-Skript setzen';
  end if;
  return new;
end $$;

create trigger projects_forbid_demo before insert or update on public.projects
  for each row execute function public.forbid_demo_flag();
create trigger tasks_forbid_demo before insert or update on public.tasks
  for each row execute function public.forbid_demo_flag();
create trigger activities_forbid_demo before insert on public.activities
  for each row execute function public.forbid_demo_flag();
create trigger agent_rules_forbid_demo before insert on public.agent_rules
  for each row execute function public.forbid_demo_flag();

revoke all on function public.forbid_demo_flag() from public, anon;

-- mailboxes hat Spaltenrechte: is_demo lesbar machen
grant select (is_demo) on public.mailboxes to authenticated;
