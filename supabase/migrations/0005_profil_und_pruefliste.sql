-- ABM Projekt-App: Anzeigename der Benutzer, Mailadresse der Verkäufer, Funktionen für die Prüfliste.

-- Anzeigename steht bei der Rolle (ein Datensatz pro Benutzer, kein eigenes Profil nötig)
alter table public.user_roles add column full_name text not null default '';

-- Absenderadresse der Verkäufer: hilft dem Agenten bei der Zuordnung
alter table public.salespeople add column email text;

-- Ordnerpfade von Dokumenten: kein ".." (wie bei der Vorlage)
alter table public.documents
  add constraint documents_folder_no_dotdot check (folder_path !~ '(^|/)\.\.?(/|$)');

-- Eigener Anzeigename
create function public.current_user_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(full_name), ''), 'Unbekannt') from public.user_roles where user_id = auth.uid()
$$;

-- Namen der Kolleginnen und Kollegen (für "abgelegt von"). Mitarbeiter sehen alle Namen,
-- Freiberufler nur den eigenen. Rollen anderer bleiben verborgen (user_roles ist per RLS geschützt).
create function public.list_user_names() returns table (user_id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select r.user_id, r.full_name from public.user_roles r
  where public.is_staff() or r.user_id = auth.uid()
$$;

-- Status einer Mail aus ihren Anhängen ableiten
create function public.inbox_item_status(p_item uuid) returns public.inbox_status
language sql stable set search_path = public as $$
  select case
    when bool_or(status = 'pruefen')  then 'pruefen'
    when bool_or(status = 'fehler')   then 'fehler'
    when bool_or(status = 'abgelegt') then 'abgelegt'
    else 'ignoriert' end::public.inbox_status
  from public.inbox_attachments where item_id = p_item
$$;

-- Entscheidung in der Prüfliste: alles in einer Transaktion (Dokument, Anhang, Mail, Lernbeispiel, Regel, Protokoll).
-- security invoker: es gelten die Rechte und Zeilenregeln des angemeldeten Benutzers.
--   p_action: 'bestaetigen' | 'aendern' | 'ignorieren'
--   p_rule:   null | 'absender_projekt' | 'absender_ordner' | 'ignorieren'
--   p_rule_folder: Vorlagenpfad für die Regel "Absender → Ordner"
create function public.resolve_review(
  p_attachment uuid, p_action text,
  p_project uuid default null, p_folder text default null,
  p_rule text default null, p_rule_folder text default null
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  att   public.inbox_attachments%rowtype;
  item  public.inbox_items%rowtype;
  v_project uuid;
  v_folder  text;
  v_doc     uuid;
  v_sender  text;
begin
  if not public.is_staff() then raise exception 'Keine Berechtigung für diese Aktion'; end if;
  select * into att from public.inbox_attachments where id = p_attachment for update;
  if not found then raise exception 'Anhang nicht gefunden'; end if;
  select * into item from public.inbox_items where id = att.item_id;
  v_sender := lower(trim(item.from_email));

  if p_action = 'ignorieren' then
    update public.inbox_attachments set status = 'ignoriert' where id = att.id;
    insert into public.agent_feedback (attachment_id, action, created_by) values (att.id, 'ignoriert', auth.uid());
    if p_rule = 'ignorieren' then
      insert into public.agent_rules (kind, match, created_by) values ('ignorieren', v_sender, auth.uid());
    end if;
  elsif p_action in ('bestaetigen', 'aendern') then
    v_project := case when p_action = 'aendern' then p_project else att.project_id end;
    v_folder  := case when p_action = 'aendern' then p_folder  else att.folder_path end;
    if v_project is null or v_folder is null or trim(v_folder) = '' then raise exception 'Projekt und Ordner wählen'; end if;
    if v_folder like '%{datum}%' then raise exception 'Für diesen Ordner fehlt das Datum'; end if;
    if not exists (select 1 from public.projects where id = v_project) then raise exception 'Projekt nicht gefunden'; end if;

    if att.document_id is not null then
      -- Korrektur einer automatischen Ablage: dieselbe Kopie wandert in den richtigen Ordner
      update public.documents set project_id = v_project, folder_path = v_folder where id = att.document_id;
      v_doc := att.document_id;
    else
      insert into public.documents (project_id, name, storage_path, size_bytes, mime, folder_path, source, source_item_id, received_on, uploaded_by)
      values (v_project, att.file_name,
              coalesce(att.storage_path, v_project::text || '/' || gen_random_uuid()::text || '/anhang'),
              att.size_bytes, att.mime, v_folder, 'agent', att.id, (item.received_at at time zone 'Europe/Berlin')::date, auth.uid())
      returning id into v_doc;
    end if;

    update public.inbox_attachments
      set status = 'abgelegt', project_id = v_project, folder_path = v_folder, document_id = v_doc
      where id = att.id;
    update public.inbox_items set project_id = v_project where id = item.id;
    insert into public.agent_feedback (attachment_id, action, project_id, folder_path, created_by)
      values (att.id, case when p_action = 'aendern' then 'geaendert' else 'bestaetigt' end, v_project, v_folder, auth.uid());
    insert into public.activities (project_id, kind, text, actor, actor_id)
      values (v_project, 'agent', att.file_name || ' nach Prüfung abgelegt', public.current_user_name(), auth.uid());

    if p_rule = 'absender_projekt' then
      insert into public.agent_rules (kind, match, project_id, created_by) values ('absender_projekt', v_sender, v_project, auth.uid());
    elsif p_rule = 'absender_ordner' and p_rule_folder is not null then
      insert into public.agent_rules (kind, match, folder_path, created_by) values ('absender_ordner', v_sender, p_rule_folder, auth.uid());
    end if;
  else
    raise exception 'Unbekannte Aktion %', p_action;
  end if;

  update public.inbox_items set status = public.inbox_item_status(item.id) where id = item.id;
end $$;

-- Automatisch abgelegter Anhang war falsch: zurück in die Prüfliste (zählt gegen die Trefferquote)
create function public.report_wrong_filing(p_attachment uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare att public.inbox_attachments%rowtype;
begin
  if not public.is_staff() then raise exception 'Keine Berechtigung für diese Aktion'; end if;
  select * into att from public.inbox_attachments where id = p_attachment for update;
  if not found then raise exception 'Anhang nicht gefunden'; end if;
  if att.status <> 'abgelegt' then raise exception 'Nur abgelegte Anhänge lassen sich als falsch melden'; end if;
  update public.inbox_attachments set corrected = true, status = 'pruefen' where id = att.id;
  update public.inbox_items set status = public.inbox_item_status(att.item_id) where id = att.item_id;
end $$;

-- Rechte (Voreinstellung seit 0004: nichts automatisch)
revoke all on function public.current_user_name(), public.list_user_names(), public.inbox_item_status(uuid),
  public.resolve_review(uuid, text, uuid, text, text, text), public.report_wrong_filing(uuid) from public, anon;
grant execute on function public.current_user_name(), public.list_user_names(), public.inbox_item_status(uuid),
  public.resolve_review(uuid, text, uuid, text, text, text), public.report_wrong_filing(uuid) to authenticated, service_role;
