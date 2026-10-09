-- ABM Projekt-App: übergeordnete Stufen für die Pipeline und kürzere Schrittnamen.
-- Stufen fassen die Phasen zusammen (Board passt auf eine Bildschirmbreite); die genaue Phase bleibt erhalten.
-- Kürzere Namen, damit der Prozess-Stepper kein Wort trennen muss. Keys bleiben unverändert (Warnlogik, Importer).

alter table public.step_definitions add column stage text;

update public.step_definitions set stage = 'Anbahnung'
  where key in ('plangespraech', 'vertrag_versendet', 'vertrag_zurueck');
update public.step_definitions set stage = 'Planung'
  where key in ('vermesser_beauftragt', 'entwurf_freigegeben', 'vorabzug_versendet');
update public.step_definitions set stage = 'Genehmigung'
  where key in ('baugesuch_uebergabe', 'baugenehmigung', 'baufreigabe');
update public.step_definitions set stage = 'Baubegleitung'
  where key in ('bauanlaufgespraech', 'hausanschluesse_beantragt', 'hausaufstellung');

alter table public.step_definitions alter column stage set not null;
alter table public.step_definitions alter column stage set default 'Planung';

update public.step_definitions set label = 'Vertrag versendet'    where key = 'vertrag_versendet';
update public.step_definitions set label = 'Vertrag zurück'       where key = 'vertrag_zurueck';
update public.step_definitions set label = 'Genehmigung'          where key = 'baugenehmigung';
update public.step_definitions set label = 'Anschlüsse beantragt' where key = 'hausanschluesse_beantragt';
