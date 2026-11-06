-- ABM Projekt-App: Bürodaten ändern auch Mitarbeiter (bisher nur Admins, 0013). Wunsch von ABM: die Büroleitung ist
-- Mitarbeiterin, nicht Admin, und pflegt die Angaben fürs Planungsprotokoll.
--   * Nur die Zeilenregel fürs Ändern wird weiter: Lesen wie bisher (Admin und Mitarbeiter), Freiberufler weder lesen noch
--     ändern. Anlegen und Löschen bleiben gesperrt (keine Rechte, 0013). Der Stempel (geaendert_von/_am) und die Prüfung der
--     E-Mail laufen weiter im Trigger.
-- Die Datei lässt sich mehrfach ausführen.

drop policy if exists buero_daten_admin_update on public.buero_daten;
drop policy if exists buero_daten_staff_update on public.buero_daten;
create policy buero_daten_staff_update on public.buero_daten for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
