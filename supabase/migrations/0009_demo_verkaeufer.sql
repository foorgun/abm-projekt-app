-- ABM Projekt-App: Demo-Kennzeichen auch für Verkäufer.
-- Die Demo-Daten hängen ihre erfundenen Verkäufer an die echten Hausbaufirmen (0007). Ohne eigenes Kennzeichen
-- blieben sie beim Löschen der Demo-Daten zurück. Die App kann das Kennzeichen nicht setzen (Spaltenrecht aus 0007:
-- nur company_id und name).
alter table public.salespeople add column is_demo boolean not null default false;
