-- ABM Projekt-App: Projekt endgültig löschen (nur Admin).
--
-- Bisher galt "Projekte nie löschen, Storno ist ein Status" (0004). Das bleibt der Normalfall. Diese Funktion ist für
-- Fehlanlagen und Testprojekte: sie entfernt das Projekt mit allem, was daran hängt, unwiderruflich.
--
-- Bewusst als Funktion mit den Rechten des Eigentümers (security definer) und OHNE neue DELETE-Rechte oder -Regeln:
--   * Clients dürfen weiterhin keine Zeile in projects, activities, invoices, bauherren … direkt löschen.
--   * Die Funktion prüft selbst, dass ein Admin aufruft. Mitarbeiter, Freiberufler und Konten ohne Rolle werden abgewiesen.
--
-- Was gelöscht wird:
--   * über die Fremdschlüssel (on delete cascade): Schritte, Rechnungen, Dokumente, Aufgaben, Aktivitäten,
--     Projektbeteiligte, Zuweisungen (project_members), Regeln des Agenten zu diesem Projekt
--   * ausdrücklich: Entwürfe (project_drafts) zu diesem Projekt
--   * der Bauherr-Kontakt, wenn er an keinem anderen Projekt hängt
-- Was bleibt: Mails und Anhänge des Posteingangs (inbox_items, inbox_attachments) und Lernbeispiele (agent_feedback);
--   ihr Verweis auf das Projekt wird durch die Fremdschlüssel geleert.
--
-- Dateien im Speicher kann SQL nicht entfernen. Die Funktion gibt deshalb die Speicherpfade zurück; die App löscht die
-- Dateien danach über die Storage-API (Regel project_documents_delete aus 0001: nur Admin und Mitarbeiter).

create function public.delete_project(p_id uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  v_bauherr uuid;
  v_paths   text[];
begin
  -- Berechtigung zuerst, noch bevor irgendetwas über das Projekt verraten wird
  if not public.is_admin() then raise exception 'Keine Berechtigung für diese Aktion'; end if;

  select bauherr_id into v_bauherr from public.projects where id = p_id for update;
  if not found then raise exception 'Projekt nicht gefunden'; end if;

  -- Speicherpfade merken, bevor die Zeilen verschwinden
  select coalesce(array_agg(path), '{}') into v_paths from (
    select storage_path as path from public.documents      where project_id = p_id and storage_path is not null
    union
    select storage_path         from public.project_drafts where project_id = p_id and storage_path is not null
  ) x;

  delete from public.project_drafts where project_id = p_id;
  delete from public.projects where id = p_id;

  if v_bauherr is not null and not exists (select 1 from public.projects where bauherr_id = v_bauherr) then
    delete from public.bauherren where id = v_bauherr;
  end if;

  return v_paths;
end $$;

revoke all on function public.delete_project(uuid) from public, anon;
grant execute on function public.delete_project(uuid) to authenticated, service_role;
