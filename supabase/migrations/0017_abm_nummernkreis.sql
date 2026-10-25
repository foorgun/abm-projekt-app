-- ABM Projekt-App: Nummernkreise der Hausbaufirmen und eindeutige ABM-Nr.
--   * Format der ABM-Nr.: vier Ziffern (Nummernkreis der Hausbaufirma), Bindestrich, laufende Nummer ohne führende Nullen
--     und mit beliebiger Länge, z. B. 8161-1588, 8185-633, 8260-321.
--   * Der Nummernkreis steht bei der Hausbaufirma (companies.number_prefix, seit 0001). Keine zweite Tabelle: dieselbe
--     Firma steuert Verkäufer, Filter und die Vorlage des Planungsprotokolls.
--   * Nummernkreise pflegen nur Admins (Einstellungen). Mitarbeiter legen Firmen weiter nur mit Namen an (0007).
--   * Eindeutig sind nur ABM-Nummern im gültigen Format. "Bauvoranfrage" (so schreibt die App Bauvoranfragen) und alte
--     Werte in anderem Format bleiben erlaubt und unverändert; die App meldet sie im Formular.

-- Nummernkreise der drei Hausbaufirmen (nur, wo noch keiner eingetragen ist)
update public.companies set number_prefix = '8161' where name = 'Bien-Zenker'  and number_prefix is null;
update public.companies set number_prefix = '8185' where name = 'Schwabenhaus' and number_prefix is null;
update public.companies set number_prefix = '8260' where name = 'Living Haus'  and number_prefix is null;

alter table public.companies add constraint companies_prefix_format check (number_prefix ~ '^\d{4}$');
create unique index companies_prefix_unique on public.companies (number_prefix);

-- Rechte: Nummernkreis setzen und ändern dürfen nur Admins. Die Spaltenrechte gelten für alle Angemeldeten, die
-- einschränkenden Regeln (restrictive) begrenzen sie auf Admins. companies_staff (0001) bleibt die erlaubende Regel.
grant insert (number_prefix) on public.companies to authenticated;
grant update (number_prefix) on public.companies to authenticated;

create policy companies_prefix_insert_admin on public.companies as restrictive for insert to authenticated
  with check (number_prefix is null or public.is_admin());
create policy companies_update_admin on public.companies as restrictive for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ABM-Nr. eindeutig (nur im gültigen Format, auch über stornierte Projekte hinweg). Verglichen wird die Nummer als Zahl:
-- "8260-041" (alte Schreibweise mit Nullen) und "8260-41" gelten als dieselbe Nummer.
create unique index projects_abm_nr_unique on public.projects (split_part(abm_nr, '-', 1), (split_part(abm_nr, '-', 2)::numeric))
  where abm_nr ~ '^\d{4}-\d+$';
