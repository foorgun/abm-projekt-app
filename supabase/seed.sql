-- Erfundene Beispieldaten für die lokale Entwicklung (supabase db reset).
-- Keine echten Kunden. Echte Daten kommen ausschließlich über tools/import_excel.py.

insert into public.companies (id, name, number_prefix) values
  ('c0000000-0000-4000-8000-000000000001', 'Bien-Zenker',  '8161'),
  ('c0000000-0000-4000-8000-000000000002', 'Living Haus',  '8260'),
  ('c0000000-0000-4000-8000-000000000003', 'Schwabenhaus', '8185');

insert into public.salespeople (id, company_id, name) values
  ('50000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Jonas Reiter'),
  ('50000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'Petra Lang'),
  ('50000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002', 'Marco Brandt'),
  ('50000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000003', 'Ralf Kunze');

insert into public.team_members (id, code, name, role) values
  ('70000000-0000-4000-8000-000000000001', 'BE', 'Architekt BE', 'architekt'),
  ('70000000-0000-4000-8000-000000000002', 'MC', 'Architekt MC', 'architekt'),
  ('70000000-0000-4000-8000-000000000003', null, 'T. Brandl',    'planer'),
  ('70000000-0000-4000-8000-000000000004', null, 'S. Kohler',    'planer');

insert into public.bauherren (id, name, address, phone, email, notes) values
  ('b0000000-0000-4000-8000-000000000001', 'Familie Beispiel', 'Musterweg 1, 89073 Ulm', '0731 000000', 'beispiel@example.com', 'Erfundener Datensatz'),
  ('b0000000-0000-4000-8000-000000000002', 'Frau Muster',      'Testgasse 2, 70173 Stuttgart', '0711 000000', 'muster@example.com', 'Erfundener Datensatz');

insert into public.projects
  (id, abm_nr, kind, status, company_id, salesperson_id, bauherr_id, bauherr_label, location,
   architect_id, planer_id, baubetreuung, intake_month)
values
  ('a0000000-0000-4000-8000-000000000001', '8161-9001', 'neubau', 'aktiv',
   'c0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'Beispiel', 'Ulm', '70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000003', '3.1+3.2', '2026-01-01'),
  ('a0000000-0000-4000-8000-000000000002', '8260-9001', 'neubau', 'aktiv',
   'c0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002',
   'Muster', 'Ingolstadt', '70000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000004', null, '2026-02-01'),
  ('a0000000-0000-4000-8000-000000000003', '8185-9001', 'neubau', 'aktiv',
   'c0000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000004', null,
   'Probst', 'Ehningen', '70000000-0000-4000-8000-000000000002', null, null, '2026-03-01'),
  ('a0000000-0000-4000-8000-000000000004', 'Bauvoranfrage', 'bauvoranfrage', 'aktiv',
   null, null, null, 'Winter', 'Ulm', '70000000-0000-4000-8000-000000000001', null, null, '2026-03-01'),
  ('a0000000-0000-4000-8000-000000000005', '8161-9002', 'neubau', 'storno',
   'c0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', null,
   'Storno-Beispiel', 'Tübingen', '70000000-0000-4000-8000-000000000001', null, null, '2026-04-01');

insert into public.project_steps (project_id, step_key, occurred_on) values
  ('a0000000-0000-4000-8000-000000000001', 'plangespraech',       '2026-01-12'),
  ('a0000000-0000-4000-8000-000000000001', 'vertrag_versendet',   '2026-01-20'),
  ('a0000000-0000-4000-8000-000000000001', 'vertrag_zurueck',     '2026-02-03'),
  ('a0000000-0000-4000-8000-000000000001', 'baugesuch_uebergabe', '2026-03-02'),
  ('a0000000-0000-4000-8000-000000000001', 'baugenehmigung',      '2026-08-14'),
  ('a0000000-0000-4000-8000-000000000002', 'plangespraech',       '2026-02-05'),
  ('a0000000-0000-4000-8000-000000000002', 'vertrag_versendet',   '2026-02-10'),
  ('a0000000-0000-4000-8000-000000000003', 'plangespraech',       '2026-03-04'),
  ('a0000000-0000-4000-8000-000000000004', 'vertrag_versendet',   '2026-03-09'),
  ('a0000000-0000-4000-8000-000000000004', 'vertrag_zurueck',     '2026-03-12');

-- Der Fall aus dem Büroalltag: Genehmigung erteilt, Rechnung nie verschickt.
insert into public.invoices
  (id, project_id, label, amount_cents, trigger_step_key, status, due_on, sent_on, paid_on)
values
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'Abschlag Genehmigungsplanung', 1000000, 'baugenehmigung', 'faellig', '2026-08-28', null, null),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001',
   'Abschlag Vorplanung', 350000, 'vertrag_zurueck', 'bezahlt', '2026-02-17', '2026-02-10', '2026-02-24'),
  ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000004',
   'Bauvoranfrage pauschal', 180000, 'vertrag_zurueck', 'versendet', '2026-04-01', '2026-03-20', null);
