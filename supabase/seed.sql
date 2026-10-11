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
  ('b0000000-0000-4000-8000-000000000001', 'Familie Reinhardt', 'Lindenweg 12, 89073 Ulm', '0731 000000', 'reinhardt@example.com', 'Erfundener Datensatz'),
  ('b0000000-0000-4000-8000-000000000002', 'Familie Engelhardt', 'Gartenweg 5, 70173 Stuttgart', '0711 000000', 'engelhardt@example.com', 'Erfundener Datensatz');

insert into public.projects
  (id, abm_nr, kind, status, company_id, salesperson_id, bauherr_id, bauherr_label, location,
   architect_id, planer_id, baubetreuung, intake_month)
values
  ('a0000000-0000-4000-8000-000000000001', '8161-9001', 'neubau', 'aktiv',
   'c0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'Reinhardt', 'Ulm', '70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000003', '3.1+3.2', '2026-01-01'),
  ('a0000000-0000-4000-8000-000000000002', '8260-9001', 'neubau', 'aktiv',
   'c0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002',
   'Engelhardt', 'Ingolstadt', '70000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000004', null, '2026-02-01'),
  ('a0000000-0000-4000-8000-000000000003', '8185-9001', 'neubau', 'aktiv',
   'c0000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000004', null,
   'Scholz', 'Ehningen', '70000000-0000-4000-8000-000000000002', null, null, '2026-03-01'),
  ('a0000000-0000-4000-8000-000000000004', 'Bauvoranfrage', 'bauvoranfrage', 'aktiv',
   null, null, null, 'Winter', 'Ulm', '70000000-0000-4000-8000-000000000001', null, null, '2026-03-01'),
  ('a0000000-0000-4000-8000-000000000005', '8161-9002', 'neubau', 'storno',
   'c0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', null,
   'Fuchs', 'Tübingen', '70000000-0000-4000-8000-000000000001', null, null, '2026-04-01');

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

-- ---------------------------------------------------------------------------
-- Ergänzungen für Migration 0002 (ebenfalls erfunden)
-- ---------------------------------------------------------------------------
update public.projects set hausbau_nr = 'HB-26118' where id = 'a0000000-0000-4000-8000-000000000001';
update public.projects set hausbau_nr = 'HB-26204' where id = 'a0000000-0000-4000-8000-000000000002';

insert into public.project_parties (project_id, role, name, contact) values
  ('a0000000-0000-4000-8000-000000000001', 'vermesser', 'Vermessungsbüro Albrecht & Partner', 'vermessung@example.com'),
  ('a0000000-0000-4000-8000-000000000001', 'strom',     'Stromnetz Alb-Donau', null),
  ('a0000000-0000-4000-8000-000000000002', 'vermesser', 'Vermessung Donautal', null);

insert into public.documents (id, project_id, name, storage_path, kind, size_bytes, folder_path, source, received_on, mime) values
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Baugenehmigung.pdf',
   'a0000000-0000-4000-8000-000000000001/09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige/01 Baugenehmigung/01 erhalten am 14.08.2026/2026-08-14_Baugenehmigung.pdf',
   'pdf', 412000, '09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige/01 Baugenehmigung/01 erhalten am 14.08.2026', 'agent', '2026-08-14', 'application/pdf');

insert into public.tasks (id, project_id, title, due_on, assignee_id, status, source, source_key) values
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Rechnung Genehmigungsplanung versenden',
   '2026-10-09', '70000000-0000-4000-8000-000000000001', 'offen', 'warnung', 'invoice_unsent:e0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000002', null, 'Team-Besprechung Projektliste', '2026-10-14', null, 'offen', 'manuell', null);

insert into public.activities (project_id, kind, text, actor, at) values
  ('a0000000-0000-4000-8000-000000000001', 'schritt', 'Baugenehmigung erledigt', 'Architekt BE', '2026-08-14 10:00+02');

insert into public.mailboxes (id, label, address, provider, status, secret_ref) values
  ('ab000000-0000-4000-8000-000000000001', 'Sammelpostfach', 'info@abm-demo.example', 'demo', 'verbunden', 'vault:mailbox_info');

insert into public.inbox_items (id, mailbox_id, message_id, received_at, from_name, from_email, subject, body_excerpt, status, project_id, confidence, reason) values
  ('10000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', '<seed-1@abm-demo.example>', '2026-08-14 09:12+02',
   'Stadt Ulm Baurecht', 'baurecht@stadt-demo.example', 'Baugenehmigung 8161-9001', 'Anbei der Bescheid.', 'abgelegt',
   'a0000000-0000-4000-8000-000000000001', 0.98, 'ABM-Nr. 8161-9001 im Betreff');

insert into public.inbox_attachments (id, item_id, file_name, mime, size_bytes, project_id, folder_path, confidence, status, document_id) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Baugenehmigung.pdf', 'application/pdf', 412000,
   'a0000000-0000-4000-8000-000000000001', '09 Baugenehmigung, Baufreigabe,Baubeginnsanzeige/01 Baugenehmigung/01 erhalten am 14.08.2026',
   0.98, 'abgelegt', 'd0000000-0000-4000-8000-000000000001');

update public.documents set source_item_id = '20000000-0000-4000-8000-000000000001' where id = 'd0000000-0000-4000-8000-000000000001';

insert into public.agent_runs (mailbox_id, started_at, finished_at, fetched, filed) values
  ('ab000000-0000-4000-8000-000000000001', '2026-08-14 09:15+02', '2026-08-14 09:15:06+02', 1, 1);

insert into public.agent_rules (kind, match, folder_path) values
  ('ignorieren', '@newsletter.baustoffe.example', null),
  ('absender_ordner', 'eingang@lra-demo.example', '08 Bauantrag/05 Eingangsbestätigung/01 Eingangsbestätigung');

-- Ein Anhang, den der Agent nicht sicher zuordnen konnte (Prüfliste)
insert into public.inbox_items (id, mailbox_id, message_id, received_at, from_name, from_email, subject, body_excerpt, status, project_id, confidence, reason) values
  ('10000000-0000-4000-8000-000000000002', 'ab000000-0000-4000-8000-000000000001', '<seed-2@abm-demo.example>', '2026-10-08 11:40+02',
   'Vermessung Donautal', 'buero@vermessung-donautal.example', 'Höhenaufnahme Engelhardt', 'Anbei die Höhenaufnahme.', 'pruefen',
   'a0000000-0000-4000-8000-000000000002', 0.72, 'Bauherr Engelhardt im Betreff, Ordner unsicher');

insert into public.inbox_attachments (id, item_id, file_name, mime, size_bytes, project_id, folder_path, confidence, status) values
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Hoehenaufnahme.pdf', 'application/pdf', 230000,
   'a0000000-0000-4000-8000-000000000002', '04 Vermesser/02 Vermesserunterlagen erhalten am 08.10.2026', 0.72, 'pruefen');
