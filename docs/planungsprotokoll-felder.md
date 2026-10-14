# Planungsprotokoll: Feld-Inventar der Vorlagen

Erzeugt mit `node scripts/planungsprotokoll/felder.mjs && node scripts/planungsprotokoll/bericht.mjs`
aus den AcroForm-PDFs in `vorlagen/planungsprotokoll/` (nicht im Repo). Maschinenlesbar je Widget:
`docs/planungsprotokoll/<vorlage>.json`. Feldwerte der Vorlagen werden nicht gelesen.

- **Beschriftung**: nächstgelegenes Textstück (Textfeld: links, sonst darüber; Ankreuzfeld: rechts). Heuristik,
  bei dicht gesetzten Zeilen gelegentlich das Nachbarwort.
- **Gruppe**: Radio-Gruppe (gemeinsamer Feldname) bzw. bei Einzel-Checkboxen die Zeile, auf der mehrere stehen.
- **Klasse**: vorbefüllbar (aus Projekt/Kontakt), manuell (Eingabe je Projekt), ankreuzen (Entscheidung).
- **Modell**: ja = Datenfeld vorhanden, teilweise = vorhanden, aber anders geschnitten, fehlt = nicht im Datenmodell.
- **Position**: x/y in pt, Ursprung unten links (A4 = 595 × 842 pt), erstes Widget.

## Schwabenhaus: SH-Planungs-Dokumentation (Stand 2026-04)

38 Seiten, 378 Felder (646 Widgets): 177 Text, 78 Radio, 119 Checkbox, 4 Button. Vorbefüllbar 68 (davon im Modell: ja 9, teilweise 14, fehlt 45), manuell 113, ankreuzen 197.


### 0. Kopfdaten und Projektbeteiligte

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 1, 29, 37 | BV-Nr | Text | 177/741 |  | Schwabenhaus BV-Nr.: / Projekt-Nr. |  | vorbefüllbar | Projekt-/BV-Nr. der Hausbaufirma: projects.hausbau_nr (offene Frage: dieselbe Nummer?) | ja |
| 1, 29, 37 | BauherrName | Text | 142/699 |  | Name: / Bauherren |  | vorbefüllbar | Bauherr Name: bauherren.name (+ name2), sonst projects.bauherr_label | ja |
| 1 | BauherrStraße | Text | 142/684 |  | Straße: |  | vorbefüllbar | Bauherr Straße: Teil von bauherren.address (eine Zeile, wird aufgeteilt) | teilweise |
| 1 | BauherrOrt | Text | 331/684 |  | Ort: |  | vorbefüllbar | Bauherr PLZ/Ort: Teil von bauherren.address | teilweise |
| 1 | BauherrMail | Text | 331/670 |  | E-Mail: |  | vorbefüllbar | Bauherr E-Mail: bauherren.email | ja |
| 1 | BauherrMobil | Text | 142/669 |  | Mobil: |  | vorbefüllbar | Bauherr Mobil: bauherren.phone (Telefon und Mobil nicht getrennt) | teilweise |
| 1 | BauortStr | Text | 377/627 |  | Straße/Baugebiet |  | vorbefüllbar | Bauort Straße/Baugebiet: Teil von bauherren.building_address | teilweise |
| 1, 29 | BauortPLZ | Text | 142/626 |  | PLZ/Ort: / Bauort |  | vorbefüllbar | Bauort PLZ/Ort: PLZ aus bauherren.building_address, Ort aus projects.location | teilweise |
| 1, 29 | BauortOrtsteil | Text | 377/612 |  | Gemeindeteil: / Ortsteil |  | vorbefüllbar | Gemeindeteil/Ortsteil: fehlt | fehlt |
| 1 | BauortGemarkung | Text | 142/611 |  | Gemarkung: |  | vorbefüllbar | Gemarkung: projects.gemarkung | ja |
| 1 | BauortFlurstück | Text | 142/595 |  | Flur/Flurstück |  | vorbefüllbar | Flur/Flurstück: projects.flurstueck (Flur nicht getrennt) | teilweise |
| 1 | BauortBundesland | Text | 377/595 |  | Bundesland: |  | vorbefüllbar | Bundesland: fehlt (Annahme Baden-Württemberg, besser aus der PLZ) | fehlt |
| 1 | ArchitektName | Text | 142/541 |  | Name/Anschrift: |  | vorbefüllbar | Architekt: team_members.name (über projects.architect_id) | ja |
| 1 | ArchitektTel | Text | 142/527 |  | Tel.: |  | vorbefüllbar | Architekt Telefon: Bürodaten ABM (nicht im Modell) | fehlt |
| 1 | ArchitektMobil | Text | 142/514 |  | Mobil: |  | vorbefüllbar | Architekt Mobil: Bürodaten ABM (nicht im Modell) | fehlt |
| 1 | ArchitektMail | Text | 142/500 |  | E-Mail: |  | vorbefüllbar | Architekt E-Mail: Bürodaten ABM (nicht im Modell) | fehlt |
| 1 | VermesserName | Text | 142/448 |  | Name/Anschrift: |  | vorbefüllbar | Vermessungsbüro: project_parties[vermesser].name | ja |
| 1 | VermesserTel | Text | 142/433 |  | Tel.: |  | vorbefüllbar | Vermessungsbüro Telefon: project_parties[vermesser].contact (eine Zeile) | teilweise |
| 1 | VermesserMail | Text | 340/433 |  | E-Mail: |  | vorbefüllbar | Vermessungsbüro E-Mail: project_parties[vermesser].contact (eine Zeile) | teilweise |
| 1 | VermesserMobil | Text | 142/420 |  | Mobil: |  | vorbefüllbar | Vermessungsbüro Mobil: project_parties[vermesser].contact (eine Zeile) | fehlt |
| 1 | BGGutachterName | Text | 142/366 |  | Name/Anschrift: |  | vorbefüllbar | Baugrundgutachter: Rolle fehlt | fehlt |
| 1 | BGGutachterTel | Text | 142/351 |  | Tel.: |  | vorbefüllbar | Baugrundgutachter Telefon: Rolle fehlt | fehlt |
| 1 | BGGutachterMail | Text | 368/351 |  | E-Mail: |  | vorbefüllbar | Baugrundgutachter E-Mail: Rolle fehlt | fehlt |
| 1 | BGGutachterMobil | Text | 142/338 |  | Mobil: |  | vorbefüllbar | Baugrundgutachter Mobil: Rolle fehlt | fehlt |
| 1 | ErdbauName | Text | 141/283 |  | Name/Anschrift: |  | vorbefüllbar | Erdbau-Unternehmen: project_parties[erdbauer].name | ja |
| 1 | ErdbauTel | Text | 141/268 |  | Tel.: |  | vorbefüllbar | Erdbau-Unternehmen Telefon: project_parties[erdbauer].contact (eine Zeile) | teilweise |
| 1 | ErdbauMail | Text | 340/268 |  | E-Mail: |  | vorbefüllbar | Erdbau-Unternehmen E-Mail: project_parties[erdbauer].contact (eine Zeile) | teilweise |
| 1 | ErdbauMobil | Text | 141/254 |  | Mobil: |  | vorbefüllbar | Erdbau-Unternehmen Mobil: project_parties[erdbauer].contact (eine Zeile) | fehlt |
| 1 | KellerName | Text | 140/200 |  | Name/Anschrift: |  | vorbefüllbar | Kellerbauer/Bodenplatte: Rolle fehlt (Altspalte bauherren.basement_builder ungenutzt) | fehlt |
| 1 | KellerTel | Text | 140/185 |  | Tel.: |  | vorbefüllbar | Kellerbauer/Bodenplatte Telefon: Rolle fehlt | fehlt |
| 1 | KellerMail | Text | 340/185 |  | E-Mail: |  | vorbefüllbar | Kellerbauer/Bodenplatte E-Mail: Rolle fehlt | fehlt |
| 1 | KellerMobil | Text | 140/172 |  | Mobil: |  | vorbefüllbar | Kellerbauer/Bodenplatte Mobil: Rolle fehlt | fehlt |
| 1 | Gemeinde | Text | 142/118 |  | Genehmigungsbehörde |  | vorbefüllbar | Genehmigungsbehörde (Gemeinde): Rolle fehlt | fehlt |
| 1 | Bauamt | Text | 340/118 |  | Bauaufsicht: |  | vorbefüllbar | Bauaufsicht/Bauamt: Rolle fehlt | fehlt |
| 1 | GemeindeTel | Text | 142/102 |  | Tel.: |  | vorbefüllbar | Genehmigungsbehörde (Gemeinde) Telefon: Rolle fehlt | fehlt |
| 1 | BauamtTel | Text | 340/102 |  | Tel.: |  | vorbefüllbar | Bauaufsicht/Bauamt Telefon: Rolle fehlt | fehlt |
| 1 | GemeindeMail | Text | 142/87 |  | E-Mail: |  | vorbefüllbar | Genehmigungsbehörde (Gemeinde) E-Mail: Rolle fehlt | fehlt |
| 1 | BauamtMail | Text | 340/87 |  | E-Mail: |  | vorbefüllbar | Bauaufsicht/Bauamt E-Mail: Rolle fehlt | fehlt |
| 1 | BauamtFax | Text | 340/72 |  | Fax: |  | vorbefüllbar | Bauaufsicht/Bauamt Fax: Rolle fehlt | fehlt |
| 1 | GemeindeFax | Text | 142/71 |  | Fax: |  | vorbefüllbar | Genehmigungsbehörde (Gemeinde) Fax: Rolle fehlt | fehlt |
| 2 | StromName | Text | 144/715 |  | Name/Anschrift: |  | vorbefüllbar | Versorger Strom: project_parties[strom].name | ja |
| 2 | StromAnschrift | Text | 302/715 |  | Name/Anschrift: |  | vorbefüllbar | Versorger Strom Anschrift: project_parties[strom].contact (eine Zeile) | fehlt |
| 2 | StromTel | Text | 144/699 |  | Tel.: |  | vorbefüllbar | Versorger Strom Telefon: project_parties[strom].contact (eine Zeile) | teilweise |
| 2 | StromMail | Text | 337/699 |  | E-Mail: |  | vorbefüllbar | Versorger Strom E-Mail: project_parties[strom].contact (eine Zeile) | teilweise |
| 2 | WasserName | Text | 144/646 |  | Name/Anschrift: |  | vorbefüllbar | Versorger Wasser: project_parties[wasser].name | ja |
| 2 | WasserAnschrift | Text | 303/646 |  | Name/Anschrift: |  | vorbefüllbar | Versorger Wasser Anschrift: project_parties[wasser].contact (eine Zeile) | fehlt |
| 2 | WasserTel | Text | 143/630 |  | Tel.: |  | vorbefüllbar | Versorger Wasser Telefon: project_parties[wasser].contact (eine Zeile) | teilweise |
| 2 | WasserMail | Text | 337/630 |  | E-Mail: |  | vorbefüllbar | Versorger Wasser E-Mail: project_parties[wasser].contact (eine Zeile) | teilweise |
| 2 | AbwasserName | Text | 144/569 |  | Name/Anschrift: |  | vorbefüllbar | Abwasser: Rolle fehlt | fehlt |
| 2 | AbwasserAnschrift | Text | 303/569 |  | Name/Anschrift: |  | vorbefüllbar | Abwasser Anschrift: Rolle fehlt | fehlt |
| 2 | AbwasserTel | Text | 144/554 |  | Tel.: |  | vorbefüllbar | Abwasser Telefon: Rolle fehlt | fehlt |
| 2 | AbwasserMail | Text | 337/554 |  | E-Mail: |  | vorbefüllbar | Abwasser E-Mail: Rolle fehlt | fehlt |
| 2 | SchornsteinName | Text | 143/500 |  | Name/Anschrift: |  | vorbefüllbar | Schornsteinfeger: Rolle fehlt | fehlt |
| 2 | SchornsteinAnschrift | Text | 302/500 |  | Name/Anschrift: |  | vorbefüllbar | Schornsteinfeger Anschrift: Rolle fehlt | fehlt |
| 2 | SchornsteinTel | Text | 143/470 |  | Mobil: |  | vorbefüllbar | Schornsteinfeger Telefon: Rolle fehlt | fehlt |
| 2 | SchornsteinMail | Text | 337/470 |  | E-Mail: |  | vorbefüllbar | Schornsteinfeger E-Mail: Rolle fehlt | fehlt |
| 2 | GasName | Text | 143/417 |  | Name/Anschrift: |  | vorbefüllbar | Versorger Gas: Rolle fehlt | fehlt |
| 2 | GasAnschrift | Text | 302/417 |  | Name/Anschrift: |  | vorbefüllbar | Versorger Gas Anschrift: Rolle fehlt | fehlt |
| 2 | GasMail | Text | 337/400 |  | E-Mai: |  | vorbefüllbar | Versorger Gas E-Mail: Rolle fehlt | fehlt |
| 2 | GasTel | Text | 143/399 |  | Tel.: |  | vorbefüllbar | Versorger Gas Telefon: Rolle fehlt | fehlt |
| 2 | FernwärmeName | Text | 143/349 |  | Name/Anschrift: |  | vorbefüllbar | Versorger Fernwärme: Rolle fehlt | fehlt |
| 2 | FernwärmeAnschrift | Text | 302/349 |  | Name/Anschrift: |  | vorbefüllbar | Versorger Fernwärme Anschrift: Rolle fehlt | fehlt |
| 2 | FernwärmeMail | Text | 337/332 |  | E-Mail: |  | vorbefüllbar | Versorger Fernwärme E-Mail: Rolle fehlt | fehlt |
| 2 | FernwärmeTel | Text | 143/331 |  | Tel.: |  | vorbefüllbar | Versorger Fernwärme Telefon: Rolle fehlt | fehlt |
| 2 | SonstigeName | Text | 143/282 |  | Name/Anschrift: |  | vorbefüllbar | Sonstige Beteiligte: Rolle fehlt | fehlt |
| 2 | SonstigeAnschrift | Text | 302/282 |  | Name/Anschrift: |  | vorbefüllbar | Sonstige Beteiligte Anschrift: Rolle fehlt | fehlt |
| 2 | SonstigeTel | Text | 143/264 |  | Tel.: |  | vorbefüllbar | Sonstige Beteiligte Telefon: Rolle fehlt | fehlt |
| 2 | SonstigeMail | Text | 337/264 |  | E-Mail: |  | vorbefüllbar | Sonstige Beteiligte E-Mail: Rolle fehlt | fehlt |

### 1. Allgemeine Angaben zum Baugrundstück

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 3 | undefined.Text2 | Text | 181/730 |  | Allgemeine Angaben zum Baugrundstück |  | manuell |  |  |
| 3 | SLZ | Radio | 252/711 | SLZ | 1 / 1a / 2 / 2a | 0, 5, Choice1, 1, 6, Choice2, 2, 7, Choice3, 3, 8, Choice4, 4, 9, Choice5 | ankreuzen |  |  |
| 3 | undefined.Text3 | Text | 190/675 |  | ja, im Bereich: |  | manuell |  |  |
| 3 | Schneefang | Radio | 118/673 | Schneefang | ja, im Bereich: / Nein | 0, 2, Choice6, 1, 3, Choice7 | ankreuzen |  |  |
| 3 | Erdbebenzone | Radio | 247/636 | Erdbebenzone | 0 / 1 / 2 / 3 | 0, 4, Choice1, 1, 5, Choice2, 2, 6, Choice3, 3, 7, Choice4 | ankreuzen |  |  |
| 3 | Radon | Radio | 449/616 | Radon | ja / nein | 0, 2, 4, 1, 3, 5 | ankreuzen |  |  |
| 3 | Group5 | Radio | 118/550 | Group5 | Genehmigungsverfahren: / Bauanzeige/Kenntnisgabe-/Baufreistellungsverfahren / Dachform / Dachüberstand Ortgang: | 0, 6, Choice8, 1, 7, Choice9, 2, 8, Choice10, 3, 9, Choice16, 4, 10, Choice26, 5, 11, Choice27 | ankreuzen |  |  |
| 3 | undefined.Text4 | Text | 130/467 |  | Bauanzeige/Kenntnisgabe-/Baufreistellungsverfahren mit Befreiungen / Abweichungen |  | manuell |  |  |
| 3 | B-Plan | Radio | 118/451 | B-Plan |  | 0, 1, Choice11 | ankreuzen |  |  |
| 3 | Schallschutz | Radio | 118/390 | Schallschutz | Schallschutz Auflagen seitens B-Plan | 0, 1, Choice12 | ankreuzen |  |  |
| 3 | undefined.DachfarbeZul | Checkbox | 342/389 | undefined.DachfarbeZul | Dachfarbe: | Yes | ankreuzen |  |  |
| 3 | undefined.Dachfarbe | Text | 412/388 |  | Schallschutz Auflagen seitens B-Plan |  | manuell |  |  |
| 3 | undefined.SchallschutzText | Text | 139/377 |  | Schallschutz Auflagen seitens B-Plan |  | manuell |  |  |
| 3 | Brandschutz | Radio | 118/361 | Brandschutz | Brandschutz Auflagen seitens B-Plan | 0, 1, Choice13 | ankreuzen |  |  |
| 3 | undefined.Dacheindeckung | Checkbox | 342/361 | undefined.Dacheindeckung | Dacheindeckung: | Yes | ankreuzen |  |  |
| 3 | undefined.DacheindeckungText | Text | 434/360 |  | Brandschutz Auflagen seitens B-Plan |  | manuell |  |  |
| 3 | undefined.Brandschutz_Text | Text | 139/349 |  | Brandschutz Auflagen seitens B-Plan |  | manuell |  |  |
| 3 | Denkmalschutz | Radio | 118/331 | Denkmalschutz | Denkmalschutz Auflagen | 0, 1, Choice14 | ankreuzen |  |  |
| 3 | FirsthöheZul | Radio | 341/331 | FirsthöheZul | zul. Firsthöhe: | 0, 1, Choice19 | ankreuzen |  |  |
| 3 | undefined.Firsthöhe | Text | 427/330 |  | Denkmalschutz Auflagen |  | manuell |  |  |
| 3 | Wasserschutz | Radio | 118/312 | Wasserschutz | Wasserschutzgebiet, Auflagen: | 0, 1, Choice15 | ankreuzen |  |  |
| 3 | TraufhöheZul | Radio | 341/312 | TraufhöheZul | zul. Traufhöhe: | 0, 1, Choice20 | ankreuzen |  |  |
| 3 | undefined.Traufhöhe | Text | 423/310 |  | Wasserschutzgebiet, Auflagen: |  | manuell |  |  |
| 3 | KSLBO | Radio | 341/292 | KSLBO | zul. Kniestockhöhe nach LBO: | 0, 1, Choice21 | ankreuzen |  |  |
| 3 | undefined.Kniestock_LBO | Text | 485/290 |  | zul. Kniestockhöhe nach LBO: |  | manuell |  |  |
| 3 | WasserschutzgebietAuflagen | Text | 140/283 |  | Wasserschutzgebiet, Auflagen: |  | manuell |  |  |
| 3 | undefined.Kniestock_LKI | Text | 491/269 |  | Lichtes Kniestock Innenmaß: |  | manuell |  |  |
| 3 | undefined.Dachform | Text | 179/265 |  | Dachform |  | manuell |  |  |
| 3 | undefined.Dachneigung | Text | 196/243 |  | Dachform |  | manuell |  |  |
| 3 | FassadenFarbe | Radio | 341/243 | FassadenFarbe | Fassadengestaltung/Farbe: | 0, 1, Choice24 | ankreuzen |  |  |
| 3 | undefined.Fassadengestaltung | Text | 475/241 |  | Dachneigung: |  | manuell |  |  |
| 3 | undefined.Ortgang | Text | 236/218 |  | Dachneigung: |  | manuell |  |  |
| 3 | DÜ_Ortgang | Radio | 118/216 | DÜ_Ortgang | Dachüberstand Ortgang: | 0, 1, Choice30 | ankreuzen |  |  |
| 3 | Sonstige1Zul | Radio | 341/216 | Sonstige1Zul | Sonstige Vorgaben: | 0, 1, Choice25 | ankreuzen |  |  |
| 3 | undefined.Sonstige1 | Text | 443/216 |  | Dachüberstand Ortgang: |  | manuell |  |  |
| 3 | DÜ_Traufe | Radio | 118/198 | DÜ_Traufe | Dachüberstand Traufe: | 0, 1, Choice29 | ankreuzen |  |  |
| 3 | undefined.Traufe | Text | 236/198 |  | Dachüberstand Traufe: |  | manuell |  |  |
| 3 | undefined.Sonstige2 | Text | 368/198 |  | Dachüberstand Traufe: |  | manuell |  |  |
| 4 | AbmessungenAuswahl | Radio | 349/742 | AbmessungenAuswahl | Abmessungen und Berechnungen / Abmessungen und Berechnungen wie | gemAnlage, Manuell | ankreuzen |  |  |
| 4 | Länge | Text | 212/685 |  | Außenmaß Länge x Breite: |  | manuell |  |  |
| 4 | Breite | Text | 282/685 |  | Außenmaß Länge x Breite: |  | manuell |  |  |
| 4 | BebauteFläche | Text | 212/663 |  | Bebaute Fläche: |  | manuell |  |  |
| 4 | GFZ | Text | 212/643 |  | GFZ (Geschossflächenzahl): |  | manuell |  |  |
| 4 | GRZ | Text | 212/624 |  | GRZ (Grundflächenzahl): |  | manuell |  |  |
| 4 | BRIKG | Text | 212/591 |  | BP/KG: |  | manuell |  |  |
| 4 | BRIEG | Text | 212/571 |  | EG: |  | manuell |  |  |
| 4 | BRIOG | Text | 212/551 |  | OG 1 bzw. DG: |  | manuell |  |  |
| 4 | BRIDG | Text | 212/531 |  | OG 2 bzw. DG: |  | manuell |  |  |
| 4 | BRISumme | Text | 212/509 |  | Summe |  | manuell |  |  |
| 4 | Image1 | Button | 348/498 |  | m³: |  | manuell | Bildfeld (Foto/Plan einfügen) |  |
| 4 | BGFKG | Text | 212/445 |  | BP/KG: |  | manuell |  |  |
| 4 | BGFEG | Text | 212/424 |  | EG: |  | manuell |  |  |
| 4 | BGFOG | Text | 212/403 |  | OG 1 bzw. DG: |  | manuell |  |  |
| 4 | BGFDG | Text | 212/382 |  | OG 2 bzw. DG: |  | manuell |  |  |
| 4 | BGFSumme | Text | 212/361 |  | Summe |  | manuell |  |  |
| 4 | Image2 | Button | 348/352 |  | m² |  | manuell | Bildfeld (Foto/Plan einfügen) |  |
| 4 | NRFKG | Text | 212/298 |  | BP/KG: |  | manuell |  |  |
| 4 | NRFEG | Text | 212/277 |  | EG: |  | manuell |  |  |
| 4 | NRFOG | Text | 212/255 |  | OG 1 bzw. DG: |  | manuell |  |  |
| 4 | NRFDG | Text | 212/234 |  | OG 2 bzw. DG: |  | manuell |  |  |
| 4 | NRFSumme | Text | 212/213 |  | Summe |  | manuell |  |  |
| 4 | Image3 | Button | 348/208 |  | m² |  | manuell | Bildfeld (Foto/Plan einfügen) |  |
| 4 | WFlKG | Text | 212/150 |  | BP/KG: |  | manuell |  |  |
| 4 | WFlEG | Text | 212/129 |  | EG: |  | manuell |  |  |
| 4 | WFlOG | Text | 212/107 |  | OG 1 bzw. DG: |  | manuell |  |  |
| 4 | WFlDG | Text | 212/86 |  | OG 2 bzw. DG: |  | manuell |  |  |
| 4 | WFlSumme | Text | 212/65 |  | Summe |  | manuell |  |  |
| 4 | Image4 | Button | 348/63 |  | m² |  | manuell | Bildfeld (Foto/Plan einfügen) |  |
| 5, 37 | Hausart | Radio | 72/722 | Hausart | Einfamilienhaus / Zweifamilienhaus (auch Einfamilienhaus mit Einliegerwohnung) / Mehr als 2 Nutzungseinheiten ( Nutzungseinheiten) | EFH, ZFH, Mehrfamilienhaus | ankreuzen |  |  |
| 5, 37 | ELW_Größe | Radio | 92/682 | ELW_Größe | ELW kleiner 50 m² / ELW ab 50 m² / Zweifamilienhaus | Choice1, Choice2 | ankreuzen |  |  |
| 5 | Eigennutzung | Radio | 92/669 | Eigennutzung | Eigennutzung von mind. einer Wohneinheit / Fremdnutzung beider Wohneinheiten | Choice3, Choice4 | ankreuzen |  |  |
| 5 | NutzungseinheitenAnzahl | Text | 221/636 |  |  |  | manuell |  |  |
| 5 | Gebäudeklasse | Radio | 232/597 | Gebäudeklasse | 3 / 1 / 2 | Sonstige, Klasse1, Klasse2, Klasse3 | ankreuzen |  |  |
| 5 | GebäudeklasseSonstige | Text | 246/596 |  | 3 |  | manuell |  |  |
| 5 | RettungswegHöhe | Radio | 376/575 | RettungswegHöhe | geringe Höhe ( < 8 m) / mittlere Höhe ( > 8 m < 22 m) | bis7m, 7bis12m, Sonstige | ankreuzen |  |  |
| 5 | Höhe7 | Text | 460/574 |  | Festgelegte Geländeoberfläche bis Oberkante Brüstung 2. Rettungsweg |  | manuell |  |  |
| 5 | Höhe7bis | Text | 461/555 |  | geringe Höhe ( < 8 m) |  | manuell |  |  |
| 5 | Höhebis12 | Text | 487/555 |  | geringe Höhe ( < 8 m) |  | manuell |  |  |
| 5 | RettungswegSonstige | Text | 392/535 |  | mittlere Höhe ( > 8 m < 22 m) |  | manuell |  |  |
| 5 | Grenzbebauung | Radio | 72/513 | Grenzbebauung | Freistehendes Gebäude im Baufenster / Freistehendes Gebäude mit Grenzbebauung (ohne Nachbarbeba / Doppelhaushälfte | Frei, FreiGrenze, DHHdeckungsgleich, DHH | ankreuzen |  |  |
| 5 | DHH | Radio | 90/445 | DHH | Anbau an Bestand / deckungsgleich / nicht deckungsgleich / freistehend | DHHAnbau, deckungsgleich, nichtDeckungsgleich, DHHfreistehend | ankreuzen |  |  |
| 5 | GEG-Standard | Radio | 72/299 | GEG-Standard | E / Effizienzhaus 40 K / Effizienzhaus 40 KFN mit QNG | Eff55, Eff40EE, NH, Eff40+ | ankreuzen |  |  |
| 5 | Zielvereinbarung | Checkbox | 92/225 |  | Zielvereinbarungen und Angaben aus Beratungsgespräch eingehalten | Yes | ankreuzen |  |  |
| 5 | NH-Konzept | Checkbox | 92/213 |  | Nachhaltigkeitskonzept - Projektierung seitens Schwabenhaus erforderlich | Yes | ankreuzen |  |  |
| 5 | Gründung | Radio | 72/192 | Gründung | Bodenplatte von Schwabenhaus (gem. BLB im Hauspreis enthalten) / Bodenplatte bauherrenseitig / Fertigteilkeller von Schwabenhaus / Fertigteilkeller bauherrenseitig | BP_SH, BP_bauseitig, KE_SH, KE_bauseitig, TKE_SH, TKE_bauseitig, KE_MW | ankreuzen |  |  |
| 5 | GründungBesonderheitenText | Text | 156/74 |  | Mauerwerkskeller bauherrenseitig |  | manuell |  |  |
| 5 | GründungBesonderheiten | Checkbox | 72/73 |  | Besonderheiten | Yes | ankreuzen |  |  |
| 6 | Barrierefreiheit | Radio | 72/674 | Barrierefreiheit | Keine Anforderungen an die Barrierefreiheit / Schwellenreduzierte Zugänge / Barrierefreiheit gemäß QNG (nach BiRN) | KeineAnforderung, Schwellenreduzierung, GemDIN | ankreuzen |  |  |
| 6 | BarrierefreiheitDIN | Radio | 72/592 | BarrierefreiheitDIN | Barrierefreiheit in Anlehnung an DIN 18040-2 | GemDIN | ankreuzen |  |  |
| 6 | Rollstuhlgeeignet | Checkbox | 72/542 |  | Reichweiten, Reichhöhen, Beinfreiraum sind für ein Familienmitglied im Rollstuhl ausgelegt | Yes | ankreuzen |  |  |
| 6 | BewegungsflächenEingänge | Checkbox | 72/484 |  | Alle Haupteingänge sind stufen | Yes | ankreuzen |  |  |
| 6 | Eben | Checkbox | 72/449 |  | Alle Ebenen des Gebäudes sind stufen | Yes | ankreuzen |  |  |
| 6 | Treppenlauf | Checkbox | 72/401 |  | Die Treppe besitzt einen geraden Lauf und Setzstufen. | Yes | ankreuzen |  |  |
| 6 | Treppenliftgeeignet | Checkbox | 72/379 |  | Die Treppe ist ausreic | Yes | ankreuzen |  |  |
| 6 | TreppenliftgeeigneteWände | Checkbox | 72/359 |  | Die Treppenumfassungswände sind für die Nachrüstung eines Treppenliftes verstärkt / | Yes | ankreuzen |  |  |
| 6 | RollstuhlgeeigneteFlure | Checkbox | 72/324 |  | Flure sind ausreichend breit für die Nutzung mit Gehilfen und Rollstühlen. Maßgebend dafür ist | Yes | ankreuzen |  |  |
| 6 | BarrierefreieTüren | Checkbox | 72/289 |  | Alle Wohnungseingangstüren und Innentüren der barrierefreien Nutzungseinheit weisen eine | Yes | ankreuzen |  |  |
| 6 | BewegungsflächenRäume | Checkbox | 72/255 |  | In Wohn, | Yes | ankreuzen |  |  |
| 6 | BewegungsflächenSanitär | Checkbox | 72/221 |  | Die Bewegungsflächen d | Yes | ankreuzen |  |  |
| 6 | BewegungsflächenNE | Checkbox | 72/186 |  | Zu den Nutzungseinheiten zugehörige Abstellräume müssen stufen | Yes | ankreuzen |  |  |
| 6 | BewegungsflächeBalkonTerrasse | Checkbox | 72/153 |  | Balkon | Yes | ankreuzen |  |  |
| 6 | ErreichbarkeitFenster | Checkbox | 72/131 |  | Mindestens ein Fenster in de | Yes | ankreuzen |  |  |
| 6 | BehindertengerStellplatz | Checkbox | 72/96 |  | Es ist gewährleistet, dass jede barrierefreie Nutzungseinheit | Yes | ankreuzen |  |  |
| 6 | BehindertengerKlingel | Checkbox | 72/62 |  | Briefkasten und Klingel sind für einen Rollstuhlfahrer stufenlos zugänglich | Yes | ankreuzen |  |  |
| 7 | GehwegBreite | Checkbox | 72/742 |  | Gehwege müssen aus | Yes | ankreuzen |  |  |
| 7 | GehwegOberfläche | Checkbox | 72/681 |  | Zur gefahrlosen Nutzung müssen Gehwege und Erschließungsflächen | Yes | ankreuzen |  |  |
| 7 | Greifhöhen | Checkbox | 72/634 |  | Die Greifhöhe | Yes | ankreuzen |  |  |
| 7 | BehindertengerechtSonstige | Checkbox | 72/613 |  |  | Yes | ankreuzen |  |  |
| 7 | BehindertengerechtSonstigeText | Text | 87/613 |  | Die Greifhöhe |  | manuell |  |  |

### 2. Sommerlicher Wärmeschutz

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 8 | SommerlicherWärmeschutz | Radio | 71/514 | SommerlicherWärmeschutz | Diese Anforderungen sind durch den in der aktuelle / Die Anforderungen | NachweisErfüllt, NachweisDetailiert | ankreuzen |  |  |
| 8 | NachweisDetailiertText | Text | 90/447 |  | Die Anforderungen |  | manuell |  |  |

### 3. Angaben zur Trinkwasserversorgung

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 9 | Trinkwasserbereich | Radio | 72/657 | Trinkwasserbereich | Härtebereich | TWBweich, TWBmittel, TWBhart | ankreuzen |  |  |
| 9 | Enthärtungsanlage | Checkbox | 72/551 |  | Trinkwassere | Yes | ankreuzen |  |  |
| 9 | TWBSonstige | Checkbox | 72/530 |  |  | Yes | ankreuzen |  |  |
| 9 | TWBSonstigeText | Text | 90/530 |  | Trinkwassere |  | manuell |  |  |

### 4. Allgemeine und spezifische Angaben zur Entwässerung

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 10 | BWSText | Text | 197/711 |  | Allgemeine und spezifische Angaben zur Entwässerung |  | manuell |  |  |
| 10 | BWS | Checkbox | 72/710 |  | Bemessungswasserstand: [m] gemäß Baugrundgutachten | Yes | ankreuzen |  |  |
| 10 | Grundleitungen | Radio | 72/668 | Grundleitungen | Grundleitungen unter Bodenplatte / Keller-Fundamentplatte DN 100 (Standard) / Grundleitungen unter Bodenplatte / Keller-Fundamentplatte DN 150 / Grundleitungen unter Bodenplatte / Keller-Fundamentplatte DN 200 | GrundleitungDN100, GrundleitungDN150, GrundleitungDN200 | ankreuzen |  |  |
| 10 | BWSLastfall | Radio | 72/562 | BWSLastfall | Beanspruchungsklasse 1 - Bodenfeuchte / Beanspruchungsklasse 2 - Drückendes Wasser | Bodenfeuchte, DrückendesWasser | ankreuzen |  |  |
| 10 | Drainage | Checkbox | 72/541 | S. 10, Zeile „Drainage“ | Drainage | Yes | ankreuzen |  |  |
| 10 | WU-Keller | Checkbox | 284/540 | S. 10, Zeile „Drainage“ | WU-Keller erforderlich | Yes | ankreuzen |  |  |
| 10 | LichtschächteDruckwasserdicht | Checkbox | 284/519 |  | druckwasserdichte Lichtschächte erforderlich | Yes | ankreuzen |  |  |
| 10 | HebeanlageEG | Checkbox | 72/498 |  | Hebeanlage EG | Yes | ankreuzen |  |  |
| 10 | HebeanlageKG | Checkbox | 72/477 |  | Hebeanlage KG | Yes | ankreuzen |  |  |
| 10 | Rückstaupumpe | Checkbox | 72/455 |  | Rückstaupumpe | Yes | ankreuzen |  |  |
| 10 | Rückstauebene | Checkbox | 72/435 |  | Rückstauebene berücksichtigt | Yes | ankreuzen |  |  |
| 10 | Freispiegelentwässerung | Checkbox | 72/414 |  | freies Gefälle (Freispiegelentwässerung) | Yes | ankreuzen |  |  |
| 10 | EntwässKellerabgang | Checkbox | 72/350 |  | Elektroinstallation Unterputz ( | Yes | ankreuzen |  |  |
| 10 | EntwässLichthof | Checkbox | 72/329 |  | Entwässerung Kellerabgang | Yes | ankreuzen |  |  |
| 10 | ElektroUnterputz | Checkbox | 72/308 |  | Entwässerung Lichthof | Yes | ankreuzen |  |  |
| 10 | RevSchachtAußen | Checkbox | 72/286 |  | Revisionsschacht außenliegend | Yes | ankreuzen |  |  |
| 10 | Entwässerung | Radio | 72/266 | Entwässerung | Entwässerung im Mischsystem / Entwässerung im Trennsystem | Mischsystem, Trennsystem | ankreuzen |  |  |
| 10 | RückstauebeneNN | Text | 175/224 |  | Rückstauebene über NN: |  | manuell |  |  |
| 10 | RückstauebeneOFFEG | Text | 175/203 |  | Rückstauebene über NN: |  | manuell |  |  |
| 10 | RückstauebeneOFFKG | Text | 175/182 |  | Höhe über NN OFF EG: |  | manuell |  |  |
| 10 | RückstauebeneORFEG | Text | 175/161 |  | Höhe über NN OFF KG: |  | manuell |  |  |
| 10 | RückstauebeneORFKG | Text | 175/140 |  | Höhe über NN ORF EG: |  | manuell |  |  |

### 5. Sockeldetails auf Grundlage der DIN 68800-2

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 11 | SockelStandard | Checkbox | 77/442 |  | [1-1] Außenwand | Yes | ankreuzen |  |  |
| 11 | SockelHaustür | Checkbox | 77/245 |  | [1-2] Außenwand im Haustürbereich | Yes | ankreuzen |  |  |
| 12 | SockelRinne | Checkbox | 77/717 |  | [2] Sockelhöhe mindestens 7 cm und kleiner als 30 cm | Yes | ankreuzen |  |  |
| 12 | SockelAbgrabung | Checkbox | 77/467 |  | [3] Abgrabung | Yes | ankreuzen |  |  |
| 12, 13 | Sockel | Radio | 77/251 | Sockel | [3] Abgrabung / Mit Fensterbank | SockelProfilrinne, SockelRinneFensterbank | ankreuzen |  |  |
| 13 | Group2 | Radio | 77/716 | Group2 | [4] Mit bauherrenseitiger Blockstufe, Terrassentür nicht barrierefrei | Choice3 | ankreuzen |  |  |
| 13 | Austritt | Radio | 77/716 | Austritt | [4] Mit bauherrenseitiger Blockstufe, Terrassentür nicht barrierefrei / [5] Abgrabung mit barrierefreier Terrassentür (Schwelle EV1), ohne Fensterbank | Blockstufe, AbgrabungEV1 | ankreuzen |  |  |
| 13 | AustrittBlockstufe | Radio | 77/541 | AustrittBlockstufe | Ohne Fensterbank + abgeschrägte Blockstufe | BlockstufeAbgeschrägt | ankreuzen |  |  |
| 13 | AustrittAbgrabungEV1 | Radio | 78/353 | AustrittAbgrabungEV1 | Mit L-Steinen und Gitterrost / Mit Profil-Sockelrinne und Gitterrost | AbgrabungEV1GitterrostLStein, AbgrabungEV1GitterrostSockelrinne | ankreuzen |  |  |
| 14, 15, 16, 17 | Balkon | Radio | 77/715 | Balkon | [6] Abgrabung mit Terrassentür nicht barrierefrei, ohne Fensterbank / Mit L-Steinen und Gitterrost / Mit Profil-Sockelrinne und Gitterrost / [B1] Mit Standard-Balkontürbrüstung innen und außen, nicht barrierefrei, Balkonbelag im Gefälle | 0, 3, 1, 4, 5, 2, 6, 7 | ankreuzen |  |  |
| 18 | Kellerdecke | Radio | 79/719 | Kellerdecke | [K1] Kellerdeckenabsenkung im Bereich einer Terrasse auf einer Kellerdecke / [K2] Kellerdeckenabsenkung im Bereich einer barrierefreien Terrasse auf einer Kellerdecke | 2, 3 | ankreuzen |  |  |

### 6. Hausanschlüsse

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 19 | HausanschlussSatellit | Checkbox | 71/578 | S. 19, Zeile „Dachantenne bzw. Satellit“ | Dachantenne bzw. Satellit | Yes | ankreuzen |  |  |
| 19 | HausanschlussKabel | Checkbox | 319/578 | S. 19, Zeile „Dachantenne bzw. Satellit“ | Kabelanschluss | Yes | ankreuzen |  |  |
| 19 | HausanschlussDSL | Checkbox | 71/557 | S. 19, Zeile „DSL bzw. Glasfaseranschluss“ | DSL bzw. Glasfaseranschluss | Yes | ankreuzen |  |  |
| 19 | HausanschlussTelefon | Checkbox | 319/557 | S. 19, Zeile „DSL bzw. Glasfaseranschluss“ | Festnetztelefon | Yes | ankreuzen |  |  |
| 19 | Baustrom | Radio | 71/415 | Baustrom | Bereitstellung von Baustrom und Bauwasser bauherrenseitig / Bereitstellung von Baustrom und Bauwasser als Serviceleistung gegen Mehrpreis durch Schwabenhaus | Bauseits, SH-Service | ankreuzen |  |  |
| 19 | Wallbox | Checkbox | 71/258 |  | Keine Wallbox geplant | Yes | ankreuzen |  |  |
| 19 | Wallbox11kW | Text | 71/235 |  |  |  | manuell |  |  |
| 19 | Wallbox22kW | Text | 71/214 |  | __ Stück Wallbox 11 kW |  | manuell |  |  |

### 7. Montagebedingungen und Zufahrt zum Baugrundstück

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 20 | Montage | Radio | 71/430 | Montage | Die vorgenannten Montagebedingungen sind erfüllt, die vorgenannten Voraussetzungen für die Zufahrt / Es ist ein erhöhter Montageaufwand aufgrund der Baustellen- und Zufahrtsbedingungen vorhanden | MontageNormal, MontageAufwand | ankreuzen |  |  |
| 20 | Bilder | Radio | 70/364 | Bilder | Dieser Planungs-Dokumentation liegen bei: / Video zur Zufahrt | 0, 2 | ankreuzen |  |  |
| 20 | BilderGrundstück | Radio | 106/342 | BilderGrundstück | Bilder zum Grundstück | 1 | ankreuzen |  |  |
| 20 | BilderZufahrt | Radio | 247/342 | BilderZufahrt | Bilder zur Zufahrt | 1 | ankreuzen |  |  |
| 20 | Zufahrt | Checkbox | 71/293 |  | Die Zufahrt zum Grundstück ist stark eingeschränkt (z.B. durch Stromleitungen, Bäume, enge Kurven) | Yes | ankreuzen |  |  |
| 20 | ZufahrtText | Text | 94/208 |  | Die Zufahrt zum Grundstück ist stark eingeschränkt (z.B. durch Stromleitungen, Bäume, enge Kurven) |  | manuell |  |  |
| 20 | Kran | Checkbox | 71/177 |  | Es ist ein größerer Montagekran erforderlich | Yes | ankreuzen |  |  |
| 20 | KranText | Text | 271/176 |  |  |  | manuell |  |  |
| 20 | MontageSonstiges | Checkbox | 71/134 |  |  | Yes | ankreuzen |  |  |
| 20 | MontageSonstigesText | Text | 94/48 |  | Es ist ein größerer Montagekran erforderlich |  | manuell |  |  |
| 21 | Parkverbot | Checkbox | 72/733 |  | Parkverbot | Yes | ankreuzen |  |  |
| 21 | Sperrunghalbseitig | Checkbox | 72/712 |  | hal | Yes | ankreuzen |  |  |
| 21 | Sperrungvoll | Checkbox | 72/691 |  | Vollsperrung | Yes | ankreuzen |  |  |
| 21 | Besichtigung | Checkbox | 72/670 |  | Besichtigung durch Schwabenhaus erforderlich | Yes | ankreuzen |  |  |
| 21 | BesichtigungSonstigesText | Text | 91/649 |  | Besichtigung durch Schwabenhaus erforderlich |  | manuell |  |  |
| 21 | BesichtigungSonstiges | Checkbox | 72/648 |  |  | Yes | ankreuzen |  |  |

### 8. Bau- und Leistungsumfang Heizungssystem

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 22 | Heizung | Radio | 72/690 | Heizung | Heizungssystem von Schwabenhaus / Bauherrenseitiges Heizungssystem | 0, 1 | ankreuzen |  |  |
| 22 | SH-Heizung | Radio | 93/668 | SH-Heizung | laut Werkvertrag / abweichend vom Werkvertrag | 0, 1 | ankreuzen |  |  |
| 22, 23, 37 | Heizungssystem | Radio | 72/441 | Heizungssystem | Doppel-Wärme-Pumpe Eco / Doppel-Wärme-Pumpe Eco+ / Luft-Wasser-Wärmepumpe als Kompaktgerät zur Innenaufstellung ( / Split- | 1, 2, 6, 5, 4, 3, 0, 7, 8, 9 | ankreuzen |  |  |
| 22, 37 | HeizungssystemDWP | Radio | 72/397 | HeizungssystemDWP | Doppel-Wärme-Pumpe Space Saver Ausführung (nur bei Eco+ möglich) / Doppel-Wärme-Pumpe als Standgerät (z.B. für Zweifamilienhaus) / Einfamilienhaus mit Einliegerwohnung im Erdgeschoss | 0, 1, 2 | ankreuzen |  |  |
| 22 | HeizungssystemSole | Radio | 93/233 | HeizungssystemSole | Bohrung möglich (Bohrung im Lageplan definieren / Bohrung nicht möglich, daher Flächenkollektoren erforderlich | 0, 1 | ankreuzen |  |  |
| 23 | HeizungssystemSonstige | Radio | 91/681 | HeizungssystemSonstige | Gas-Brennwertheizung mit Erdgas-Anschluss / Gas-Brennwertheizung mit Flüssiggas-Anschluss / Nahwärme- bzw. Fernwärme-Anschluss | 0, 1, 2, 3 | ankreuzen |  |  |
| 23 | HeizungssystemSonstigeText | Text | 110/538 |  | Verfügung. |  | manuell |  |  |
| 23 | Kellerbeheizung | Checkbox | 70/524 |  | beheizte Kellerräume (aktiv und/oder passiv beheizt) sind im Bauantrag mit der Bezeichnung | Yes | ankreuzen |  |  |
| 23 | DWPWasserbedarf | Checkbox | 69/417 |  | Die Ermittlung des Warmwasserbedarfs (Anlage 22-024) wurde erläutert und ausgefüllt | Yes | ankreuzen |  |  |
| 23 | DWP2TWWP | Checkbox | 69/395 |  | Einplanung einer 2. Trinkwarmwasser-Wärmepumpe | Yes | ankreuzen |  |  |
| 23 | DWPBoost | Checkbox | 69/374 |  | Reduzierung der Aufheizzeit mit einer Boost-Funktion (elektrischer Heizstab mit 4,5 kW anstelle 1,5 kW) | Yes | ankreuzen |  |  |
| 23 | DWP-FBH | Radio | 69/341 | DWP-FBH | Elektrische Fußbodentemperierung (Heizmatte im Fliesenbett) | 0 | ankreuzen |  |  |

### 9. Abgassystem / Schornsteinsystem

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 24 | LAS_Nachbarbebauung | Checkbox | 91/414 |  | Die Nachbarbebauung wurde geprüft und mit den planungsrelevanten Rahmenbedingungen | Yes | ankreuzen |  |  |
| 25 | Group30 | Radio | 73/524 | Group30 | von Schwabenhaus / bauherrenseitige Leistung | Choice1, Choice2 | ankreuzen |  |  |
| 25 | Check Box73 | Checkbox | 215/503 |  | Vorbereitung für einen bauherrenseitigen Edelstahlaußenschornstein | Yes | ankreuzen |  |  |
| 25 | Schornsteinreinigung | Radio | 72/391 | Schornsteinreinigung | Reinigung des Schornsteines über Dach: / Reinigung des Schornsteins im Gebäude | überDach, imGebäude | ankreuzen |  |  |
| 25 | ReinigungüberDach | Radio | 90/371 | ReinigungüberDach | Ausstieg vom Spitzboden aus mit / Ausstieg im Wohnraum über ein zu- / Aufstieg von der Traufe aus mit Trittsteinen | Spitzboden, Wohnraum, Außenaufstieg | ankreuzen |  |  |
| 25 | ReinigungimGebäude | Radio | 334/370 | ReinigungimGebäude | Dachboden/Spitzboden / im obersten Geschoss DG/OG / im Erdgeschoss / im Kellergeschoss | Spitzboden, imOG-DG, imEG, imKG | ankreuzen |  |  |

### 10. Elektroinstallationen

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 26 | Elektroversorgung | Radio | 72/692 | Elektroversorgung | Erdkabel / Dachständer / im Außenbereich (z.B. Hausanschlusssäule) | Erdkabel, Dachständer, Anschlusssäule | ankreuzen |  |  |
| 26 | UnterverteilungZählerschrank | Checkbox | 72/586 |  | Unterverteilung integriert im Zählerschrank (Einfamil | Yes | ankreuzen |  |  |
| 26 | getrennteZählung | Checkbox | 72/564 |  | getrennte Zählung / Verbrauchserfassung in separater Unterverteilung | Yes | ankreuzen |  |  |
| 26 | UnterverteilungRaum | Checkbox | 72/544 |  | im Gebäude (Raum): | Yes | ankreuzen |  |  |
| 26 | UnterverteilungRaumText | Text | 175/543 |  | getrennte Zählung / Verbrauchserfassung in separater Unterverteilung |  | manuell |  |  |
| 26 | UnterverteilungAnschlusssäule | Checkbox | 72/522 |  | im Außenberei | Yes | ankreuzen |  |  |
| 26 | Group1 | Radio | 173/490 | Group1 | keine PV-Pflicht / PV-Pflicht gem. Landesbauordnung (LBO) | Choice1, Choice2 | ankreuzen |  |  |
| 26 | PV_Anlage | Radio | 72/469 | PV_Anlage | Keine PV-Anlage vorgesehen / Anlage bauherrenseitig / Anlage von Schwabenhaus | Choice1, Choice2, Choice3 | ankreuzen |  |  |
| 26 | PV-Bauseitig | Checkbox | 95/408 |  | Zählerschrankerweiterung | Yes | ankreuzen |  |  |
| 26 | PV-Bauseitig-Leerrohr | Checkbox | 95/392 |  | Leerrohr vom | Yes | ankreuzen |  |  |
| 26 | LeerrohrVon | Text | 177/391 |  | Zählerschrankerweiterung |  | manuell |  |  |
| 26 | LeerrohrZum | Text | 272/390 |  | Leerrohr vom |  | manuell |  |  |
| 26 | PV-SH | Checkbox | 72/336 |  | Auf-Dach-Montage | Yes | ankreuzen |  |  |
| 26 | BatteriespeicherEingeplant | Checkbox | 72/315 |  | Platzbedarf des Batteriespeichers und der Wechselrichter in der Bauantragsplanung berücksichtigt (auch | Yes | ankreuzen |  |  |

### 11. Checkliste Bauantragserstellung

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 27 | Check Box83 | Checkbox | 72/646 | S. 27, Zeile „Original unterschriebene Bauantragspläne“ | Original unterschriebene Bauantragspläne | Yes | ankreuzen |  |  |
| 27 | Check Box87 | Checkbox | 287/646 | S. 27, Zeile „Original unterschriebene Bauantragspläne“ | Vollständiger Bauantrag incl. Textteil | Yes | ankreuzen |  |  |
| 27 | Check Box84 | Checkbox | 72/624 | S. 27, Zeile „Lageplan / Katasterauszug“ | Lageplan / Katasterauszug | Yes | ankreuzen |  |  |
| 27 | Check Box88 | Checkbox | 287/624 | S. 27, Zeile „Lageplan / Katasterauszug“ | Bebauungsplan | Yes | ankreuzen |  |  |
| 27 | Check Box89 | Checkbox | 287/604 | S. 27, Zeile „Entwässerungsplanung“ | Diese Planungs-Dokumentation zum | Yes | ankreuzen |  |  |
| 27 | Check Box85 | Checkbox | 72/603 | S. 27, Zeile „Entwässerungsplanung“ | Entwässerungsplanung | Yes | ankreuzen |  |  |
| 27 | Check Box86 | Checkbox | 72/582 |  | Baugrundgutachten | Yes | ankreuzen |  |  |
| 27 | PlanungsDokumentation_OrtDatum | Text | 70/365 |  |  |  | manuell |  |  |
| 27 | Anlage1 | Checkbox | 72/233 |  | A1 | Yes | ankreuzen |  |  |
| 27 | Anlage2 | Checkbox | 73/212 |  | A2 | Yes | ankreuzen |  |  |
| 27 | Anlage3 | Checkbox | 72/191 |  | A3 | Yes | ankreuzen |  |  |
| 27 | Anlage4 | Checkbox | 72/170 |  | A4 | Yes | ankreuzen |  |  |
| 27 | Anlage5 | Checkbox | 72/148 |  | A5 | Yes | ankreuzen |  |  |
| 28 | Check Box4 | Checkbox | 72/719 |  | Spannweite Decke EG | Yes | ankreuzen |  |  |
| 28 | Check Box52 | Checkbox | 72/698 |  | Spannweite Mittelpfette | Yes | ankreuzen |  |  |
| 28 | Check Box95 | Checkbox | 72/677 |  | Lastabtragung bei bauherrenseitigem Balkon | Yes | ankreuzen |  |  |
| 28 | Check Box96 | Checkbox | 72/656 |  | Lage der Außenwände im OG/DG zum EG auf Deckungsgleichheit geprüft | Yes | ankreuzen |  |  |
| 28 | Check Box97 | Checkbox | 72/635 |  | Wandstärke aus BLB mit der geforderten Effizienzklassen aus der Leistungszusammenstellung ermittelt | Yes | ankreuzen |  |  |
| 28 | Check Box98 | Checkbox | 72/614 |  | Traufhöhen mit Schwabenhaus-Systemschnitt abgeglichen | Yes | ankreuzen |  |  |
| 28 | Check Box99 | Checkbox | 71/592 |  | Traufhöhe ermittelt | Yes | ankreuzen |  |  |
| 28 | Check Box100 | Checkbox | 72/571 |  | Deckenspannrichtung mit der Entwässerungsführung abgeglichen | Yes | ankreuzen |  |  |
| 28 | Check Box101 | Checkbox | 72/550 |  | Lage des Schornsteins in Bezug auf Lage zur Mittelpfette und zur Firstpfette geprüft | Yes | ankreuzen |  |  |
| 28 | Check Box102 | Checkbox | 72/529 |  | Bei Erdbebenzone Richtlinie | Yes | ankreuzen |  |  |
| 28 | Check Box103 | Checkbox | 72/507 |  | Mindestabstände Giebelfenster zur Traufe geprüft | Yes | ankreuzen |  |  |
| 28 | Check Box104 | Checkbox | 72/486 |  | Belichtungsfläche nach LBO berücksichtigt | Yes | ankreuzen |  |  |
| 28 | Check Box105 | Checkbox | 72/466 |  | Sommerlichen Wärmeschutz berücksichtigt | Yes | ankreuzen |  |  |
| 28 | Check Box106 | Checkbox | 72/444 |  | Lage der Kniestockfenster beachtet | Yes | ankreuzen |  |  |
| 28 | Check Box107 | Checkbox | 72/423 |  | Zweiter Rettungsweg geplant / Anpassung Rollladen berücksichtigt | Yes | ankreuzen |  |  |
| 28 | Check Box108 | Checkbox | 72/402 |  | Brandschutzmaßnahmen Schornstein beachtet | Yes | ankreuzen |  |  |
| 28 | Check Box109 | Checkbox | 72/381 |  | Schornsteinreinigung mit Bezirksschornsteinfegermeister abgestimmt | Yes | ankreuzen |  |  |
| 28 | Check Box110 | Checkbox | 72/359 |  | Feuerungsverordnung und 1. BImSchV; § 19 beachtet | Yes | ankreuzen |  |  |
| 28 | Check Box111 | Checkbox | 72/338 |  | Größe des Technikraums mit Haustechnikraumblättern abgestimmt | Yes | ankreuzen |  |  |
| 28 | Check Box112 | Checkbox | 72/317 |  | Frischluftzufuhr | Yes | ankreuzen |  |  |
| 28 | Check Box113 | Checkbox | 72/296 |  | Thema Badezimmer: Kopffreiheit Dusche im DG / Abstandsflächen und Bewegungsflächen geprüft | Yes | ankreuzen |  |  |
| 28 | Check Box114 | Checkbox | 72/275 |  | Thema Badezimmer: Positionierung der Sanitärobjekte (DIN-Abstände und Entwässerungsführung) beachtet | Yes | ankreuzen |  |  |
| 28 | Check Box115 | Checkbox | 72/254 |  | Entlüftung über Dach: Mindestabstände zu den Dachflächenfenstern geprüft | Yes | ankreuzen |  |  |
| 28 | Check Box116 | Checkbox | 72/232 |  | Leistungszusammenstellung in Bezug auf die verkaufte Gebäudetechnik ausgewertet | Yes | ankreuzen |  |  |
| 28 | Check Box117 | Checkbox | 72/211 |  | Mindestabstand > 50 cm bei DFF, Solar, PV zu Dachaufbauten etc. beachtet, auch Grat und Kehle etc. | Yes | ankreuzen |  |  |
| 28 | Check Box118 | Checkbox | 72/190 |  | Planungsvorgabe für ein Zweifamilienhaus beachtet | Yes | ankreuzen |  |  |
| 28 | Check Box119 | Checkbox | 72/168 |  | Schallschutzmaßnahmen und | Yes | ankreuzen |  |  |
| 28 | Check Box120 | Checkbox | 72/148 |  | Bodengutachten / Baugrundgutachten beauftragt | Yes | ankreuzen |  |  |
| 28 | Check Box121 | Checkbox | 72/126 |  | Abstände für TGA (technische Gebäudeausstattung) beachtet | Yes | ankreuzen |  |  |
| 28 | Checkliste_OrtDatum | Text | 70/84 |  |  |  | manuell |  |  |

### A1 – Angaben zur Nachbarbebauung

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 29 | AufbauNachbar | Radio | 72/516 | AufbauNachbar | Nachbargebäude als Bestandgebäude / Nachbargebäude von / Nachbargebäude von Fremdunternehmen n | Bestand, zeitgleich, Später | ankreuzen |  |  |
| 29 | Text50 | Text | 128/363 |  | Name: |  | manuell |  |  |
| 29 | Text51 | Text | 326/363 |  | Architekt |  | manuell |  |  |
| 29 | Text56 | Text | 128/335 |  | Adresse: |  | manuell |  |  |
| 29 | Text57 | Text | 326/335 |  | Adresse: |  | manuell |  |  |
| 29 | Text52 | Text | 127/307 |  | Tel.-Nr.: |  | manuell |  |  |
| 29 | Text53 | Text | 326/307 |  | Tel.-Nr.: |  | manuell |  |  |
| 29 | Text55 | Text | 96/231 |  | Nr. |  | manuell |  |  |
| 29 | Text62 | Text | 309/231 |  | Schichtdicke in mm |  | manuell |  |  |
| 29 | Text58 | Text | 96/218 |  | Nr. |  | manuell |  |  |
| 29 | Text65 | Text | 309/218 |  | Schichtdicke in mm |  | manuell |  |  |
| 29 | Text60 | Text | 96/206 |  |  |  | manuell |  |  |
| 29 | Text63 | Text | 309/206 |  |  |  | manuell |  |  |
| 29 | Text59 | Text | 96/193 |  |  |  | manuell |  |  |
| 29 | Text66 | Text | 309/193 |  |  |  | manuell |  |  |
| 29 | Text61 | Text | 96/180 |  |  |  | manuell |  |  |
| 29 | Text64 | Text | 309/180 |  |  |  | manuell |  |  |
| 30 | Text92 | Text | 197/690 |  |  |  | manuell |  |  |
| 30 | Text93 | Text | 201/638 |  |  |  | manuell |  |  |
| 30 | Text96 | Text | 356/598 |  | OK FFB EG |  | manuell |  |  |
| 30 | Text94 | Text | 202/584 |  |  |  | manuell |  |  |
| 30 | Text97 | Text | 358/573 |  | OK RFB EG |  | manuell |  |  |
| 30 | Text99 | Text | 169/571 |  | OK RFB EG |  | manuell |  |  |
| 30 | Text100 | Text | 170/554 |  | OK FFB EG |  | manuell |  |  |
| 30 | Text101 | Text | 169/533 |  | OK RFB EG |  | manuell |  |  |
| 30 | Text95 | Text | 202/529 |  | OK RFB EG |  | manuell |  |  |
| 30 | Text98 | Text | 203/481 |  |  |  | manuell |  |  |
| 30 | Check Box122 | Checkbox | 220/436 |  | OK Firstziegel | Yes | ankreuzen |  |  |
| 30 | Check Box123 | Checkbox | 221/419 |  | OK Dachlatte **) | Yes | ankreuzen |  |  |
| 30 | Text72 | Text | 298/293 |  | Schnitt |  | manuell |  |  |
| 30 | Text68 | Text | 67/240 |  |  |  | manuell |  |  |
| 30 | Text73 | Text | 276/234 |  | OK RFB EG |  | manuell |  |  |
| 30 | Text69 | Text | 128/192 |  |  |  | manuell |  |  |
| 30 | Text70 | Text | 218/191 |  |  |  | manuell |  |  |
| 30 | Text71 | Text | 173/173 |  |  |  | manuell |  |  |
| 30 | A1_OrtDatum | Text | 69/115 |  |  |  | manuell |  |  |

### A2 – Angaben zum Edelstahlaußenschornstein

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 31 | A2_OrtDatum | Text | 71/116 |  |  |  | manuell |  |  |

### A3 Angaben zum Fenstereinbau

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 32 | LichtbandEG | Checkbox | 72/654 |  | Lichtband im Erdgeschoss | Yes | ankreuzen |  |  |
| 32 | KniestockfensterBodenttief | Checkbox | 72/381 |  | Fenster im Kniestock bodentief eingebaut | Yes | ankreuzen |  |  |
| 33 | KniestockfensterBrüstung | Checkbox | 72/697 |  | Fenster im Kniestock mit kleiner Brüstung | Yes | ankreuzen |  |  |
| 33 | DFF_niedriegerKniestock | Checkbox | 72/412 | S. 33, Zeile „Dachflächenfenster bei“ | Dachflächenfenster bei | Yes | ankreuzen |  |  |
| 33 | DFF_hoherKniestock | Checkbox | 338/412 | S. 33, Zeile „Dachflächenfenster bei“ | Dachflächenfenster be | Yes | ankreuzen |  |  |
| 34 | A3_OrtDatum | Text | 71/370 |  |  |  | manuell |  |  |

### A4 – Angaben zum Anbau einer Fertigteilgarage

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 35 | Garage | Radio | 72/570 | Garage | Anbau Standard-Fertigteilgarage h = 2,58 m (ohne Durchgang zum Haus) / Anbau Fertigteilgarage mit Sonderhöhe h = 2, | Standardhöhe, Sonderhöhe | ankreuzen |  |  |
| 35 | A4_OrtDatum | Text | 72/145 |  |  |  | manuell |  |  |

### A5 – Merkblatt zur Ermittlung des Warmwasserbedarfs

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 36, 38 | A5-TWWP | Radio | 72/287 | A5-TWWP | Wir wünschen die Einplanung einer zweiten Trinkwasserwärmepumpe / Wir benötigen keine zweite Trinkwasserwärmepumpe / Ausführung einer zusätzlichen Trink-Warmwasser-Wärmepumpe bei erhöhtem Warmwasserbedarf, z.B. in | KeineTWWP, TWWPgewünscht | ankreuzen |  |  |
| 36, 38 | Boost | Radio | 72/243 | Boost | Wir wünschen die optional erhältliche BOOST-Funktion / Boost-Funktion mit 4,5 kW Leistung / Boost-Funktion mit 9,0 kW Leistung | Boost45, Boost90 | ankreuzen |  |  |
| 36, 38 | A5-Klima5Zonen | Checkbox | 72/197 | A5-Klima5Zonen | Wir wünschen die / Verstärkung der Kühl Funktion für Doppelwärmepumpe Eco+ und Trinkwasserwärmepumpe | Yes | ankreuzen |  |  |
| 36, 38 | A5_OrtDatum | Text | 70/142 |  |  |  | manuell |  |  |

### Checkliste Doppel-Wärmepumpe 1/2

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 37 | CheckDWP_Eff | Radio | 102/609 | CheckDWP_Eff | KfW-Effizienzhaus 55 ohne PV-Anlage (ohne Kühlfunktion) / KfW-Effizienzhaus 40 ohne PV-Anlage (ohne Kühlfunktion) / KfW-Effizienzhaus 40 mit PV-Anlage (mit Kühlfunktion) / KfW-Effizienzhaus 40 KFN mit PV-Anlage + Batteriespeicher von Schwabenhaus | 0, 1, 2, 3, 4, 5, 6 | ankreuzen |  |  |
| 37 | CheckDWP_HWR | Radio | 102/231 | CheckDWP_HWR | Technikraum im Erdgeschoss (EG), immer bei Haus auf Bodenplatte / Technikraum im Unter-/Kellergeschoss (KG), bei Haus auf Keller bzw. Teilunterkellerung | HWR-EG, HWR-KG | ankreuzen |  |  |
| 37 | CheckDWP_KG | Radio | 121/180 | CheckDWP_KG | Keller beheizt als Nutzraum-Keller Plus oder Wohnraum-Keller / Keller unbeheizt als Nutzraum-Keller | Keller-beheizt, Keller-unbeheizt | ankreuzen |  |  |

### Checkliste Doppel-Wärmepumpe 2/2

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 38 | CheckDWP_5Zonen-3 | Radio | 214/694 | CheckDWP_5Zonen-3 | Schlafen, / Kind 1, / Kind 2, / Kind 3, | 0, 1, 2, 3, 5, 4, 6 | ankreuzen |  |  |
| 38 | CheckDWP_5Zonen-4 | Radio | 214/648 | CheckDWP_5Zonen-4 | Schlafen, / Kind 1, / Kind 2, / Kind 3, | Zone3_Schlafen, Zone3_Kind1, Zone3_Büro/Gast, Zone3_Homeoffice, Zone3_Keller | ankreuzen |  |  |
| 38 | CheckDWP_5Zonen-5 | Radio | 214/614 | CheckDWP_5Zonen-5 | Schlafen, / Kind 1, / Kind 2, / Kind 3, | 0, 1, 2, 3, 5, 4, 6 | ankreuzen |  |  |
| 38 | CheckDWP_Infrarot-1 | Radio | 215/509 | CheckDWP_Infrarot-1 | Wohnen, / Essen, / Büro, / Hobby, | Wohnen, Essen, Büro, Hobby, Homeoffice, Fitness | ankreuzen |  |  |
| 38 | CheckDWP_Infrarot-2 | Radio | 215/492 | CheckDWP_Infrarot-2 | Wohnen, / Essen, / Büro, / Hobby, | Wohnen, Essen, Büro, Hobby, Homeoffice, Fitness | ankreuzen |  |  |
| 38 | CheckDWP_Infrarot-3 | Radio | 215/476 | CheckDWP_Infrarot-3 | Wohnen, / Essen, / Büro, / Hobby, | Wohnen, Essen, Büro, Hobby, Homeoffice, Fitness | ankreuzen |  |  |
| 38 | CheckDWP_El-FBH | Radio | 143/384 | CheckDWP_El-FBH | Haupt-Bad im / Kinder-Bad im / Gäste-WC im / Dusch-WC im | Hauptbad, Kinderbad, GästeWC, DuWC | ankreuzen |  |  |
| 38 | CheckDWP_El-FBH_Haupt | Radio | 221/384 | CheckDWP_El-FBH_Haupt | EG, / OG, / DG, / KG | EG, OG, DG, KG | ankreuzen |  |  |
| 38 | CheckDWP_El-FBH_Kinder | Radio | 221/367 | CheckDWP_El-FBH_Kinder | EG, / OG, / DG, / KG | EG, OG, DG, KG | ankreuzen |  |  |
| 38 | CheckDWP_El-FBH_GästeWC | Radio | 221/350 | CheckDWP_El-FBH_GästeWC | EG, / OG, / DG, / KG | EG, OG, DG, KG | ankreuzen |  |  |
| 38 | CheckDWP_El-FBH_DuWc | Radio | 221/333 | CheckDWP_El-FBH_DuWc | EG, / OG, / DG, / KG | EG, OG, DG, KG | ankreuzen |  |  |

## Living Haus: FB-22-201-03 Planungsprotokoll LH Bauantrag

24 Seiten, 423 Felder (423 Widgets): 136 Text, 287 Checkbox. Vorbefüllbar 51 (davon im Modell: ja 9, teilweise 14, fehlt 28), manuell 85, ankreuzen 287.


### 0. Kopfdaten und Projektbeteiligte

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Textfeld 1.01 | Text | 178/762 |  | Projekt-Nr.: |  | vorbefüllbar | Projekt-/BV-Nr. der Hausbaufirma: projects.hausbau_nr (offene Frage: dieselbe Nummer?) | ja |
| 1 | Textfeld 1.02 | Text | 207/742 |  | Name: |  | vorbefüllbar | Bauherr Name: bauherren.name (+ name2), sonst projects.bauherr_label | ja |
| 1 | Textfeld 1.03 | Text | 207/722 |  | Straße: |  | vorbefüllbar | Bauherr Straße: Teil von bauherren.address (eine Zeile, wird aufgeteilt) | teilweise |
| 1 | Textfeld 1.05 | Text | 381/722 |  | PLZ/Ort: |  | vorbefüllbar | Bauherr PLZ/Ort: Teil von bauherren.address | teilweise |
| 1 | Textfeld 1.04 | Text | 207/702 |  | Mobil: |  | vorbefüllbar | Bauherr Mobil: bauherren.phone (Telefon und Mobil nicht getrennt) | teilweise |
| 1 | Textfeld 1.06 | Text | 381/702 |  | E-Mail: |  | vorbefüllbar | Bauherr E-Mail: bauherren.email | ja |
| 1 | Textfeld 1.07 | Text | 243/681 |  | Straße/Baugebiet: |  | vorbefüllbar | Bauort Straße/Baugebiet: Teil von bauherren.building_address | teilweise |
| 1 | Textfeld 1.10 | Text | 381/681 |  | PLZ/Ort: |  | vorbefüllbar | Bauort PLZ/Ort: PLZ aus bauherren.building_address, Ort aus projects.location | teilweise |
| 1 | Textfeld 1.08 | Text | 224/661 |  | Gemarkung: |  | vorbefüllbar | Gemarkung: projects.gemarkung | ja |
| 1 | Textfeld 1.11 | Text | 400/661 |  | Gemeindeteil: |  | vorbefüllbar | Gemeindeteil/Ortsteil: fehlt | fehlt |
| 1 | Textfeld 1.09 | Text | 231/641 |  | Flur/Flurstück: |  | vorbefüllbar | Flur/Flurstück: projects.flurstueck (Flur nicht getrennt) | teilweise |
| 1 | Textfeld 1.12 | Text | 394/641 |  | Bundesland: |  | vorbefüllbar | Bundesland: fehlt (Annahme Baden-Württemberg, besser aus der PLZ) | fehlt |
| 1 | Textfeld 1.14 | Text | 411/620 |  | Tel.: |  | vorbefüllbar | Architekt Telefon: Bürodaten ABM (nicht im Modell) | fehlt |
| 1 | Textfeld 1.15 | Text | 411/600 |  | Mobil: |  | vorbefüllbar | Architekt Mobil: Bürodaten ABM (nicht im Modell) | fehlt |
| 1 | Textfeld 1.13 | Text | 178/581 |  | Architekt: |  | vorbefüllbar | Architekt: team_members.name (über projects.architect_id) | ja |
| 1 | Textfeld 1.16 | Text | 410/580 |  | E-Mail: |  | vorbefüllbar | Architekt E-Mail: Bürodaten ABM (nicht im Modell) | fehlt |
| 1 | Textfeld 1.29 | Text | 411/560 |  | Tel.: |  | vorbefüllbar | Vermessungsbüro Telefon: project_parties[vermesser].contact (eine Zeile) | teilweise |
| 1 | Textfeld 1.28 | Text | 410/540 |  | Mobil: |  | vorbefüllbar | Vermessungsbüro Mobil: project_parties[vermesser].contact (eine Zeile) | fehlt |
| 1 | Textfeld 1.17 | Text | 178/519 |  | Vermessungsbüro: |  | vorbefüllbar | Vermessungsbüro: project_parties[vermesser].name | ja |
| 1 | Textfeld 1.27 | Text | 410/519 |  | E-Mail: |  | vorbefüllbar | Vermessungsbüro E-Mail: project_parties[vermesser].contact (eine Zeile) | teilweise |
| 1 | Textfeld 1.32 | Text | 410/499 |  | Tel.: |  | vorbefüllbar | Kellerbauer/Bodenplatte Telefon: Rolle fehlt | fehlt |
| 1 | Textfeld 1.31 | Text | 410/479 |  | Mobil: |  | vorbefüllbar | Kellerbauer/Bodenplatte Mobil: Rolle fehlt | fehlt |
| 1 | Textfeld 1.18 | Text | 178/459 |  | Bodenplatte: |  | vorbefüllbar | Kellerbauer/Bodenplatte: Rolle fehlt (Altspalte bauherren.basement_builder ungenutzt) | fehlt |
| 1 | Textfeld 1.30 | Text | 410/458 |  | E-Mail: |  | vorbefüllbar | Kellerbauer/Bodenplatte E-Mail: Rolle fehlt | fehlt |
| 1 | Textfeld 1.35 | Text | 411/438 |  | Tel.: |  | vorbefüllbar | Erdbau-Unternehmen Telefon: project_parties[erdbauer].contact (eine Zeile) | teilweise |
| 1 | Textfeld 1.34 | Text | 410/418 |  | Mobil: |  | vorbefüllbar | Erdbau-Unternehmen Mobil: project_parties[erdbauer].contact (eine Zeile) | fehlt |
| 1 | Textfeld 1.19 | Text | 179/398 |  | unternehmen: |  | vorbefüllbar | Erdbau-Unternehmen: project_parties[erdbauer].name | ja |
| 1 | Textfeld 1.33 | Text | 410/398 |  | E-Mail: |  | vorbefüllbar | Erdbau-Unternehmen E-Mail: project_parties[erdbauer].contact (eine Zeile) | teilweise |
| 1 | Textfeld 1.38 | Text | 411/377 |  | Tel.: |  | vorbefüllbar | Bauaufsicht/Bauamt Telefon: Rolle fehlt | fehlt |
| 1 | Textfeld 1.37 | Text | 411/357 |  | Mobil: |  | vorbefüllbar | Bauaufsicht/Bauamt Mobil: Rolle fehlt | fehlt |
| 1 | Textfeld 1.20 | Text | 179/337 |  | Genehmigungs- |  | vorbefüllbar | Bauaufsicht/Bauamt: Rolle fehlt | fehlt |
| 1 | Textfeld 1.36 | Text | 411/336 |  | E-Mail: |  | vorbefüllbar | Bauaufsicht/Bauamt E-Mail: Rolle fehlt | fehlt |
| 1 | Textfeld 1.41 | Text | 411/316 |  | Tel.: |  | vorbefüllbar | Schornsteinfeger Telefon: Rolle fehlt | fehlt |
| 1 | Textfeld 1.40 | Text | 411/296 |  | Mobil: |  | vorbefüllbar | Schornsteinfeger Mobil: Rolle fehlt | fehlt |
| 1 | Textfeld 1.21 | Text | 179/276 |  | Schornsteinfeger: |  | vorbefüllbar | Schornsteinfeger: Rolle fehlt | fehlt |
| 1 | Textfeld 1.39 | Text | 411/276 |  | E-Mail: |  | vorbefüllbar | Schornsteinfeger E-Mail: Rolle fehlt | fehlt |
| 1 | Textfeld 1.44 | Text | 411/255 |  | Tel.: |  | vorbefüllbar | Versorger Strom Telefon: project_parties[strom].contact (eine Zeile) | teilweise |
| 1 | Textfeld 1.22 | Text | 179/235 |  | : |  | vorbefüllbar | Versorger Strom: project_parties[strom].name | ja |
| 1 | Textfeld 1.43 | Text | 410/235 |  | E-Mail: |  | vorbefüllbar | Versorger Strom E-Mail: project_parties[strom].contact (eine Zeile) | teilweise |
| 1 | Textfeld 1.42 | Text | 411/215 |  | Tel.: |  | vorbefüllbar | Versorger Gas Telefon: Rolle fehlt | fehlt |
| 1 | Textfeld 1.23 | Text | 178/195 |  | : |  | vorbefüllbar | Versorger Gas: Rolle fehlt | fehlt |
| 1 | Textfeld 1.47 | Text | 411/195 |  | E-Mail: |  | vorbefüllbar | Versorger Gas E-Mail: Rolle fehlt | fehlt |
| 1 | Textfeld 1.46 | Text | 411/174 |  | Tel.: |  | vorbefüllbar | Versorger Fernwärme Telefon: Rolle fehlt | fehlt |
| 1 | Textfeld 1.24 | Text | 178/154 |  | : |  | vorbefüllbar | Versorger Fernwärme: Rolle fehlt | fehlt |
| 1 | Textfeld 1.45 | Text | 411/154 |  | E-Mail: |  | vorbefüllbar | Versorger Fernwärme E-Mail: Rolle fehlt | fehlt |
| 1 | Textfeld 1.50 | Text | 411/134 |  | Tel.: |  | vorbefüllbar | Versorger Wasser Telefon: project_parties[wasser].contact (eine Zeile) | teilweise |
| 1 | Textfeld 1.25 | Text | 179/114 |  | : |  | vorbefüllbar | Versorger Wasser: project_parties[wasser].name | ja |
| 1 | Textfeld 1.49 | Text | 410/113 |  | E-Mail: |  | vorbefüllbar | Versorger Wasser E-Mail: project_parties[wasser].contact (eine Zeile) | teilweise |
| 1 | Textfeld 1.48 | Text | 410/93 |  | Tel.: |  | vorbefüllbar | Abwasser Telefon: Rolle fehlt | fehlt |
| 1 | Textfeld 1.51 | Text | 411/73 |  | E-Mail: |  | vorbefüllbar | Abwasser E-Mail: Rolle fehlt | fehlt |
| 1 | Textfeld 1.26 | Text | 179/72 |  | : |  | vorbefüllbar | Abwasser: Rolle fehlt | fehlt |

### 1. Allgemeine Angaben für den Bauantrag

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 2 | Kontrollkästchen 2.01 | Checkbox | 406/743 | S. 2, Zeile „Höhe über NN (in m)“ | RFB | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.02 | Checkbox | 449/743 | S. 2, Zeile „Höhe über NN (in m)“ | FFB | Ja | ankreuzen |  |  |
| 2 | Textfeld 2.01 | Text | 205/742 |  | Allgemeine Angaben für den Bauantrag |  | manuell |  |  |
| 2 | Kontrollkästchen 2.03 | Checkbox | 334/716 | S. 2, Zeile „Schneelastzone“ | 1 | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.04 | Checkbox | 370/716 | S. 2, Zeile „Schneelastzone“ | 1a | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.07 | Checkbox | 502/716 | S. 2, Zeile „Schneelastzone“ | 3 | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.05 | Checkbox | 417/715 | S. 2, Zeile „Schneelastzone“ | 2 | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.06 | Checkbox | 454/715 | S. 2, Zeile „Schneelastzone“ | 2a | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.09 | Checkbox | 172/690 | S. 2, Zeile „Ja“ | Nein | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.08 | Checkbox | 137/689 | S. 2, Zeile „Ja“ | Ja | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.10 | Checkbox | 137/676 |  | Maßnahmen im BA eindeutig gekennzeichnet und benannt. | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.11 | Checkbox | 315/649 | S. 2, Zeile „Erdbebenzone“ | keine | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.12 | Checkbox | 375/649 | S. 2, Zeile „Erdbebenzone“ | 0 | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.13 | Checkbox | 418/649 | S. 2, Zeile „Erdbebenzone“ | 1 | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.14 | Checkbox | 460/649 | S. 2, Zeile „Erdbebenzone“ | 2 | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.15 | Checkbox | 503/649 | S. 2, Zeile „Erdbebenzone“ | 3 | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.16 | Checkbox | 357/595 | S. 2, Zeile „Wasserschutzzone“ | keine | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.17 | Checkbox | 418/595 | S. 2, Zeile „Wasserschutzzone“ | 1 | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.18 | Checkbox | 461/595 | S. 2, Zeile „Wasserschutzzone“ | 2 | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.19 | Checkbox | 503/595 | S. 2, Zeile „Wasserschutzzone“ | 3 | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.20 | Checkbox | 136/568 |  | BA im Genehmigungsverfahren | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.21 | Checkbox | 136/555 |  | BA im Anzeigeverfahren | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.22 | Checkbox | 136/542 |  | BA im Anzeigeverfahren | Ja | ankreuzen |  |  |
| 2 | Textfeld 2.02 | Text | 147/513 |  | Befreiungs-/Abweichungsantrag erforderlich für: |  | manuell |  |  |
| 2 | Textfeld 2.03 | Text | 147/499 |  | Befreiungs-/Abweichungsantrag erforderlich für: |  | manuell |  |  |
| 2 | Textfeld 2.04 | Text | 147/485 |  |  |  | manuell |  |  |
| 2 | Textfeld 2.05 | Text | 147/472 |  |  |  | manuell |  |  |
| 2 | Textfeld 2.06 | Text | 147/458 |  |  |  | manuell |  |  |
| 2 | Kontrollkästchen 2.23 | Checkbox | 392/434 |  | Ja | Ja | ankreuzen |  |  |
| 2 | Textfeld 2.07 | Text | 447/433 |  | Ja |  | manuell |  |  |
| 2 | Kontrollkästchen 2.24 | Checkbox | 393/421 |  | Nein | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.25 | Checkbox | 392/394 |  | Ja | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.26 | Checkbox | 392/380 |  | Nein | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.27 | Checkbox | 358/355 | S. 2, Zeile „Entfernung zu Nord- und Ostsee:“ | Radius < 30km | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.28 | Checkbox | 444/354 | S. 2, Zeile „Entfernung zu Nord- und Ostsee:“ | Radius > 30km | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.29 | Checkbox | 238/327 | S. 2, Zeile „B-Plan vorhanden?“ | Ja | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.30 | Checkbox | 279/327 | S. 2, Zeile „B-Plan vorhanden?“ | Nein | Ja | ankreuzen |  |  |

### 2. Planungsvorgaben seitens LBO und B-Plan (Kopien zusätzlicher Auflagen werden mit gesend

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 3 | Kontrollkästchen 3.01 | Checkbox | 101/718 |  | Keine Schallschutzanforderungen | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.02 | Checkbox | 101/695 |  | Schallschutzanforderungen infolge | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.03 | Checkbox | 137/681 |  | Auflage aus B-Plan | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.04 | Checkbox | 165/659 | S. 3, Zeile „I (S =< 55 dB)“ | I (S =< 55 dB) | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.05 | Checkbox | 232/659 | S. 3, Zeile „I (S =< 55 dB)“ | II (S =< 60 dB) | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.06 | Checkbox | 303/658 | S. 3, Zeile „I (S =< 55 dB)“ | III (S =< 65 dB) | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.07 | Checkbox | 372/658 | S. 3, Zeile „I (S =< 55 dB)“ | IV (S =< 70 dB) | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.08 | Checkbox | 444/658 | S. 3, Zeile „I (S =< 55 dB)“ | V (S =< 75 dB) | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.09 | Checkbox | 137/634 |  | Anforderungen infolge Straßen-, Bahn-, Flughafen- oder Industrielärm | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.10 | Checkbox | 164/612 | S. 3, Zeile „I (S =< 55 dB)“ | I (S =< 55 dB) | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.11 | Checkbox | 233/612 | S. 3, Zeile „I (S =< 55 dB)“ | II (S =< 60 dB) | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.12 | Checkbox | 302/612 | S. 3, Zeile „I (S =< 55 dB)“ | III (S =< 65 dB) | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.13 | Checkbox | 373/612 | S. 3, Zeile „I (S =< 55 dB)“ | IV (S =< 70 dB) | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.14 | Checkbox | 444/612 | S. 3, Zeile „I (S =< 55 dB)“ | V (S =< 75 dB) | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.15 | Checkbox | 101/554 |  | Zusätzliche Maßnahmen gegen Schallübertragung innerhalb des Gebäudes gewünscht | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.16 | Checkbox | 136/538 |  | Maßnahmen im BA eindeutig gekennzeichnet und benannt. | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.17 | Checkbox | 101/492 |  | Brandschutzanforderungen/-auflagen | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.19 | Checkbox | 135/478 |  | Maßnahmen im BA eindeutig gekennzeichnet und benannt. | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.20 | Checkbox | 136/433 |  | Fassadengestaltung/Farbe: | Ja | ankreuzen |  |  |
| 3 | Textfeld 3.01 | Text | 257/432 |  |  |  | manuell |  |  |
| 3 | Kontrollkästchen 3.21 | Checkbox | 135/417 | S. 3, Zeile „Dachform:“ | Dachform: | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.26 | Checkbox | 345/417 | S. 3, Zeile „Dachform:“ | Dachneigung: | Ja | ankreuzen |  |  |
| 3 | Textfeld 3.02 | Text | 192/415 |  | Fassadengestaltung/Farbe: |  | manuell |  |  |
| 3 | Textfeld 3.07 | Text | 412/415 |  | Dachform: |  | manuell |  |  |
| 3 | Kontrollkästchen 3.27 | Checkbox | 345/402 | S. 3, Zeile „DÜ Ortgang:“ | DÜ Traufe: | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.22 | Checkbox | 135/401 | S. 3, Zeile „DÜ Ortgang:“ | DÜ Ortgang: | Ja | ankreuzen |  |  |
| 3 | Textfeld 3.03 | Text | 198/399 |  | Dachform: |  | manuell |  |  |
| 3 | Textfeld 3.08 | Text | 401/399 |  | DÜ Ortgang: |  | manuell |  |  |
| 3 | Kontrollkästchen 3.23 | Checkbox | 136/385 | S. 3, Zeile „Dachfarbe:“ | Dachfarbe: | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.28 | Checkbox | 345/385 | S. 3, Zeile „Dachfarbe:“ | Dacheindeckung: | Ja | ankreuzen |  |  |
| 3 | Textfeld 3.04 | Text | 192/383 |  | DÜ Ortgang: |  | manuell |  |  |
| 3 | Textfeld 3.09 | Text | 427/383 |  | Dachfarbe: |  | manuell |  |  |
| 3 | Kontrollkästchen 3.24 | Checkbox | 136/369 | S. 3, Zeile „Zul. Firsthöhe:“ | Zul. Firsthöhe: | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.29 | Checkbox | 345/369 | S. 3, Zeile „Zul. Firsthöhe:“ | Zul. Traufhöhe: | Ja | ankreuzen |  |  |
| 3 | Textfeld 3.05 | Text | 206/368 |  | Dachfarbe: |  | manuell |  |  |
| 3 | Textfeld 3.10 | Text | 418/367 |  | Zul. Firsthöhe: |  | manuell |  |  |
| 3 | Kontrollkästchen 3.25 | Checkbox | 135/353 |  | Zul. Kniestockhöhe (LBO): | Ja | ankreuzen |  |  |
| 3 | Textfeld 3.06 | Text | 251/352 |  | Zul. Firsthöhe: |  | manuell |  |  |
| 3 | Textfeld 3.11 | Text | 482/351 |  | Zul. Kniestockhöhe (LBO): |  | manuell |  |  |
| 3 | Textfeld 3.12 | Text | 147/306 |  | Sonstige Vorgaben: |  | manuell |  |  |
| 3 | Textfeld 3.13 | Text | 147/293 |  |  |  | manuell |  |  |
| 3 | Textfeld 3.14 | Text | 147/280 |  |  |  | manuell |  |  |
| 3 | Textfeld 3.15 | Text | 147/266 |  |  |  | manuell |  |  |
| 3 | Textfeld 3.16 | Text | 147/253 |  |  |  | manuell |  |  |
| 4 | Textfeld 4.01 | Text | 373/750 |  | Länge x Breite |  | manuell |  |  |
| 4 | Textfeld 4.02 | Text | 373/730 |  | Bebaute Fläche |  | manuell |  |  |
| 4 | Textfeld 4.03 | Text | 373/711 |  | Quotient |  | manuell |  |  |
| 4 | Textfeld 4.04 | Text | 373/691 |  | Quotient |  | manuell |  |  |
| 4 | Textfeld 4.05 | Text | 373/671 |  | BP/KG: |  | manuell |  |  |
| 4 | Textfeld 4.06 | Text | 373/652 |  | EG: |  | manuell |  |  |
| 4 | Textfeld 4.07 | Text | 373/632 |  | OG/DG 1: |  | manuell |  |  |
| 4 | Textfeld 4.08 | Text | 373/612 |  | OG/DG 2: |  | manuell |  |  |
| 4 | Textfeld 4.09 | Text | 373/593 |  | ∑ in m³: |  | manuell | berechnet: Summe der vier Felder darüber (Formular-JavaScript) |  |
| 4 | Textfeld 4.10 | Text | 373/566 |  | BP/KG: |  | manuell |  |  |
| 4 | Textfeld 4.11 | Text | 373/546 |  | EG: |  | manuell |  |  |
| 4 | Textfeld 4.12 | Text | 373/527 |  | OG/DG 1: |  | manuell |  |  |
| 4 | Textfeld 4.13 | Text | 373/507 |  | OG/DG 2: |  | manuell |  |  |
| 4 | Textfeld 4.14 | Text | 373/489 |  | ∑ in m²: |  | manuell | berechnet: Summe der vier Felder darüber (Formular-JavaScript) |  |
| 4 | Textfeld 4.15 | Text | 373/461 |  | BP/KG: |  | manuell |  |  |
| 4 | Textfeld 4.16 | Text | 373/441 |  | EG: |  | manuell |  |  |
| 4 | Textfeld 4.17 | Text | 373/422 |  | OG/DG 1: |  | manuell |  |  |
| 4 | Textfeld 4.18 | Text | 373/402 |  | OG/DG 2: |  | manuell |  |  |
| 4 | Textfeld 4.19 | Text | 373/383 |  | ∑ in m²: |  | manuell | berechnet: Summe der vier Felder darüber (Formular-JavaScript) |  |
| 4 | Textfeld 4.20 | Text | 373/356 |  | BP/KG: |  | manuell |  |  |
| 4 | Textfeld 4.21 | Text | 373/327 |  | EG: |  | manuell |  |  |
| 4 | Textfeld 4.22 | Text | 373/307 |  | OG/DG 1: |  | manuell |  |  |
| 4 | Textfeld 4.23 | Text | 373/288 |  | OG/DG 2: |  | manuell |  |  |
| 4 | Textfeld 4.24 | Text | 373/268 |  | ∑ in m²: |  | manuell | berechnet: Summe der vier Felder darüber (Formular-JavaScript) |  |

### 3. Angaben zum Bauvorhaben

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 5 | Kontrollkästchen 5.01 | Checkbox | 102/739 |  | Einfamilienhaus | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.02 | Checkbox | 137/725 |  | Weitere Wohneinheit im EFH (siehe Anlage: | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.03 | Checkbox | 102/692 |  | Zweifamilienhaus (Planungsvorgabe | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.04 | Checkbox | 102/673 |  | Wohnhaus mit mehr als 2 Wohneinheiten | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.05 | Checkbox | 224/603 | S. 5, Zeile „Gebäudeklasse:“ | 1 | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.06 | Checkbox | 259/603 | S. 5, Zeile „Gebäudeklasse:“ | 2 | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.07 | Checkbox | 294/603 | S. 5, Zeile „Gebäudeklasse:“ | 3 | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.08 | Checkbox | 102/557 |  | Bestandsgebäude vorhanden; Abriss noch nicht erfolgt | Ja | ankreuzen |  |  |
| 5 | Textfeld 5.01 | Text | 451/554 |  | Bestandsgebäude vorhanden; Abriss noch nicht erfolgt |  | manuell |  |  |
| 5 | Kontrollkästchen 5.09 | Checkbox | 348/543 | S. 5, Zeile „Gründung des abgerissenen Gebäudes“ | Bodenplatte | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.10 | Checkbox | 482/543 | S. 5, Zeile „Gründung des abgerissenen Gebäudes“ | Keller | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.11 | Checkbox | 102/496 |  | Grenzbebauung ohne Nachbarbebauung | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.12 | Checkbox | 102/477 |  | Doppelhaushälfte | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.13 | Checkbox | 137/464 |  | Anbau an Bestand – | Ja | ankreuzen |  |  |
| 5 | Textfeld 5.02 | Text | 449/462 |  | Anbau an Bestand – |  | manuell |  |  |
| 5 | Kontrollkästchen 5.14 | Checkbox | 172/450 |  | deckungsgleich | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.15 | Checkbox | 172/437 |  | nicht deckungsgleich | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.16 | Checkbox | 136/423 |  | freistehend | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.17 | Checkbox | 348/384 | S. 5, Zeile „Gründung Bestandsgebäude:“ | Bodenplatte | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.18 | Checkbox | 482/384 | S. 5, Zeile „Gründung Bestandsgebäude:“ | Keller | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.19 | Checkbox | 445/370 | S. 5, Zeile „Anschlussarbeiten an Bestandsgebäude“ | Ja | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.20 | Checkbox | 481/370 | S. 5, Zeile „Anschlussarbeiten an Bestandsgebäude“ | Nein | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.21 | Checkbox | 102/332 |  | Fotos vom Bestandsgebäude angefügt | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.22 | Checkbox | 102/319 |  | Errichtung auf Bestandskeller geplant (Anlage | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.23 | Checkbox | 136/230 |  | Paket Energiesparhaus | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.24 | Checkbox | 136/218 |  | Paket Effizienzhaus 55 | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.25 | Checkbox | 136/206 |  | Paket Effizienzhaus 40 | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.26 | Checkbox | 136/193 |  | Paket Effizienzhaus 40 Plus | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.27 | Checkbox | 136/162 |  | Paket Passivhaus | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.28 | Checkbox | 456/125 | S. 5, Zeile „DGNB-Zertifikat:“ | Ja | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.29 | Checkbox | 488/125 | S. 5, Zeile „DGNB-Zertifikat:“ | Nein | Ja | ankreuzen |  |  |

### 5. Planungsgrundlage

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 6 | Kontrollkästchen 6.01 | Checkbox | 456/667 | S. 6, Zeile „“ | Ja | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.02 | Checkbox | 488/667 | S. 6, Zeile „“ | Nein | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.03 | Checkbox | 102/646 |  | Reichweiten, Reichhöhen, Beinfreiraum sind für ein Familienmitglied im Rollstuhl ausgelegt. | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.04 | Checkbox | 102/598 |  | Alle Haupteingänge sind stufen- und schwellenlos erreichbar. Sie weisen eine ausreichende | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.05 | Checkbox | 102/570 |  | Alle Ebenen des Gebäudes sind stufen- und schwellenlos zugänglich (z.B. mittels Treppenlift/Aufzug | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.06 | Checkbox | 102/542 |  | Die Treppe besitzt einen geraden Lauf und Setzstufen. | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.07 | Checkbox | 102/526 |  | Die Treppe ist ausreichend breit für die Nachrüstung eines Treppenlifts. | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.08 | Checkbox | 102/510 |  | Die Treppenumfassungswände sind für die Nachrüstung eines Treppenlifts verstärkt/aufgedoppelt | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.09 | Checkbox | 102/494 |  | Flure sind ausreichend breit für die Nutzung mit Gehhilfen und Rollstühlen. Maßgebend dafür ist | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.10 | Checkbox | 102/466 |  | Alle Wohnungseingangstüren und Innentüren der barrierefreien Nutzungseinheit weisen eine lichte | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.11 | Checkbox | 102/438 |  | In Wohn-, Schlaf-, Sanitärräumen und Küchen sind ausreichend Bewegungsflächen von mind. 1.50m | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.12 | Checkbox | 102/410 |  | Die Bewegungsflächen der Sanitärräume sind mind. 1.50m x 1.50m vorzusehen. Türen sind nach | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.13 | Checkbox | 102/382 |  | Zu den Nutzungseinheiten zugehörige Abstellräume müssen stufen | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.14 | Checkbox | 102/354 |  | Balkon | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.15 | Checkbox | 102/338 |  | Mindestens ein Fenster in den Wohn- und Schlafräumen sollte den Ausblick in die Umgebung in | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.16 | Checkbox | 102/310 |  | Es ist gewährleistet, dass jede barrierefreie Nutzungseinheit einen behindertengerechten Stellplatz | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.17 | Checkbox | 102/282 |  | Briefkasten und Klingel sind für einen Rollstuhlfahrer stufenlos zugänglich. | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.18 | Checkbox | 102/266 |  | Gehwege müssen ausreichend breit für die Nutzung mit dem Rollstuhl oder mit Gehhilfen, auch im | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.19 | Checkbox | 102/213 |  | Zur gefahrlosen Nutzung müssen Gehwege und Erschließungsflächen eine feste und ebene | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.20 | Checkbox | 103/161 |  | Die Greifhöhen und Bedienhöhen entsprechen der DIN 18040. | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.21 | Checkbox | 102/107 |  |  | Ja | ankreuzen |  |  |
| 6 | Textfeld 6.01 | Text | 112/106 |  | möglich diese in einem Bereich zwischen 85cm und 105cm anzuordnen. |  | manuell |  |  |
| 6 | Textfeld 6.02 | Text | 112/93 |  | möglich diese in einem Bereich zwischen 85cm und 105cm anzuordnen. |  | manuell |  |  |
| 6 | Textfeld 6.03 | Text | 112/81 |  |  |  | manuell |  |  |

### 6. Allgemeine und spezifische Angaben zur Entwässerung

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 7 | Kontrollkästchen 7.01 | Checkbox | 102/740 |  | Hebeanlage EG | Ja | ankreuzen |  |  |
| 7 | Kontrollkästchen 7.02 | Checkbox | 102/726 |  | Hebeanlage KG | Ja | ankreuzen |  |  |
| 7 | Kontrollkästchen 7.04 | Checkbox | 102/712 |  | Rückstaupumpe | Ja | ankreuzen |  |  |
| 7 | Kontrollkästchen 7.03 | Checkbox | 102/699 |  | Freies Gefälle (Freispiegelentwässerung) | Ja | ankreuzen |  |  |
| 7 | Kontrollkästchen 7.05 | Checkbox | 102/685 |  | Revisionsschacht außenliegend | Ja | ankreuzen |  |  |
| 7 | Kontrollkästchen 7.06 | Checkbox | 102/672 |  | Enthärtungsanlage | Ja | ankreuzen |  |  |
| 7 | Kontrollkästchen 7.07 | Checkbox | 102/659 |  | Kleinkläranlage | Ja | ankreuzen |  |  |
| 7 | Kontrollkästchen 7.08 | Checkbox | 102/645 | S. 7, Zeile „Entwässerung im Mischsystem“ | Entwässerung im Mischsystem | Ja | ankreuzen |  |  |
| 7 | Kontrollkästchen 7.09 | Checkbox | 311/645 | S. 7, Zeile „Entwässerung im Mischsystem“ | Entwässerung im Trennsystem | Ja | ankreuzen |  |  |
| 7 | Textfeld 7.01 | Text | 252/602 |  | Rückstauebene (RSE) über NN: |  | manuell |  |  |
| 7 | Textfeld 7.02 | Text | 164/559 |  |  |  | manuell |  |  |
| 7 | Textfeld 7.04 | Text | 436/522 |  |  |  | manuell |  |  |
| 7 | Textfeld 7.03 | Text | 164/464 |  |  |  | manuell |  |  |
| 7 | Textfeld 7.05 | Text | 437/426 |  |  |  | manuell |  |  |
| 7 | Textfeld 7.06 | Text | 221/403 |  | OKRF |  | manuell |  |  |
| 7 | Textfeld 7.07 | Text | 221/389 |  | OKRF |  | manuell |  |  |
| 7 | Kontrollkästchen 7.10 | Checkbox | 102/372 |  | Kanal wird erschlossen bis: | Ja | ankreuzen |  |  |
| 7 | Textfeld 7.08 | Text | 234/371 |  | KG: |  | manuell |  |  |

### 7. Wasserhärtebereich

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 8 | Kontrollkästchen 8.01 | Checkbox | 102/356 |  | Härtebereich | Ja | ankreuzen |  |  |
| 8 | Kontrollkästchen 8.02 | Checkbox | 102/342 |  | Härtebereich | Ja | ankreuzen |  |  |
| 8 | Kontrollkästchen 8.03 | Checkbox | 102/329 |  | Härtebereich | Ja | ankreuzen |  |  |
| 8 | Kontrollkästchen 8.04 | Checkbox | 102/316 |  | Härtebereich | Ja | ankreuzen |  |  |
| 8 | Kontrollkästchen 8.05 | Checkbox | 413/142 | S. 8, Zeile „►“ | Ja | Ja | ankreuzen |  |  |
| 8 | Kontrollkästchen 8.06 | Checkbox | 463/142 | S. 8, Zeile „►“ | Nein | Ja | ankreuzen |  |  |

### 8. Bodengutachten

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 9 | Kontrollkästchen 9.02 | Checkbox | 206/718 | S. 9, Zeile „Neubaugebiet“ | Bestandsgebiet | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.01 | Checkbox | 102/717 | S. 9, Zeile „Neubaugebiet“ | Neubaugebiet | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.03 | Checkbox | 257/686 |  | Ja, entspricht Bauherr | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.04 | Checkbox | 257/672 |  | Nein | Ja | ankreuzen |  |  |
| 9 | Textfeld 9.01 | Text | 372/670 |  | Nein |  | manuell |  |  |
| 9 | Kontrollkästchen 9.05 | Checkbox | 257/653 |  | Ja, Grundstück mit Fahrzeug erreichbar | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.06 | Checkbox | 257/639 |  | Nein | Ja | ankreuzen |  |  |
| 9 | Textfeld 9.02 | Text | 389/637 |  | Nein |  | manuell |  |  |
| 9 | Kontrollkästchen 9.07 | Checkbox | 257/620 |  | Ja | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.08 | Checkbox | 257/606 |  | Nein | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.09 | Checkbox | 257/587 |  | Ja | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.10 | Checkbox | 257/573 |  | Nein | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.11 | Checkbox | 102/542 |  | Kabel und Leitungen im Baufenster | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.12 | Checkbox | 102/522 |  | Garagen im Bodengutachten berücksichtigen | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.13 | Checkbox | 102/503 |  | Es befinden sich noch Hindernisse auf dem Grundstück | Ja | ankreuzen |  |  |
| 9 | Textfeld 9.03 | Text | 112/473 |  | (Erdaushub/Bepflanzung; |  | manuell |  |  |
| 9 | Textfeld 9.04 | Text | 112/460 |  | (Erdaushub/Bepflanzung; |  | manuell |  |  |
| 9 | Textfeld 9.05 | Text | 112/445 |  |  |  | manuell |  |  |
| 9 | Kontrollkästchen 9.14 | Checkbox | 102/429 |  | Bauherren bitten um Terminvereinbarung für Entnahme der Bodenprobe | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.15 | Checkbox | 102/307 |  | Bodenfeuchte, nicht drückendes Wasser | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.16 | Checkbox | 102/288 |  | mäßig drückendes Wasser aus Stauwasser | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.17 | Checkbox | 102/268 |  | mäßig drückendes Wasser aus HGW, HHW | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.18 | Checkbox | 102/241 |  | Bemessungswasserstand: [m] | Ja | ankreuzen |  |  |
| 9 | Textfeld 9.06 | Text | 227/239 |  | mäßig drückendes Wasser aus HGW, HHW |  | manuell |  |  |
| 9 | Kontrollkästchen 9.19 | Checkbox | 102/222 |  | Drainage | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.20 | Checkbox | 102/202 |  | Druckwasserdichte Lichtschächte erforderlich? | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.21 | Checkbox | 102/183 |  | Lichtschachtenwässerung geplant? | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.22 | Checkbox | 102/163 |  | Entwässerung Kellerabgang geplant? | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.23 | Checkbox | 102/144 |  | Entwässerung Lichthof geplant? | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.24 | Checkbox | 102/124 |  | WU | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.25 | Checkbox | 102/105 |  | Elektroinstallation unterputz? = Wandstärke 30cm | Ja | ankreuzen |  |  |

### 9. Sommerlicher Wärmeschutz

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 10 | Kontrollkästchen 10.01 | Checkbox | 102/498 |  | Diese Anforderungen sind durch den in der aktuellen Bauantragsplanung vorhandenen | Ja | ankreuzen |  |  |

### 10. Sockeldetails auf Grundlage der DIN 68800-2

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 11 | Kontrollkästchen 11.01 | Checkbox | 109/502 |  | [1] Ohne Dichtungsbahn (Standard) | Ja | ankreuzen |  |  |
| 11 | Kontrollkästchen 11.02 | Checkbox | 109/304 |  | [2] Mit Dichtungsbahn (Aufpreis) | Ja | ankreuzen |  |  |
| 12 | Kontrollkästchen 12.01 | Checkbox | 109/744 |  | [3] Mit Stufe (nicht barrierearm - Türschwelle ca. 2cm) | Ja | ankreuzen |  |  |
| 12 | Kontrollkästchen 12.02 | Checkbox | 109/546 |  | [4] Ohne Stufe (barrierearm - Türschwelle ca. 2cm) | Ja | ankreuzen |  |  |
| 12 | Kontrollkästchen 12.03 | Checkbox | 109/532 |  | [4a] | Ja | ankreuzen |  |  |
| 12 | Kontrollkästchen 12.04 | Checkbox | 108/331 |  | [4b | Ja | ankreuzen |  |  |
| 13 | Kontrollkästchen 13.01 | Checkbox | 109/744 |  | [5] Mit Stufe: TT/Parallel-Schiebe-Kipp-Tür (nicht barrierearm - Türschwelle ca. 10cm) | Ja | ankreuzen |  |  |
| 13 | Kontrollkästchen 13.02 | Checkbox | 109/546 |  | [6] Ohne Stufe: TT/Parallel-Schiebe-Kipp-Tür (nicht barrierearm - Türschwelle ca. 10cm) | Ja | ankreuzen |  |  |
| 13 | Kontrollkästchen 13.03 | Checkbox | 109/532 |  | [6a] | Ja | ankreuzen |  |  |
| 13 | Kontrollkästchen 13.04 | Checkbox | 108/331 |  | [6b | Ja | ankreuzen |  |  |
| 14 | Kontrollkästchen 14.01 | Checkbox | 109/770 |  | [7] Mit Stufe: TT (barrierearm - überfahrbare Türschwelle ca. 2cm) | Ja | ankreuzen |  |  |
| 14 | Kontrollkästchen 14.02 | Checkbox | 109/569 |  | [8] Ohne Stufe: TT (barrierearm - überfahrbare Türschwelle ca. 2cm) | Ja | ankreuzen |  |  |
| 14 | Kontrollkästchen 14.03 | Checkbox | 109/368 |  | [9] Mit Stufe: Hebe-Schiebe-Tür (barrierearm - überfahrbare Türschwelle ca. 2cm) | Ja | ankreuzen |  |  |
| 15 | Kontrollkästchen 15.01 | Checkbox | 109/770 |  | [10] Ohne Stufe: Hebe-Schiebe-Tür (barrierearm - überfahrbare Türschwelle ca. 2cm) | Ja | ankreuzen |  |  |
| 15 | Kontrollkästchen 15.02 | Checkbox | 109/546 |  | [11] Mit Stufe | Ja | ankreuzen |  |  |
| 15 | Kontrollkästchen 15.03 | Checkbox | 109/348 |  | [12] Ohne Stufe | Ja | ankreuzen |  |  |
| 16 | Kontrollkästchen 16.01 | Checkbox | 109/740 |  | [13] Terrasse mit Stufe (nicht barrierearm - Türschwelle ca. 10cm) | Ja | ankreuzen |  |  |
| 16 | Kontrollkästchen 16.02 | Checkbox | 108/726 |  | [13a] | Ja | ankreuzen |  |  |
| 16 | Kontrollkästchen 16.03 | Checkbox | 108/525 |  | [13b] | Ja | ankreuzen |  |  |
| 17 | Kontrollkästchen 17.01 | Checkbox | 108/771 |  | [14] Ohne Stufe (barrierearm - überfahrbare Schwelle ca. 2cm; Rinne umlaufend) | Ja | ankreuzen |  |  |
| 17 | Kontrollkästchen 17.02 | Checkbox | 108/569 |  | [15] Ohne Stufe (barrierearm - überfahrbare Schwelle ca. 2cm; Rinne umlaufend) | Ja | ankreuzen |  |  |

### 12. Montagebedingungen

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 18 | Kontrollkästchen 18.01 | Checkbox | 102/402 |  | Ein erhöhter Montageaufwand ist aufgrund der Baustellen- und Zufahrtsbedingungen | Ja | ankreuzen |  |  |
| 18 | Kontrollkästchen 18.02 | Checkbox | 102/342 |  | Ein ausreichend großer Kranstellplatz (8 x 10m) ist vorhanden. | Ja | ankreuzen |  |  |
| 18 | Kontrollkästchen 18.03 | Checkbox | 102/323 |  | Zufahrt zum Grundstück ist in der Höhe oder Breite durch Hindernisse | Ja | ankreuzen |  |  |
| 18 | Kontrollkästchen 18.04 | Checkbox | 102/263 |  | Halbseitige Straßensperrung | Ja | ankreuzen |  |  |
| 18 | Kontrollkästchen 18.05 | Checkbox | 102/243 |  | Vollsperrung | Ja | ankreuzen |  |  |
| 18 | Kontrollkästchen 18.06 | Checkbox | 102/224 |  | Besichtigung durch | Ja | ankreuzen |  |  |

### 13. Liefer- und Leistungsumfang Heizungssystem

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 19 | Kontrollkästchen 19.01 | Checkbox | 102/739 |  | Heizungssystem von LIVING HAUS | Ja | ankreuzen |  |  |
| 19 | Kontrollkästchen 19.02 | Checkbox | 137/725 |  | Laut Werkvertrag: | Ja | ankreuzen |  |  |
| 19 | Textfeld 19.01 | Text | 287/722 |  | Laut Werkvertrag: |  | manuell |  |  |
| 19 | Kontrollkästchen 19.03 | Checkbox | 137/712 |  | Abweichend zum Werkvertrag: | Ja | ankreuzen |  |  |
| 19 | Textfeld 19.02 | Text | 287/709 |  |  |  | manuell |  |  |
| 19 | Kontrollkästchen 19.04 | Checkbox | 102/692 |  | Fernwärmeheizung: | Ja | ankreuzen |  |  |
| 19 | Textfeld 19.03 | Text | 202/690 |  | Abweichend zum Werkvertrag: |  | manuell |  |  |
| 19 | Kontrollkästchen 19.05 | Checkbox | 102/641 |  | Beheizte Kellerräume sind im Bauantrag mit der Bezeichnung | Ja | ankreuzen |  |  |
| 19 | Kontrollkästchen 19.06 | Checkbox | 102/590 |  | Gasbrennwerttherme - Versorgung durch Erdgas | Ja | ankreuzen |  |  |
| 19 | Kontrollkästchen 19.07 | Checkbox | 102/576 |  | Gasbrennwerttherme - Versorgung durch Flüssiggas | Ja | ankreuzen |  |  |
| 19 | Kontrollkästchen 19.08 | Checkbox | 102/502 |  | bauherrenseitige Heizung | Ja | ankreuzen |  |  |
| 19 | Kontrollkästchen 19.09 | Checkbox | 102/302 |  | Die Ermittlung des Warmwasserbedarfs | Ja | ankreuzen |  |  |
| 19 | Kontrollkästchen 19.10 | Checkbox | 137/288 |  | Einplanung einer 2. Trinkwasserwärmepumpe | Ja | ankreuzen |  |  |
| 19 | Kontrollkästchen 19.11 | Checkbox | 137/275 |  | Reduzierung der Aufheizzeit mit einer Boost-Funktion (elektrischer Heizstab mit | Ja | ankreuzen |  |  |
| 19 | Kontrollkästchen 19.12 | Checkbox | 102/215 |  | Die Ermittlung des Warmwasserbedarfs | Ja | ankreuzen |  |  |
| 19 | Kontrollkästchen 19.13 | Checkbox | 137/201 |  | Einplanung eines Zusatzspeichers (Speichererweiterung 170L) | Ja | ankreuzen |  |  |
| 19 | Kontrollkästchen 19.14 | Checkbox | 137/188 |  | Erweiterung mit Zuluftmodul SAM 40 (notwendig für Kellerbeheizung, lichte | Ja | ankreuzen |  |  |

### 14. Abgassystem/Schornsteinsystem

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 20 | Kontrollkästchen 20.01 | Checkbox | 102/612 |  | Die Nachbarbebauung wurde geprüft und mit den planungsrelevanten | Ja | ankreuzen |  |  |
| 20 | Kontrollkästchen 20.02 | Checkbox | 102/585 |  | Die Höhenlage des Schornsteins wurde mit den Anforderungen der | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.01 | Checkbox | 102/752 |  | von Living Haus | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.02 | Checkbox | 102/732 |  | bauseitige Leistung | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.03 | Checkbox | 137/718 |  | Vorbereitung für einen bauseitigen Edelstahlschornstein | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.04 | Checkbox | 137/706 |  | Raumluftunabhängiges Abgassystem/Schornsteinsystem | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.05 | Checkbox | 102/458 |  | Reinigung des Schornsteins über Dach /-> Absturzsicherung erforderlich | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.06 | Checkbox | 137/444 |  | Ausstieg vom Spitzboden aus mit Dachausstiegsluke und Standflächen | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.07 | Checkbox | 137/432 |  | Ausstieg im Wohnraum über ein zugelassenes Dachflächenfenster mit Trittsteinen | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.08 | Checkbox | 137/417 |  | Anleitern von der Traufe aus, mit Trittsteinen | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.09 | Checkbox | 137/385 |  | Geländer (Abb. 14) | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.10 | Checkbox | 137/371 |  | Sicherheitsdachhaken (Abb. 74) | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.11 | Checkbox | 102/352 |  | Reinigung des Schornsteins im Gebäude | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.12 | Checkbox | 137/338 |  | Im untersten Geschoss EG/KG | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.13 | Checkbox | 137/325 |  | Im obersten Geschoss OG/DG | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.14 | Checkbox | 137/312 |  | Dachboden/Spitzboden | Ja | ankreuzen |  |  |

### 15. Hausanschluss allgemein

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 22 | Kontrollkästchen 22.01 | Checkbox | 102/739 |  | Mehrspartenhauseinführung (Lieferung bauseits) | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.02 | Checkbox | 102/726 |  | Einführung per Leerrohr | Ja | ankreuzen |  |  |

### 16. Elektroinstallation

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 22 | Kontrollkästchen 22.03 | Checkbox | 102/641 |  | Erdkabel (Leerrohr) | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.04 | Checkbox | 102/627 |  | Dachständer | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.05 | Checkbox | 102/614 |  | im Außenbereich (z.B. Hausanschlusssäule) | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.06 | Checkbox | 102/567 |  | Unterverteilung integriert im Zählerschrank (Einfamilienhaus) | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.07 | Checkbox | 102/554 |  | Allgemeinstromzähler (>= zwei Nutzungseinheiten) | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.08 | Checkbox | 137/540 |  | als Zwischenzähler | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.09 | Checkbox | 137/527 |  | als Zählerschrankerweiterung im Bereich: | Ja | ankreuzen |  |  |
| 22 | Textfeld 22.01 | Text | 334/525 |  | Allgemeinstromzähler (>= zwei Nutzungseinheiten) |  | manuell |  |  |
| 22 | Kontrollkästchen 22.10 | Checkbox | 102/514 |  | im Außenbereich (Hausanschlusssäule) | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.11 | Checkbox | 102/500 |  | Zählerschrankerweiterung für eine Wärmepumpenanlage | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.12 | Checkbox | 353/428 |  | Nein | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.13 | Checkbox | 353/415 |  | Ja | Ja | ankreuzen |  |  |
| 22 | Textfeld 22.02 | Text | 453/413 |  | Ja |  | manuell |  |  |
| 22 | Kontrollkästchen 22.14 | Checkbox | 102/395 |  | Ausführung der Photovoltaikanlage durch Living Haus gewünscht | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.15 | Checkbox | 137/375 |  | PV-Anlage gewünscht | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.16 | Checkbox | 137/362 |  | PV-Speicher gewünscht | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.17 | Checkbox | 102/343 |  | Vorbereitung für eine bauseitige Photovoltaikanlage | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.18 | Checkbox | 137/323 |  | Zählerschrankerweiterung | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.19 | Checkbox | 137/309 |  | Leerrohr vom zum | Ja | ankreuzen |  |  |
| 22 | Textfeld 22.03 | Text | 209/307 |  | Zählerschrankerweiterung |  | manuell |  |  |
| 22 | Textfeld 22.04 | Text | 344/307 |  |  |  | manuell |  |  |
| 22 | Kontrollkästchen 22.20 | Checkbox | 102/290 |  | Platzbedarf des Batteriespeichers und der Wechselrichter in der Bauantragsplanung | Ja | ankreuzen |  |  |

### 17. Betonfertiggaragen

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 22 | Kontrollkästchen 22.21 | Checkbox | 102/189 | S. 22, Zeile „Geländeniveau im Plan kenntlich gemacht“ | Geländeniveau im Plan kenntlich gemacht | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.24 | Checkbox | 311/189 | S. 22, Zeile „Geländeniveau im Plan kenntlich gemacht“ | Lage der Gararge im Plan eingezeichnet | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.22 | Checkbox | 102/176 | S. 22, Zeile „Hanglage: Anschüttung im Plan bemaßt“ | Hanglage: Anschüttung im Plan bemaßt | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.25 | Checkbox | 311/176 | S. 22, Zeile „Hanglage: Anschüttung im Plan bemaßt“ | Lage Leerrohr Strom in BP gekennzeichnet | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.23 | Checkbox | 102/149 | S. 22, Zeile „“ |  | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.26 | Checkbox | 311/149 | S. 22, Zeile „“ |  | Ja | ankreuzen |  |  |
| 22 | Textfeld 22.05 | Text | 132/129 |  |  |  | manuell |  |  |
| 22 | Textfeld 22.07 | Text | 355/129 |  |  |  | manuell |  |  |
| 22 | Textfeld 22.08 | Text | 413/112 |  |  |  | manuell |  |  |
| 22 | Textfeld 22.06 | Text | 205/110 |  |  |  | manuell |  |  |

### 18. Änderungen aus dem Bauantrag

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 23 | Kontrollkästchen 23.01 | Checkbox | 102/722 |  | Es liegen keine Änderungen vor | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.02 | Checkbox | 102/709 |  | Folgende Änderungen liegen vor: | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.03 | Checkbox | 137/695 |  | Kniestockhöhenänderung | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.04 | Checkbox | 137/681 |  | Dachneigung | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.05 | Checkbox | 137/668 |  | Dachüberstände | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.06 | Checkbox | 137/654 |  | Grundrissänderungen (Wände und/oder Fenster) | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.07 | Checkbox | 137/641 |  | Heizungs-/Lüftungssystem | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.08 | Checkbox | 137/628 |  | Geschosshöhe | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.09 | Checkbox | 137/614 |  | Energetischer Standard (ESH, KFW 55, KFW 40, oder 40+) | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.10 | Checkbox | 137/601 |  | Sonstiges: | Ja | ankreuzen |  |  |
| 23 | Textfeld 23.01 | Text | 194/599 |  | Energetischer Standard (ESH, KFW 55, KFW 40, oder 40+) |  | manuell |  |  |
| 23 | Textfeld 23.02 | Text | 194/586 |  | Sonstiges: |  | manuell |  |  |

### 19. Checkliste Bauantragserstellung - Zu erstellende und abzugebende Unterlagen:

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 23 | Kontrollkästchen 23.11 | Checkbox | 102/470 |  | Original unterschriebene Bauantragspläne | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.12 | Checkbox | 103/456 |  | Lageplan/Katasterauszug | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.13 | Checkbox | 102/443 |  | Entwässerungsplanung inkl. Kanalplanung | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.14 | Checkbox | 102/429 |  | Vollständiger Bauantrag inkl. Textteil | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.15 | Checkbox | 102/416 |  | Bebauungsplan | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.16 | Checkbox | 102/402 |  | Planungsprotokoll mit Anlagen | Ja | ankreuzen |  |  |
| 23 | Textfeld 23.04 | Text | 319/260 |  | _ |  | manuell |  |  |
| 23 | Textfeld 23.03 | Text | 111/259 |  | Ort: |  | manuell |  |  |
| 23 | Textfeld 23.05 | Text | 111/221 |  | Architekt: |  | manuell |  |  |
| 23 | Textfeld 23.06 | Text | 319/221 |  | _ |  | manuell |  |  |
| 23 | Kontrollkästchen 23.17 | Checkbox | 102/189 |  | FB-22-100-11_LH_Angaben_zur_Nachbarbebauung | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.18 | Checkbox | 102/179 |  | FB-22-310-13_LH_Angaben_zum_Edelstahlschornstein | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.19 | Checkbox | 102/169 |  | FB-22-260-17_LH_Angaben_zum_Fenstereinbau | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.20 | Checkbox | 102/159 |  | FB-22-100-19_LH_Hinweispflicht_Planung_Nutzung_Wohneinheiten | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.21 | Checkbox | 102/149 |  | FB-22-310-24_LH_Merkblatt_zur_Ermittlung_des_Warmwasserbedarf_WKH | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.22 | Checkbox | 102/140 |  | FB-22-310-25_LH_Merkblatt_zur_Ermittlung_des_Warmwasserbedarf_Nibe_Abluftwärmepumpe | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.23 | Checkbox | 102/130 |  | FB-22-100-26_LH_Planungsvorgaben_DGNB_Zertifikat | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.24 | Checkbox | 102/120 |  | FB-22-100-27_LH_Merkblatt_Gewerbe | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.25 | Checkbox | 102/110 |  | FB-22-310-28_LH_Fernwärme | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.26 | Checkbox | 102/101 |  | FB-22-490-29_LH_Checkliste_Bestandskeller | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.01 | Checkbox | 102/740 |  | Spannweite Decke EG | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.02 | Checkbox | 102/722 |  | Spannweite Mittelpfette -> max. 6.00m | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.03 | Checkbox | 102/703 |  | Lastabtragung bei bauseitigen Balkon -> Kein Lastabtrag über Außenwand | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.04 | Checkbox | 102/685 |  | Ablastung prüfen | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.05 | Checkbox | 102/667 |  | Wandstärke aus BLB mit der geforderten Effizienzklassen aus der Leistungszusammenstellung | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.06 | Checkbox | 102/636 |  | Traufhöhen mit Living Haus-Systemschnitt abgeglichen | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.07 | Checkbox | 102/618 |  | Traufhöhe mit der geforderten Effizienzklasse aus der Leistungszusammenstellung ermittelt | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.08 | Checkbox | 102/600 |  | Deckenspannrichtung mit der Entwässerungsführung abgeglichen | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.09 | Checkbox | 102/581 |  | Dachterrasse/Loggia mit Fehldecke, bei einer Spannweite von > 3.50m geplant -> Maßsystem | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.10 | Checkbox | 102/563 |  | Lage des Schornsteins in Bezug auf Lage zur Mittelpfette/Firstpfette geprüft | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.11 | Checkbox | 102/545 |  | Giebelseitiger Dachüberstand > 50cm mit stehender Fußpfette | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.12 | Checkbox | 102/526 |  | Ab Erdbebenzone 2, Beplankung Innenwände + 13mm beachtet -> | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.13 | Checkbox | 102/508 |  | Mindestabstände Giebelfenster zur Traufe geprüft -> Liste in PBP beachten | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.14 | Checkbox | 102/490 |  | Belichtungsfläche nach LBO berücksichtigt | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.15 | Checkbox | 102/472 |  | Lage der Kniestockfenster beachtet | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.16 | Checkbox | 102/453 |  | Zweiter Rettungsweg geplant | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.17 | Checkbox | 102/435 |  | Größe des Technikraums mit Haustechnikraumblätter abgestimmt - Aufstellung KG Höhen beachten | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.18 | Checkbox | 102/416 |  | Frischluftzufuhr Proxon bzw. Wohnraumlüftung beachtet | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.19 | Checkbox | 102/398 |  | Badezimmer: Kopffreiheit Dusche im DG / Abstandsflächen und Bewegungsflächen | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.20 | Checkbox | 102/380 |  | Entlüftung über Dach: Mindestabstände zu den Dachflächenfenstern geprüft | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.21 | Checkbox | 102/362 |  | Leistungszusammenstellung in Bezug auf die verkaufte Gebäudetechnik ausgewertet | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.22 | Checkbox | 102/343 |  | Mindestabstand > 25cm bei DFF, Solar, PV zu Dachaufbauten etc. beachtet | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.23 | Checkbox | 102/325 |  | Planungsvorgabe für Zweifamilienhäuser beachtet | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.24 | Checkbox | 102/307 |  | Schallschutzmaßnahmen und -vorgaben beachtet | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.25 | Checkbox | 102/289 |  | Arbeitsräume TGA | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.26 | Checkbox | 102/270 |  | Brandschutzmaßnahmen Schornstein beachtet -> LH - Werksnorm bzw. Mindestabstände | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.27 | Checkbox | 102/252 |  | Schornsteinreinigung mit Bezirksschornsteinfegermeister abgestimmt | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.28 | Checkbox | 102/233 |  | Feuerungsverordnung und Novelle der 1. BimSchV; §19 vom 01.01.2022 beachtet | Ja | ankreuzen |  |  |
| 24 | Textfeld 24.01 | Text | 184/186 |  | Ort und Datum: |  | manuell |  |  |
| 24 | Textfeld 24.02 | Text | 185/140 |  | Architekt: |  | manuell |  |  |

## Bien-Zenker: FB-22-201-03 Planungsprotokoll Bauantrag

24 Seiten, 423 Felder (423 Widgets): 136 Text, 287 Checkbox. Vorbefüllbar 51 (davon im Modell: ja 9, teilweise 14, fehlt 28), manuell 85, ankreuzen 287.


### 0. Kopfdaten und Projektbeteiligte

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Textfeld 1.01 | Text | 177/756 |  | Nr.: |  | vorbefüllbar | Projekt-/BV-Nr. der Hausbaufirma: projects.hausbau_nr (offene Frage: dieselbe Nummer?) | ja |
| 1 | Textfeld 1.02 | Text | 207/736 |  | Name: |  | vorbefüllbar | Bauherr Name: bauherren.name (+ name2), sonst projects.bauherr_label | ja |
| 1 | Textfeld 1.03 | Text | 207/716 |  | Straße: |  | vorbefüllbar | Bauherr Straße: Teil von bauherren.address (eine Zeile, wird aufgeteilt) | teilweise |
| 1 | Textfeld 1.05 | Text | 381/716 |  | PLZ/Ort: |  | vorbefüllbar | Bauherr PLZ/Ort: Teil von bauherren.address | teilweise |
| 1 | Textfeld 1.04 | Text | 207/696 |  | Mobil: |  | vorbefüllbar | Bauherr Mobil: bauherren.phone (Telefon und Mobil nicht getrennt) | teilweise |
| 1 | Textfeld 1.06 | Text | 381/696 |  | E-Mail: |  | vorbefüllbar | Bauherr E-Mail: bauherren.email | ja |
| 1 | Textfeld 1.07 | Text | 243/675 |  | Straße/Baugebiet: |  | vorbefüllbar | Bauort Straße/Baugebiet: Teil von bauherren.building_address | teilweise |
| 1 | Textfeld 1.10 | Text | 381/675 |  | PLZ/Ort: |  | vorbefüllbar | Bauort PLZ/Ort: PLZ aus bauherren.building_address, Ort aus projects.location | teilweise |
| 1 | Textfeld 1.08 | Text | 224/655 |  | Gemarkung: |  | vorbefüllbar | Gemarkung: projects.gemarkung | ja |
| 1 | Textfeld 1.11 | Text | 400/655 |  | Gemeindeteil: |  | vorbefüllbar | Gemeindeteil/Ortsteil: fehlt | fehlt |
| 1 | Textfeld 1.09 | Text | 231/635 |  | Flur/Flurstück: |  | vorbefüllbar | Flur/Flurstück: projects.flurstueck (Flur nicht getrennt) | teilweise |
| 1 | Textfeld 1.12 | Text | 394/635 |  | Bundesland: |  | vorbefüllbar | Bundesland: fehlt (Annahme Baden-Württemberg, besser aus der PLZ) | fehlt |
| 1 | Textfeld 1.14 | Text | 410/614 |  | Tel.: |  | vorbefüllbar | Architekt Telefon: Bürodaten ABM (nicht im Modell) | fehlt |
| 1 | Textfeld 1.15 | Text | 410/594 |  | Mobil: |  | vorbefüllbar | Architekt Mobil: Bürodaten ABM (nicht im Modell) | fehlt |
| 1 | Textfeld 1.13 | Text | 178/574 |  | Architekt: |  | vorbefüllbar | Architekt: team_members.name (über projects.architect_id) | ja |
| 1 | Textfeld 1.16 | Text | 410/574 |  | E-Mail: |  | vorbefüllbar | Architekt E-Mail: Bürodaten ABM (nicht im Modell) | fehlt |
| 1 | Textfeld 1.29 | Text | 410/554 |  | Tel.: |  | vorbefüllbar | Vermessungsbüro Telefon: project_parties[vermesser].contact (eine Zeile) | teilweise |
| 1 | Textfeld 1.28 | Text | 410/534 |  | Mobil: |  | vorbefüllbar | Vermessungsbüro Mobil: project_parties[vermesser].contact (eine Zeile) | fehlt |
| 1 | Textfeld 1.17 | Text | 178/513 |  | Vermessungsbüro: |  | vorbefüllbar | Vermessungsbüro: project_parties[vermesser].name | ja |
| 1 | Textfeld 1.27 | Text | 410/513 |  | E-Mail: |  | vorbefüllbar | Vermessungsbüro E-Mail: project_parties[vermesser].contact (eine Zeile) | teilweise |
| 1 | Textfeld 1.32 | Text | 410/493 |  | Tel.: |  | vorbefüllbar | Kellerbauer/Bodenplatte Telefon: Rolle fehlt | fehlt |
| 1 | Textfeld 1.31 | Text | 410/473 |  | Mobil: |  | vorbefüllbar | Kellerbauer/Bodenplatte Mobil: Rolle fehlt | fehlt |
| 1 | Textfeld 1.18 | Text | 178/452 |  | Bodenplatte: |  | vorbefüllbar | Kellerbauer/Bodenplatte: Rolle fehlt (Altspalte bauherren.basement_builder ungenutzt) | fehlt |
| 1 | Textfeld 1.30 | Text | 410/452 |  | Mail: |  | vorbefüllbar | Kellerbauer/Bodenplatte E-Mail: Rolle fehlt | fehlt |
| 1 | Textfeld 1.35 | Text | 410/432 |  | Tel.: |  | vorbefüllbar | Erdbau-Unternehmen Telefon: project_parties[erdbauer].contact (eine Zeile) | teilweise |
| 1 | Textfeld 1.34 | Text | 410/412 |  | Mobil: |  | vorbefüllbar | Erdbau-Unternehmen Mobil: project_parties[erdbauer].contact (eine Zeile) | fehlt |
| 1 | Textfeld 1.19 | Text | 178/392 |  | unternehmen: |  | vorbefüllbar | Erdbau-Unternehmen: project_parties[erdbauer].name | ja |
| 1 | Textfeld 1.33 | Text | 410/392 |  | Mail: |  | vorbefüllbar | Erdbau-Unternehmen E-Mail: project_parties[erdbauer].contact (eine Zeile) | teilweise |
| 1 | Textfeld 1.38 | Text | 410/371 |  | Tel.: |  | vorbefüllbar | Bauaufsicht/Bauamt Telefon: Rolle fehlt | fehlt |
| 1 | Textfeld 1.37 | Text | 410/351 |  | Mobil: |  | vorbefüllbar | Bauaufsicht/Bauamt Mobil: Rolle fehlt | fehlt |
| 1 | Textfeld 1.20 | Text | 178/331 |  | Genehmigungs- |  | vorbefüllbar | Bauaufsicht/Bauamt: Rolle fehlt | fehlt |
| 1 | Textfeld 1.36 | Text | 410/330 |  | Mail: |  | vorbefüllbar | Bauaufsicht/Bauamt E-Mail: Rolle fehlt | fehlt |
| 1 | Textfeld 1.41 | Text | 410/310 |  | Tel.: |  | vorbefüllbar | Schornsteinfeger Telefon: Rolle fehlt | fehlt |
| 1 | Textfeld 1.40 | Text | 410/290 |  | Mobil: |  | vorbefüllbar | Schornsteinfeger Mobil: Rolle fehlt | fehlt |
| 1 | Textfeld 1.21 | Text | 178/270 |  | Schornsteinfeger: |  | vorbefüllbar | Schornsteinfeger: Rolle fehlt | fehlt |
| 1 | Textfeld 1.39 | Text | 410/270 |  | Mail: |  | vorbefüllbar | Schornsteinfeger E-Mail: Rolle fehlt | fehlt |
| 1 | Textfeld 1.44 | Text | 410/249 |  | Tel.: |  | vorbefüllbar | Versorger Strom Telefon: project_parties[strom].contact (eine Zeile) | teilweise |
| 1 | Textfeld 1.22 | Text | 178/229 |  | Strom: |  | vorbefüllbar | Versorger Strom: project_parties[strom].name | ja |
| 1 | Textfeld 1.43 | Text | 410/229 |  | Mail: |  | vorbefüllbar | Versorger Strom E-Mail: project_parties[strom].contact (eine Zeile) | teilweise |
| 1 | Textfeld 1.42 | Text | 410/209 |  | Tel.: |  | vorbefüllbar | Versorger Gas Telefon: Rolle fehlt | fehlt |
| 1 | Textfeld 1.23 | Text | 178/189 |  | Gas: |  | vorbefüllbar | Versorger Gas: Rolle fehlt | fehlt |
| 1 | Textfeld 1.47 | Text | 410/189 |  | Mail: |  | vorbefüllbar | Versorger Gas E-Mail: Rolle fehlt | fehlt |
| 1 | Textfeld 1.46 | Text | 410/168 |  | Tel.: |  | vorbefüllbar | Versorger Fernwärme Telefon: Rolle fehlt | fehlt |
| 1 | Textfeld 1.24 | Text | 178/148 |  | Fernwärme: |  | vorbefüllbar | Versorger Fernwärme: Rolle fehlt | fehlt |
| 1 | Textfeld 1.45 | Text | 410/148 |  | Mail: |  | vorbefüllbar | Versorger Fernwärme E-Mail: Rolle fehlt | fehlt |
| 1 | Textfeld 1.50 | Text | 410/128 |  | Tel.: |  | vorbefüllbar | Versorger Wasser Telefon: project_parties[wasser].contact (eine Zeile) | teilweise |
| 1 | Textfeld 1.25 | Text | 178/108 |  | Wasser: |  | vorbefüllbar | Versorger Wasser: project_parties[wasser].name | ja |
| 1 | Textfeld 1.49 | Text | 410/107 |  | Mail: |  | vorbefüllbar | Versorger Wasser E-Mail: project_parties[wasser].contact (eine Zeile) | teilweise |
| 1 | Textfeld 1.48 | Text | 410/87 |  | Tel.: |  | vorbefüllbar | Abwasser Telefon: Rolle fehlt | fehlt |
| 1 | Textfeld 1.51 | Text | 410/67 |  | E-Mail: |  | vorbefüllbar | Abwasser E-Mail: Rolle fehlt | fehlt |
| 1 | Textfeld 1.26 | Text | 178/66 |  | Abwasser: |  | vorbefüllbar | Abwasser: Rolle fehlt | fehlt |

### 1. Allgemeine Angaben für den Bauantrag

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 2 | Kontrollkästchen 2.01 | Checkbox | 406/737 | S. 2, Zeile „Höhe über NN (in m)“ | RFB | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.02 | Checkbox | 449/737 | S. 2, Zeile „Höhe über NN (in m)“ | FFB | Ja | ankreuzen |  |  |
| 2 | Textfeld 2.01 | Text | 204/735 |  | Allgemeine Angaben für den Bauantrag |  | manuell |  |  |
| 2 | Kontrollkästchen 2.03 | Checkbox | 334/710 | S. 2, Zeile „Schneelastzone“ | 1 | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.04 | Checkbox | 370/710 | S. 2, Zeile „Schneelastzone“ | 1a | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.07 | Checkbox | 502/710 | S. 2, Zeile „Schneelastzone“ | 3 | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.05 | Checkbox | 417/709 | S. 2, Zeile „Schneelastzone“ | 2 | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.06 | Checkbox | 454/709 | S. 2, Zeile „Schneelastzone“ | 2a | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.08 | Checkbox | 137/684 | S. 2, Zeile „Ja“ | Ja | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.09 | Checkbox | 171/684 | S. 2, Zeile „Ja“ | Nein | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.10 | Checkbox | 137/670 |  | Maßnahmen im BA eindeutig gekennzeichnet und benannt. | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.11 | Checkbox | 315/643 | S. 2, Zeile „Erdbebenzone“ | keine | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.12 | Checkbox | 375/643 | S. 2, Zeile „Erdbebenzone“ | 0 | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.13 | Checkbox | 418/643 | S. 2, Zeile „Erdbebenzone“ | 1 | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.14 | Checkbox | 460/643 | S. 2, Zeile „Erdbebenzone“ | 2 | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.15 | Checkbox | 503/643 | S. 2, Zeile „Erdbebenzone“ | 3 | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.16 | Checkbox | 357/589 | S. 2, Zeile „Wasserschutzzone“ | keine | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.17 | Checkbox | 418/589 | S. 2, Zeile „Wasserschutzzone“ | 1 | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.18 | Checkbox | 461/589 | S. 2, Zeile „Wasserschutzzone“ | 2 | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.19 | Checkbox | 503/589 | S. 2, Zeile „Wasserschutzzone“ | 3 | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.20 | Checkbox | 136/562 |  | BA im Genehmigungsverfahren | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.21 | Checkbox | 136/549 |  | BA im Anzeigeverfahren | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.22 | Checkbox | 136/536 |  | BA im Anzeigeverfahren | Ja | ankreuzen |  |  |
| 2 | Textfeld 2.02 | Text | 147/507 |  | Befreiungs-/Abweichungsantrag erforderlich für: |  | manuell |  |  |
| 2 | Textfeld 2.03 | Text | 147/493 |  | Befreiungs-/Abweichungsantrag erforderlich für: |  | manuell |  |  |
| 2 | Textfeld 2.04 | Text | 147/479 |  |  |  | manuell |  |  |
| 2 | Textfeld 2.05 | Text | 147/466 |  |  |  | manuell |  |  |
| 2 | Textfeld 2.06 | Text | 147/452 |  |  |  | manuell |  |  |
| 2 | Kontrollkästchen 2.23 | Checkbox | 392/428 |  | Ja | Ja | ankreuzen |  |  |
| 2 | Textfeld 2.07 | Text | 447/426 |  | Ja |  | manuell |  |  |
| 2 | Kontrollkästchen 2.24 | Checkbox | 393/415 |  | Nein | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.25 | Checkbox | 392/388 |  | Ja | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.26 | Checkbox | 392/374 |  | Nein | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.27 | Checkbox | 358/349 | S. 2, Zeile „Entfernung zu Nord“ | Radius < 30km | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.28 | Checkbox | 443/349 | S. 2, Zeile „Entfernung zu Nord“ | Radius > 30km | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.29 | Checkbox | 238/321 | S. 2, Zeile „B“ | Ja | Ja | ankreuzen |  |  |
| 2 | Kontrollkästchen 2.30 | Checkbox | 278/321 | S. 2, Zeile „B“ | Nein | Ja | ankreuzen |  |  |

### 2. Planungsvorgaben seitens LBO und B-Plan (Kopien zusätzlicher Auflagen werden mit gesend

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 3 | Kontrollkästchen 3.01 | Checkbox | 101/712 |  | Keine Schallschutzanforderungen | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.02 | Checkbox | 101/689 |  | Schallschutzanforderungen infolge | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.03 | Checkbox | 137/675 |  | Auflage aus B | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.04 | Checkbox | 164/653 | S. 3, Zeile „I (S“ | I (S | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.07 | Checkbox | 373/653 | S. 3, Zeile „I (S“ | IV (S | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.05 | Checkbox | 233/652 | S. 3, Zeile „I (S“ | II ( | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.06 | Checkbox | 302/652 | S. 3, Zeile „I (S“ | III ( | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.08 | Checkbox | 446/652 | S. 3, Zeile „I (S“ | V ( | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.09 | Checkbox | 137/628 |  | Anforderungen infolge Straßen | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.10 | Checkbox | 164/606 | S. 3, Zeile „I (S“ | I (S | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.11 | Checkbox | 233/606 | S. 3, Zeile „I (S“ | II ( | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.12 | Checkbox | 302/606 | S. 3, Zeile „I (S“ | III ( | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.13 | Checkbox | 373/606 | S. 3, Zeile „I (S“ | IV (S | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.14 | Checkbox | 446/606 | S. 3, Zeile „I (S“ | V ( | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.15 | Checkbox | 101/548 |  | Zusätzliche Maßnahmen gegen Schallübertragung innerhalb des Gebäudes gewünscht | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.16 | Checkbox | 136/532 |  | Maßnahmen im BA eindeutig gekennzeichnet und benannt. | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.17 | Checkbox | 101/486 |  | Brandschutzanforderungen/ | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.19 | Checkbox | 135/472 |  | Maßnahmen im BA eindeutig gekennzeichnet und benannt. | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.20 | Checkbox | 136/427 |  | Fassadengestaltung/Farbe: | Ja | ankreuzen |  |  |
| 3 | Textfeld 3.01 | Text | 257/426 |  | Fassadengestaltung/Farbe: |  | manuell |  |  |
| 3 | Kontrollkästchen 3.21 | Checkbox | 135/411 | S. 3, Zeile „Dachform:“ | Dachform: | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.26 | Checkbox | 345/411 | S. 3, Zeile „Dachform:“ | Dachneigung: | Ja | ankreuzen |  |  |
| 3 | Textfeld 3.02 | Text | 192/409 |  | Dachform: |  | manuell |  |  |
| 3 | Textfeld 3.07 | Text | 411/409 |  | Dachneigung: |  | manuell |  |  |
| 3 | Kontrollkästchen 3.27 | Checkbox | 345/396 | S. 3, Zeile „DÜ Ortgang:“ | DÜ Traufe: | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.22 | Checkbox | 135/395 | S. 3, Zeile „DÜ Ortgang:“ | DÜ Ortgang: | Ja | ankreuzen |  |  |
| 3 | Textfeld 3.03 | Text | 198/393 |  | DÜ Ortgang: |  | manuell |  |  |
| 3 | Textfeld 3.08 | Text | 401/393 |  | DÜ Traufe: |  | manuell |  |  |
| 3 | Kontrollkästchen 3.23 | Checkbox | 136/379 | S. 3, Zeile „Dachfarbe:“ | Dachfarbe: | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.28 | Checkbox | 345/379 | S. 3, Zeile „Dachfarbe:“ | Dacheindeckung: | Ja | ankreuzen |  |  |
| 3 | Textfeld 3.04 | Text | 192/377 |  | Dachfarbe: |  | manuell |  |  |
| 3 | Textfeld 3.09 | Text | 427/377 |  | Dacheindeckung: |  | manuell |  |  |
| 3 | Kontrollkästchen 3.24 | Checkbox | 135/363 | S. 3, Zeile „Zul. Firsthöhe:“ | Zul. Firsthöhe: | Ja | ankreuzen |  |  |
| 3 | Kontrollkästchen 3.29 | Checkbox | 345/363 | S. 3, Zeile „Zul. Firsthöhe:“ | Zul. | Ja | ankreuzen |  |  |
| 3 | Textfeld 3.05 | Text | 206/362 |  | Zul. Firsthöhe: |  | manuell |  |  |
| 3 | Textfeld 3.10 | Text | 418/361 |  | Traufhöhe: |  | manuell |  |  |
| 3 | Kontrollkästchen 3.25 | Checkbox | 135/347 |  | Zul. Kniestockhöhe | Ja | ankreuzen |  |  |
| 3 | Textfeld 3.06 | Text | 251/346 |  | (LBO): |  | manuell |  |  |
| 3 | Textfeld 3.11 | Text | 482/345 |  | einem lichten Kniestock von: |  | manuell |  |  |
| 3 | Textfeld 3.12 | Text | 147/300 |  | Sonstige Vorgaben |  | manuell |  |  |
| 3 | Textfeld 3.13 | Text | 147/287 |  |  |  | manuell |  |  |
| 3 | Textfeld 3.14 | Text | 147/274 |  |  |  | manuell |  |  |
| 3 | Textfeld 3.15 | Text | 147/260 |  |  |  | manuell |  |  |
| 3 | Textfeld 3.16 | Text | 147/247 |  |  |  | manuell |  |  |
| 4 | Textfeld 4.01 | Text | 373/744 |  | Länge x Breite |  | manuell |  |  |
| 4 | Textfeld 4.02 | Text | 373/724 |  | Bebaute Fläche |  | manuell |  |  |
| 4 | Textfeld 4.03 | Text | 373/705 |  | Quotient |  | manuell |  |  |
| 4 | Textfeld 4.04 | Text | 373/685 |  | Quotient |  | manuell |  |  |
| 4 | Textfeld 4.05 | Text | 373/666 |  | BP/KG: |  | manuell |  |  |
| 4 | Textfeld 4.06 | Text | 373/646 |  | EG: |  | manuell |  |  |
| 4 | Textfeld 4.07 | Text | 373/626 |  | OG/DG 1: |  | manuell |  |  |
| 4 | Textfeld 4.08 | Text | 373/607 |  | OG/DG 2: |  | manuell |  |  |
| 4 | Textfeld 4.09 | Text | 373/587 |  | : |  | manuell | berechnet: Summe der vier Felder darüber (Formular-JavaScript) |  |
| 4 | Textfeld 4.10 | Text | 373/560 |  | BP/KG: |  | manuell |  |  |
| 4 | Textfeld 4.11 | Text | 373/541 |  | EG: |  | manuell |  |  |
| 4 | Textfeld 4.12 | Text | 373/521 |  | OG/DG 1: |  | manuell |  |  |
| 4 | Textfeld 4.13 | Text | 373/502 |  | OG/DG 2: |  | manuell |  |  |
| 4 | Textfeld 4.14 | Text | 373/483 |  | in m²: |  | manuell | berechnet: Summe der vier Felder darüber (Formular-JavaScript) |  |
| 4 | Textfeld 4.15 | Text | 373/455 |  | BP/KG: |  | manuell |  |  |
| 4 | Textfeld 4.16 | Text | 373/436 |  | EG: |  | manuell |  |  |
| 4 | Textfeld 4.17 | Text | 373/416 |  | OG/DG 1: |  | manuell |  |  |
| 4 | Textfeld 4.18 | Text | 373/396 |  | OG/DG 2: |  | manuell |  |  |
| 4 | Textfeld 4.19 | Text | 373/377 |  | in m²: |  | manuell | berechnet: Summe der vier Felder darüber (Formular-JavaScript) |  |
| 4 | Textfeld 4.20 | Text | 373/351 |  | BP/KG: |  | manuell |  |  |
| 4 | Textfeld 4.21 | Text | 373/322 |  | EG: |  | manuell |  |  |
| 4 | Textfeld 4.22 | Text | 373/302 |  | OG/DG 1: |  | manuell |  |  |
| 4 | Textfeld 4.23 | Text | 373/282 |  | OG/DG 2: |  | manuell |  |  |
| 4 | Textfeld 4.24 | Text | 373/263 |  | in m²: |  | manuell | berechnet: Summe der vier Felder darüber (Formular-JavaScript) |  |

### 3. Angaben zum Bauvorhaben

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 5 | Kontrollkästchen 5.01 | Checkbox | 102/733 |  | Einfamilienhaus | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.02 | Checkbox | 137/719 |  | Weitere Wohneinheit im EFH (siehe Anlage: | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.03 | Checkbox | 102/687 |  | Zweifamilienhaus (Planungsvorgabe | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.04 | Checkbox | 102/667 |  | Wohnhaus mit mehr als 2 Wohneinheiten | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.05 | Checkbox | 224/597 | S. 5, Zeile „Gebäudeklasse:“ | 1 | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.06 | Checkbox | 259/597 | S. 5, Zeile „Gebäudeklasse:“ | 2 | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.07 | Checkbox | 294/597 | S. 5, Zeile „Gebäudeklasse:“ | 3 | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.08 | Checkbox | 102/551 |  | Bestandsgebäude vorhanden; Abriss noch nicht erfolgt | Ja | ankreuzen |  |  |
| 5 | Textfeld 5.01 | Text | 451/548 |  | Bestandsgebäude vorhanden; Abriss noch nicht erfolgt |  | manuell |  |  |
| 5 | Kontrollkästchen 5.09 | Checkbox | 348/537 | S. 5, Zeile „Gründung des abgerissenen Gebäudes“ | Bodenplatte | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.10 | Checkbox | 481/537 | S. 5, Zeile „Gründung des abgerissenen Gebäudes“ | Keller | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.11 | Checkbox | 102/491 |  | Grenzbebauung ohne Nachbarbebauung | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.12 | Checkbox | 102/471 |  | Doppelhaushälfte | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.13 | Checkbox | 137/458 |  | Anbau an Bestand – | Ja | ankreuzen |  |  |
| 5 | Textfeld 5.02 | Text | 449/456 |  | Anbau an Bestand – |  | manuell |  |  |
| 5 | Kontrollkästchen 5.14 | Checkbox | 172/444 |  | deckungsgleich | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.15 | Checkbox | 172/431 |  | nicht deckungsgleich | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.16 | Checkbox | 135/417 |  | freistehend | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.17 | Checkbox | 348/378 | S. 5, Zeile „Gründung Bestandsgebäude:“ | Bodenplatte | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.18 | Checkbox | 481/378 | S. 5, Zeile „Gründung Bestandsgebäude:“ | Keller | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.19 | Checkbox | 445/365 | S. 5, Zeile „Anschlussarbeiten an Bestandsgebäude“ | Ja | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.20 | Checkbox | 481/364 | S. 5, Zeile „Anschlussarbeiten an Bestandsgebäude“ | Nein | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.21 | Checkbox | 102/326 |  | Fotos vom Bestandsgebäude angefügt | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.22 | Checkbox | 102/313 |  | Errichtung auf Bestandskeller geplant (Anlage | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.23 | Checkbox | 135/224 |  | Paket Energiesparhaus | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.24 | Checkbox | 136/212 |  | Paket Effizienzhaus 55 | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.25 | Checkbox | 136/200 |  | Paket Effizienzhaus 40 | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.26 | Checkbox | 136/187 |  | Paket Effizienzhaus 40 Plus | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.27 | Checkbox | 136/156 |  | Paket Passivhaus | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.28 | Checkbox | 456/120 | S. 5, Zeile „DGNB-Zertifikat:“ | Ja | Ja | ankreuzen |  |  |
| 5 | Kontrollkästchen 5.29 | Checkbox | 488/120 | S. 5, Zeile „DGNB-Zertifikat:“ | Nein | Ja | ankreuzen |  |  |

### 5. Planungsgrundlage

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 6 | Kontrollkästchen 6.01 | Checkbox | 457/661 | S. 6, Zeile „“ | Ja | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.02 | Checkbox | 488/661 | S. 6, Zeile „“ | Nein | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.03 | Checkbox | 102/640 |  | Reichweiten | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.04 | Checkbox | 102/592 |  | Alle Haupteingänge sind stufen | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.05 | Checkbox | 102/564 |  | Alle Ebenen des Gebäudes sind stufen | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.06 | Checkbox | 102/536 |  | Die Treppe besitzt einen geraden Lauf und Setzstufen. | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.07 | Checkbox | 102/520 |  | Die Treppe ist ausreichend breit für die Nachrüstung eines Treppenlifts. | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.08 | Checkbox | 102/503 |  | Die Treppenumfassungswände sind für die Nachrüstung eines Treppenlifts verstärkt/aufgedoppelt | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.09 | Checkbox | 102/487 |  | Flure sind ausreichend breit für die Nutzung mit Gehhilfen und Rollstühlen. Maßgebend dafür ist | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.10 | Checkbox | 102/460 |  | Alle Wohnungseingangstüren und Innentüren der bar | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.11 | Checkbox | 102/432 |  | In Wohn | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.12 | Checkbox | 102/403 |  | Die Bewegungsflächen der Sanitärräume sind mind. 1.50m x 1.50m vorzusehen. Türen sind nach | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.13 | Checkbox | 102/376 |  | Zu den Nutzungseinheiten zugehörige Abstellräume müssen stufen | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.14 | Checkbox | 102/347 |  | Balkon | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.15 | Checkbox | 102/332 |  | Mindestens ein Fenster in den Wohn | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.16 | Checkbox | 102/304 |  | Es ist gewährleistet, dass jede barrierefreie Nutzungseinheit einen behindertengerechten Stellplatz | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.17 | Checkbox | 102/276 |  | Briefkasten und Klingel sind für einen Rollstuhlfahrer stufenlos zugänglich. | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.18 | Checkbox | 102/260 |  | Gehwege müssen ausreichend | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.19 | Checkbox | 102/207 |  | Zur gefahrlosen Nutzung müssen Gehwege und Erschließungsflächen eine feste und ebene | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.20 | Checkbox | 102/154 |  | Die Greifhöhen und Bedienhöhen entsprechen der DIN 18040. | Ja | ankreuzen |  |  |
| 6 | Kontrollkästchen 6.21 | Checkbox | 102/101 |  |  | Ja | ankreuzen |  |  |
| 6 | Textfeld 6.01 | Text | 111/100 |  | möglich diese in einem Bereich zwischen 85cm und 105cm anzuordnen. |  | manuell |  |  |
| 6 | Textfeld 6.02 | Text | 111/87 |  | möglich diese in einem Bereich zwischen 85cm und 105cm anzuordnen. |  | manuell |  |  |
| 6 | Textfeld 6.03 | Text | 111/75 |  |  |  | manuell |  |  |

### 6. Allgemeine und spezifische Angaben zur Entwässerung

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 7 | Kontrollkästchen 7.01 | Checkbox | 102/733 |  | Hebeanlage EG | Ja | ankreuzen |  |  |
| 7 | Kontrollkästchen 7.02 | Checkbox | 102/719 |  | Hebe | Ja | ankreuzen |  |  |
| 7 | Kontrollkästchen 7.04 | Checkbox | 102/706 |  | Rückstaupumpe | Ja | ankreuzen |  |  |
| 7 | Kontrollkästchen 7.03 | Checkbox | 102/692 |  | Freies Gefälle (Freispiegelentwässerung) | Ja | ankreuzen |  |  |
| 7 | Kontrollkästchen 7.05 | Checkbox | 102/679 |  | Revisionsschacht außenliegend | Ja | ankreuzen |  |  |
| 7 | Kontrollkästchen 7.06 | Checkbox | 102/666 |  | Enthärtungsanlage | Ja | ankreuzen |  |  |
| 7 | Kontrollkästchen 7.07 | Checkbox | 102/652 |  | Kleinkläranlage | Ja | ankreuzen |  |  |
| 7 | Kontrollkästchen 7.08 | Checkbox | 102/639 | S. 7, Zeile „Entwässerung im Mischsystem“ | Entwässerung im Mischsystem | Ja | ankreuzen |  |  |
| 7 | Kontrollkästchen 7.09 | Checkbox | 311/639 | S. 7, Zeile „Entwässerung im Mischsystem“ | Entwässerung im Trennsystem | Ja | ankreuzen |  |  |
| 7 | Textfeld 7.01 | Text | 252/596 |  | Rückstauebene (RSE) über NN: |  | manuell |  |  |
| 7 | Textfeld 7.02 | Text | 164/553 |  |  |  | manuell |  |  |
| 7 | Textfeld 7.04 | Text | 437/516 |  |  |  | manuell |  |  |
| 7 | Textfeld 7.03 | Text | 164/458 |  |  |  | manuell |  |  |
| 7 | Textfeld 7.05 | Text | 437/420 |  |  |  | manuell |  |  |
| 7 | Textfeld 7.06 | Text | 221/397 |  | OKRF |  | manuell |  |  |
| 7 | Textfeld 7.07 | Text | 221/383 |  | OKRF |  | manuell |  |  |
| 7 | Kontrollkästchen 7.10 | Checkbox | 102/366 |  | Kanal wird erschlossen | Ja | ankreuzen |  |  |
| 7 | Textfeld 7.08 | Text | 234/365 |  | Kanal wird erschlossen |  | manuell |  |  |

### 7. Wasserhärtebereich/Regenwassernutzung

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 8 | Kontrollkästchen 8.01 | Checkbox | 102/344 |  | Härtebereich | Ja | ankreuzen |  |  |
| 8 | Kontrollkästchen 8.02 | Checkbox | 102/330 |  | Härtebereich | Ja | ankreuzen |  |  |
| 8 | Kontrollkästchen 8.03 | Checkbox | 102/317 |  | Härtebereich | Ja | ankreuzen |  |  |
| 8 | Kontrollkästchen 8.04 | Checkbox | 102/304 |  | Härtebereich | Ja | ankreuzen |  |  |
| 8 | Kontrollkästchen 8.05 | Checkbox | 413/130 | S. 8, Zeile „►“ | Ja | Ja | ankreuzen |  |  |
| 8 | Kontrollkästchen 8.06 | Checkbox | 463/130 | S. 8, Zeile „►“ | Nein | Ja | ankreuzen |  |  |

### 8. Bodengutachten

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 9 | Kontrollkästchen 9.02 | Checkbox | 206/712 | S. 9, Zeile „Neubaugebiet“ | Bestandsgebiet | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.01 | Checkbox | 102/711 | S. 9, Zeile „Neubaugebiet“ | Neubaugebiet | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.03 | Checkbox | 257/680 |  | Ja, entspricht Bauherr | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.04 | Checkbox | 257/666 |  | Nein | Ja | ankreuzen |  |  |
| 9 | Textfeld 9.01 | Text | 372/664 |  | - |  | manuell |  |  |
| 9 | Kontrollkästchen 9.05 | Checkbox | 257/647 |  | Ja | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.06 | Checkbox | 257/633 |  | Nein | Ja | ankreuzen |  |  |
| 9 | Textfeld 9.02 | Text | 389/631 |  | - |  | manuell |  |  |
| 9 | Kontrollkästchen 9.07 | Checkbox | 257/614 |  | Ja | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.08 | Checkbox | 257/600 |  | Nein | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.09 | Checkbox | 257/581 |  | Ja | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.10 | Checkbox | 257/567 |  | Nein | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.11 | Checkbox | 102/536 |  | Kabel und Leitungen im Baufenster | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.12 | Checkbox | 102/516 |  | Garagen im Bodengutachten berücksichtigen | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.13 | Checkbox | 102/496 |  | Es befinden sich noch Hindernisse auf dem Grundstück | Ja | ankreuzen |  |  |
| 9 | Textfeld 9.03 | Text | 112/467 |  | (Erdaushub/Bepflanzung; |  | manuell |  |  |
| 9 | Textfeld 9.04 | Text | 112/454 |  | (Erdaushub/Bepflanzung; |  | manuell |  |  |
| 9 | Textfeld 9.05 | Text | 112/439 |  |  |  | manuell |  |  |
| 9 | Kontrollkästchen 9.14 | Checkbox | 102/423 |  | Bauherren bitten um Terminvereinbarung für Entnahme der Bodenprobe | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.15 | Checkbox | 102/301 |  | Bodenfeuchte, nicht drückendes Wasser | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.16 | Checkbox | 102/282 |  | mäßig drückendes Wasser aus Stauwasser | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.17 | Checkbox | 102/262 |  | mäßig drückendes Wasser aus HGW, HHW | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.18 | Checkbox | 102/235 |  | Bemessungswasserstand: [m] | Ja | ankreuzen |  |  |
| 9 | Textfeld 9.06 | Text | 227/233 |  | mäßig drückendes Wasser aus HGW, HHW |  | manuell |  |  |
| 9 | Kontrollkästchen 9.19 | Checkbox | 102/216 |  | Drainage | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.20 | Checkbox | 102/196 |  | Druckwasserdichte Lichtschächte erforderlich? | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.21 | Checkbox | 102/177 |  | Lichtschachtenwässerung geplant? | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.22 | Checkbox | 102/157 |  | Entwässerung Kellerabgang geplant? | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.23 | Checkbox | 102/137 |  | Entwässerung Lichthof geplant? | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.24 | Checkbox | 102/118 |  | WU-Keller erforderlich? | Ja | ankreuzen |  |  |
| 9 | Kontrollkästchen 9.25 | Checkbox | 102/99 |  | Elektroinstallation unterputz? = Wandstärke 30cm | Ja | ankreuzen |  |  |

### 9. Sommerlicher Wärmeschutz

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 10 | Kontrollkästchen 10.01 | Checkbox | 102/492 |  | Diese Anforderungen sind durch den in der aktuellen Bauantragsplanung vorhandenen | Ja | ankreuzen |  |  |

### 10. Sockeldetails auf Grundlage der DIN 68800-2

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 11 | Kontrollkästchen 11.01 | Checkbox | 109/496 |  | [1] Ohne Dichtungsbahn (Standard) | Ja | ankreuzen |  |  |
| 11 | Kontrollkästchen 11.02 | Checkbox | 109/298 |  | [2 | Ja | ankreuzen |  |  |
| 12 | Kontrollkästchen 12.01 | Checkbox | 109/738 |  | [ | Ja | ankreuzen |  |  |
| 12 | Kontrollkästchen 12.02 | Checkbox | 109/540 |  | [4 | Ja | ankreuzen |  |  |
| 12 | Kontrollkästchen 12.03 | Checkbox | 109/526 |  | [4a | Ja | ankreuzen |  |  |
| 12 | Kontrollkästchen 12.04 | Checkbox | 108/325 |  | [4b | Ja | ankreuzen |  |  |
| 13 | Kontrollkästchen 13.01 | Checkbox | 108/738 |  | [ | Ja | ankreuzen |  |  |
| 13 | Kontrollkästchen 13.02 | Checkbox | 109/540 |  | [6 | Ja | ankreuzen |  |  |
| 13 | Kontrollkästchen 13.03 | Checkbox | 108/526 |  | [6 | Ja | ankreuzen |  |  |
| 13 | Kontrollkästchen 13.04 | Checkbox | 108/325 |  | [6b | Ja | ankreuzen |  |  |
| 14 | Kontrollkästchen 14.01 | Checkbox | 109/764 |  | [ | Ja | ankreuzen |  |  |
| 14 | Kontrollkästchen 14.02 | Checkbox | 109/563 |  | [ | Ja | ankreuzen |  |  |
| 14 | Kontrollkästchen 14.03 | Checkbox | 109/362 |  | [ | Ja | ankreuzen |  |  |
| 15 | Kontrollkästchen 15.01 | Checkbox | 108/764 |  | [ | Ja | ankreuzen |  |  |
| 15 | Kontrollkästchen 15.02 | Checkbox | 109/540 |  | 11 | Ja | ankreuzen |  |  |
| 15 | Kontrollkästchen 15.03 | Checkbox | 109/344 |  | [ | Ja | ankreuzen |  |  |
| 16 | Kontrollkästchen 16.01 | Checkbox | 109/734 |  | [13 | Ja | ankreuzen |  |  |
| 16 | Kontrollkästchen 16.02 | Checkbox | 108/720 |  | [13 | Ja | ankreuzen |  |  |
| 16 | Kontrollkästchen 16.03 | Checkbox | 108/519 |  | [13 | Ja | ankreuzen |  |  |
| 17 | Kontrollkästchen 17.01 | Checkbox | 109/764 |  | [ | Ja | ankreuzen |  |  |
| 17 | Kontrollkästchen 17.02 | Checkbox | 109/563 |  | [ | Ja | ankreuzen |  |  |

### 12. Montagebedingungen

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 18 | Kontrollkästchen 18.01 | Checkbox | 102/396 |  | Ein erhöhter Montageaufwand ist aufgrund der Baustellen | Ja | ankreuzen |  |  |
| 18 | Kontrollkästchen 18.02 | Checkbox | 102/336 |  | Ein ausreichend großer Kranstellplatz (8 x 10m) ist vorhanden. | Ja | ankreuzen |  |  |
| 18 | Kontrollkästchen 18.03 | Checkbox | 102/317 |  | Zufahrt zum Grundstück ist in der Höhe oder Breite durch Hindernisse | Ja | ankreuzen |  |  |
| 18 | Kontrollkästchen 18.04 | Checkbox | 102/257 |  | Halbseitige Straßensperrung | Ja | ankreuzen |  |  |
| 18 | Kontrollkästchen 18.05 | Checkbox | 102/237 |  | Vollsperrung | Ja | ankreuzen |  |  |
| 18 | Kontrollkästchen 18.06 | Checkbox | 102/218 |  | Besichtigung durch Bien | Ja | ankreuzen |  |  |

### 13. Liefer- und Leistungsumfang Heizungssystem

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 19 | Kontrollkästchen 19.01 | Checkbox | 102/733 |  | Heizungssystem von BIEN | Ja | ankreuzen |  |  |
| 19 | Kontrollkästchen 19.02 | Checkbox | 137/719 |  | Laut Werkvertrag | Ja | ankreuzen |  |  |
| 19 | Textfeld 19.01 | Text | 287/716 |  | : |  | manuell |  |  |
| 19 | Kontrollkästchen 19.03 | Checkbox | 137/706 |  | Abweichend zum Werkvertrag: | Ja | ankreuzen |  |  |
| 19 | Textfeld 19.02 | Text | 287/703 |  |  |  | manuell |  |  |
| 19 | Kontrollkästchen 19.04 | Checkbox | 102/686 |  | Fernwärmeheizung: | Ja | ankreuzen |  |  |
| 19 | Textfeld 19.03 | Text | 202/684 |  | Abweichend zum Werkvertrag: |  | manuell |  |  |
| 19 | Kontrollkästchen 19.05 | Checkbox | 102/635 |  | Beheizte Kellerräume sind im Bauantrag mit der Bezeichnung | Ja | ankreuzen |  |  |
| 19 | Kontrollkästchen 19.06 | Checkbox | 102/584 |  | Gasbrennwerttherme - Versorgung durch Erdgas | Ja | ankreuzen |  |  |
| 19 | Kontrollkästchen 19.07 | Checkbox | 102/570 |  | Gasbrennwerttherme - Versorgung durch Flüssiggas | Ja | ankreuzen |  |  |
| 19 | Kontrollkästchen 19.08 | Checkbox | 102/496 |  | bauherrenseitige Heizung | Ja | ankreuzen |  |  |
| 19 | Kontrollkästchen 19.09 | Checkbox | 102/296 |  | Die Ermittlung des Warmwasserbedarfs | Ja | ankreuzen |  |  |
| 19 | Kontrollkästchen 19.10 | Checkbox | 137/282 |  | Einplanung einer 2. Trinkwasserwärmepumpe | Ja | ankreuzen |  |  |
| 19 | Kontrollkästchen 19.11 | Checkbox | 137/269 |  | Reduzierung der Aufheizzeit mit einer Boost | Ja | ankreuzen |  |  |
| 19 | Kontrollkästchen 19.12 | Checkbox | 102/209 |  | Die Ermittlung des Warmwasserbedarfs | Ja | ankreuzen |  |  |
| 19 | Kontrollkästchen 19.13 | Checkbox | 137/195 |  | Einplanung eines Zusatzspeichers (Speichererweiterung 170L) | Ja | ankreuzen |  |  |
| 19 | Kontrollkästchen 19.14 | Checkbox | 137/182 |  | Erweiterung mit Zuluftmodul SAM 40 (notwendig für Kellerbeheizung, lichte | Ja | ankreuzen |  |  |

### 14. Abgassystem/Schornsteinsystem

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 20 | Kontrollkästchen 20.01 | Checkbox | 102/606 |  | Die Nachbarbebauung wurde geprüft und mit den planungsrelevanten | Ja | ankreuzen |  |  |
| 20 | Kontrollkästchen 20.02 | Checkbox | 102/579 |  | Die Höhenlage des Schornsteins wurde mit den Anforderungen der | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.01 | Checkbox | 102/745 |  | von Bien-Zenker | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.02 | Checkbox | 102/726 |  | bauseitige Leistung | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.03 | Checkbox | 137/712 |  | Vorbereitung für einen bauseitigen Edelstahlschornstein | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.04 | Checkbox | 137/699 |  | Raumluftunabhängiges Abgassystem/Schornsteinsystem | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.05 | Checkbox | 102/451 |  | Reinigung des Schornsteins über Dach /-> Absturzsicherung erforderlich | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.06 | Checkbox | 137/437 |  | Ausstieg vom Spitzboden aus mit Dachausstiegsluke und Standflächen | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.07 | Checkbox | 137/424 |  | Ausstieg im Wohnraum über ein zugelassenes Dachflächenfenster, mit Trittsteinen | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.08 | Checkbox | 137/410 |  | Anleitern von der Traufe aus, mit Trittsteinen | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.09 | Checkbox | 137/378 |  | Geländer (Abb. 14) | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.10 | Checkbox | 137/364 |  | Sicherheitsdachhaken (Abb. 74) | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.11 | Checkbox | 102/345 |  | Reinigung des Schornsteins im Gebäude | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.12 | Checkbox | 137/331 |  | Im untersten Geschoss EG/KG | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.13 | Checkbox | 137/318 |  | Im obersten Geschoss OG/DG | Ja | ankreuzen |  |  |
| 21 | Kontrollkästchen 21.14 | Checkbox | 137/305 |  | Dachboden/Spitzboden | Ja | ankreuzen |  |  |

### 15. Hausanschluss allgemein

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 22 | Kontrollkästchen 22.01 | Checkbox | 102/733 |  | Mehrspartenhauseinführung (Lieferung bauseits) | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.02 | Checkbox | 102/719 |  | Einführung per Leerrohr | Ja | ankreuzen |  |  |

### 16. Elektroinstallation

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 22 | Kontrollkästchen 22.03 | Checkbox | 102/634 |  | Erdkabel (Leerrohr) | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.04 | Checkbox | 102/621 |  | Dachständer | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.05 | Checkbox | 102/608 |  | im Außenbereich (z.B. Hausanschlusssäule) | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.06 | Checkbox | 102/561 |  | Unterverteilung integriert im Zählerschrank (Einfamilienhaus) | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.07 | Checkbox | 102/548 |  | Allgemeinstromzähler (>= zwei Nutzungseinheiten) | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.08 | Checkbox | 137/534 |  | als | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.09 | Checkbox | 137/521 |  | als | Ja | ankreuzen |  |  |
| 22 | Textfeld 22.01 | Text | 334/519 |  | als |  | manuell |  |  |
| 22 | Kontrollkästchen 22.10 | Checkbox | 102/508 |  | im Außenbereich (Hausanschlusssäule) | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.11 | Checkbox | 102/494 |  | Zählerschrankerweiterung für eine Wärmepumpenanlage | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.12 | Checkbox | 353/422 |  | Nein | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.13 | Checkbox | 353/409 |  | Ja | Ja | ankreuzen |  |  |
| 22 | Textfeld 22.02 | Text | 453/407 |  | > Größe und/oder kwp |  | manuell |  |  |
| 22 | Kontrollkästchen 22.14 | Checkbox | 102/389 |  | Ausführung der | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.15 | Checkbox | 137/369 |  | PV | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.16 | Checkbox | 137/356 |  | PV | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.17 | Checkbox | 102/337 |  | Vorbereitung für eine bauseitige | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.18 | Checkbox | 137/317 |  | Zählerschrankerweiterung | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.19 | Checkbox | 137/303 |  | Leerrohr vom zum | Ja | ankreuzen |  |  |
| 22 | Textfeld 22.03 | Text | 210/301 |  | Zählerschrankerweiterung |  | manuell |  |  |
| 22 | Textfeld 22.04 | Text | 344/301 |  |  |  | manuell |  |  |
| 22 | Kontrollkästchen 22.20 | Checkbox | 102/284 |  | Platzbedarf des Batteriespeichers und der Wechselrichter in der Bauantragsplanung | Ja | ankreuzen |  |  |

### 17. Betonfertiggaragen

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 22 | Kontrollkästchen 22.21 | Checkbox | 102/183 | S. 22, Zeile „Geländeniveau im Plan kenntlich gemacht“ | Geländeniveau im Plan kenntlich gemacht | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.24 | Checkbox | 311/183 | S. 22, Zeile „Geländeniveau im Plan kenntlich gemacht“ | Lage der Gararge im Plan eingezeichnet | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.22 | Checkbox | 102/170 | S. 22, Zeile „Hanglage: Anschüttung im Plan bemaßt“ | Hanglage: Anschüttung im Plan bemaßt | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.25 | Checkbox | 311/170 | S. 22, Zeile „Hanglage: Anschüttung im Plan bemaßt“ | Lage Leerrohr Strom in BP gekennzeichnet | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.23 | Checkbox | 102/143 | S. 22, Zeile „“ |  | Ja | ankreuzen |  |  |
| 22 | Kontrollkästchen 22.26 | Checkbox | 311/143 | S. 22, Zeile „“ |  | Ja | ankreuzen |  |  |
| 22 | Textfeld 22.05 | Text | 131/123 |  |  |  | manuell |  |  |
| 22 | Textfeld 22.07 | Text | 355/123 |  |  |  | manuell |  |  |
| 22 | Textfeld 22.08 | Text | 413/106 |  |  |  | manuell |  |  |
| 22 | Textfeld 22.06 | Text | 204/104 |  |  |  | manuell |  |  |

### 18. Änderungen aus dem Bauantrag

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 23 | Kontrollkästchen 23.01 | Checkbox | 102/716 |  | Es liegen keine Änderungen vor | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.02 | Checkbox | 102/702 |  | Folgende Änderungen liegen vor: | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.03 | Checkbox | 137/689 |  | Kniestockhöhenänderung | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.04 | Checkbox | 137/675 |  | Dachneigung | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.05 | Checkbox | 137/662 |  | Dachüberstände | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.06 | Checkbox | 137/648 |  | Grundrissänderungen (Wände und/oder Fenster) | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.07 | Checkbox | 137/635 |  | Heizungs | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.08 | Checkbox | 137/622 |  | Geschosshöhe | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.09 | Checkbox | 137/608 |  | Energetischer Standard (ESH, KFW 55, KFW 40, oder 40+) | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.10 | Checkbox | 137/594 |  | Sonstiges: | Ja | ankreuzen |  |  |
| 23 | Textfeld 23.01 | Text | 194/592 |  | Energetischer Standard (ESH, KFW 55, KFW 40, oder 40+) |  | manuell |  |  |
| 23 | Textfeld 23.02 | Text | 194/579 |  | Sonstiges: |  | manuell |  |  |

### 19. Checkliste Bauantragserstellung - Zu erstellende und abzugebende Unterlagen:

| Seite | Feldname | Typ | Pos. x/y | Gruppe | Beschriftung | Werte | Klasse | Quelle | Modell |
|---|---|---|---|---|---|---|---|---|---|
| 23 | Kontrollkästchen 23.11 | Checkbox | 102/450 |  | Original unterschriebene Bauantragspläne | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.12 | Checkbox | 102/437 |  | Lageplan/Katasterauszug | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.13 | Checkbox | 102/424 |  | Entwässerungsplanung inkl. Kanalplanung | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.14 | Checkbox | 102/410 |  | Vollständiger Bauantrag inkl. Textteil | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.15 | Checkbox | 102/397 |  | Bebauungsplan | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.16 | Checkbox | 102/383 |  | Planungsprotokoll mit Anlagen | Ja | ankreuzen |  |  |
| 23 | Textfeld 23.03 | Text | 111/240 |  | Ort: |  | manuell |  |  |
| 23 | Textfeld 23.04 | Text | 319/240 |  | Datum: |  | manuell |  |  |
| 23 | Textfeld 23.05 | Text | 111/202 |  | Architekt: |  | manuell |  |  |
| 23 | Textfeld 23.06 | Text | 319/201 |  | Bauherren: |  | manuell |  |  |
| 23 | Kontrollkästchen 23.17 | Checkbox | 102/169 |  | FB-22-100-11_Angaben_zur_Nachbarbebauung | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.18 | Checkbox | 102/159 |  | FB-22-310-13_Angaben_zum_Edelstahlschornstein | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.19 | Checkbox | 102/150 |  | FB-22-260-17_Angaben_zum_Fenstereinbau | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.20 | Checkbox | 102/140 |  | FB-22-100-19_Hinweispflicht_Planung_Nutzung_Wohneinheiten | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.21 | Checkbox | 102/130 |  | FB-22-310-24_Merkblatt_zur_Ermittlung_des_Warmwasserbedarf_WKH | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.22 | Checkbox | 102/120 |  | FB-22-310-25_Merkblatt_zur_Ermittlung_des_Warmwasserbedarf_Nibe_Abluftwärmepumpe | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.23 | Checkbox | 102/110 |  | FB-22-100-26_Planungsvorgaben_DGNB_Zertifikat | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.24 | Checkbox | 102/101 |  | FB-22-100-27_Merkblatt_Gewerbe | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.25 | Checkbox | 102/91 |  | FB-22-310-28_Fernwärme | Ja | ankreuzen |  |  |
| 23 | Kontrollkästchen 23.26 | Checkbox | 102/81 |  | FB-22-490-29_Checkliste_Bestandskeller | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.01 | Checkbox | 102/734 |  | Spannweite Decke EG | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.02 | Checkbox | 102/716 |  | Spannweite Mittelpfette | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.03 | Checkbox | 102/697 |  | Lastabtragung bei bauseitigen Balkon | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.04 | Checkbox | 102/679 |  | Ablastung prüfen | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.05 | Checkbox | 102/661 |  | Wandstärke aus BLB mit der geforderten Effizienzklassen aus der Leistungszusammenstellung | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.06 | Checkbox | 102/630 |  | Traufhöhen mit Bien | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.07 | Checkbox | 102/612 |  | Traufhöhe mit der geforderten Effizienzklasse aus der Leistungszusammenstellung ermittelt | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.08 | Checkbox | 102/594 |  | Deckenspannrichtung mit der Entwässerungsführung abgeglichen | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.09 | Checkbox | 102/576 |  | Dachterrasse/Loggia mit Fehldecke, bei einer Spannweite von > 3.50m geplant | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.10 | Checkbox | 102/557 |  | Lage des Schornsteins in Bezug auf Lage zur Mittelpfette/Firstpfette geprüft | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.11 | Checkbox | 102/539 |  | Giebelseitiger Dachüberstand > 50cm mit stehender Fußpfette | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.12 | Checkbox | 102/521 |  | Ab Erdbebenzone 2, Beplankung Innenwände + 13mm beachtet | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.13 | Checkbox | 102/502 |  | Mindestabstände Giebelfenster zur Traufe geprüft | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.14 | Checkbox | 102/484 |  | Belichtungsfläche nach LBO berücksichtigt | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.15 | Checkbox | 102/466 |  | Lage der Kniestockfenster beachtet | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.16 | Checkbox | 102/447 |  | Zweiter Rettungsweg geplant | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.17 | Checkbox | 102/429 |  | Größe des Technikraums mit Haustechnikraumblätter abgestimmt | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.18 | Checkbox | 102/411 |  | Frischluftzufuhr Proxon bzw. Wohnraumlüftung beachtet | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.19 | Checkbox | 102/392 |  | Badezimmer: Kopffreiheit Dusche im DG / Abstandsflächen | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.20 | Checkbox | 102/374 |  | Entlüftung über Dach: Mindestabstände zu den Dachflächenfenstern geprüft | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.21 | Checkbox | 102/356 |  | Leistungszusammenstellung in Bezug auf die verkaufte Gebäudetechnik ausgewertet | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.22 | Checkbox | 102/337 |  | Mindestabstand > 25cm bei DFF, Solar, PV zu Dachaufbauten etc. beachtet | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.23 | Checkbox | 102/319 |  | Planungsvorgabe für Zweifamilienhäuser beachtet | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.24 | Checkbox | 102/301 |  | Schallschutzmaßnahmen und | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.25 | Checkbox | 102/283 |  | Arbeitsräume TGA | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.26 | Checkbox | 102/264 |  | Brandschutzmaßnahmen Schornstein beachtet | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.27 | Checkbox | 102/246 |  | Schornsteinreinigung mit Bezirksschornsteinfegermeister abgestimmt | Ja | ankreuzen |  |  |
| 24 | Kontrollkästchen 24.28 | Checkbox | 102/227 |  | Feuerungsverordnung und Novelle der 1. BimSchV; §19 vom 01.01.2022 beachtet | Ja | ankreuzen |  |  |
| 24 | Textfeld 24.01 | Text | 184/180 |  | Ort und Datum: |  | manuell |  |  |
| 24 | Textfeld 24.02 | Text | 185/134 |  | Architekt: |  | manuell |  |  |

