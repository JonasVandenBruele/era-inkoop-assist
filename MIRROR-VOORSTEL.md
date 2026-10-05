# ERAForce-mirror: inventaris en voorstel

Stand van 5/10/2026. Alles hieronder komt uit **lezende** API-aanvragen: tellingen (`COUNT()`), metadata (describe) en een steekproef van 200 records per object om de grootte te meten. De inhoud van die steekproef is meteen weggegooid. Er is nog niets naar de SSD geschreven.

## 1. ERAForce-toegang

| Punt | Bevinding |
|---|---|
| Aanmelding | `sf org login web` door Jonas zelf, met 2FA. Org `00D24000000pvB7EAI` (erabelgium), profiel en rol "ERA LEUS & TOYE (Zaventem)". |
| API | REST v68 en Bulk API 2.0 zijn beschikbaar. |
| Limieten | 639.000 API-aanvragen per dag voor de hele org (±249k al gebruikt). 10.000 Bulk-queryjobs per dag. |
| Objecten | 893 in totaal, waarvan 698 opvraagbaar. Alle kernobjecten zijn *replicateable*: gewijzigde en verwijderde records zijn apart op te vragen, dus enkel de wijzigingen ophalen werkt. |
| Rechten | De mirror gebruikt jouw gebruiker, en die mag ook schrijven. Salesforce dwingt dus niet af dat de mirror alleen leest. Lokaal laat de code enkel GET- en query-aanvragen toe. Echt technisch afgedwongen alleen-lezen kan pas met een aparte integratiegebruiker met leesrechten, en die moet de ERA-beheerder maken. |

## 2. SSD

| Punt | Bevinding |
|---|---|
| Identiteit | SanDisk "Extreme SSD", USB-serienummer `323034353054343031363334`, volume-UUID `C68B5339-8F6C-3A14-A15A-DAD387169645`. Het schijfnummer wisselt (disk3 of disk4), daarom controleer ik altijd het serienummer en de UUID, nooit de naam. |
| Bestandssysteem | Journaled HFS+, 999,9 GB, schrijfbaar, eigenaarsrechten uit. |
| Vrije ruimte | **984,2 GB** (916,6 GiB) vrij, 98,4 %. |
| Inhoud | Er staan GoPro-video's op. Die blijven onaangeroerd: de mirror schrijft enkel in `ERAForce-mirror/`. |
| Versleuteling | **Niet versleuteld.** Verlies je de SSD, dan ligt de klantdata open. Zie voorstel §6. |

## 3. Omvang

**Methode.** Ik heb records geteld per object en per scope. De gemiddelde JSON-grootte per record komt uit de steekproef (200 recente records, alle velden). Een SQLite-database is kleiner dan JSON: geen veldnamen per record en geen lege velden. Ik reken 35–60 % van de JSON-grootte en tel daar 30–50 % bij voor indexen en een zoekindex op de evaluatieteksten.

| Scope | Records | Download (eerste import) | Op de SSD (SQLite) |
|---|---|---|---|
| **A**: enkel mijn records | 16.700 | 0,12 GB (0,11 GiB) | 0,05–0,11 GB |
| **B**: kantoor Leus & Toye (38 gebruikers) | 1,21 miljoen | 7,7 GB (7,2 GiB) | **3,5–6,9 GB (3,3–6,4 GiB)** |
| **C**: alles wat ik mag zien, ook ERA-breed | ±8 miljoen | 27,9 GB (26,0 GiB) | 12,7–25,1 GB (11,8–23,4 GiB) |

Scope C bevat een aanname: het aantal Taken dat je mag zien is niet te tellen (de query loopt tegen een Salesforce-limiet), dus ik ga uit van ±450.000.

**Dagelijkse wijzigingen bij scope B** (gemiddelde over de laatste 7 dagen):

- ±10.600 records per dag, ±80 MB per dag verspreid over twee runs. Reken op 50–200 MB per dag.
- De meeste wijzigingen zitten bij Leads (±3.700 per dag) en Workflow-items (±4.100 per dag), wellicht automatische veldupdates.
- Per run is dat ±100–300 API-aanvragen, minder dan 0,1 % van de daglimiet.
- Bulk API 2.0 levert CSV, wat kleiner is dan JSON. De echte download valt dus eerder lager uit.
- Duur van de eerste import: ±15–40 minuten, afhankelijk van je internetverbinding.

## 4. Wat ik opneem en uitsluit

**Opnemen (scope B), alle gewone velden inclusief de evaluatieteksten:**

- **Kern:** Lead, Contact, Account, Opportunity, Task, Event.
- **ERA-specifiek:** ERA_Object__c, ProspectContacts__c, ERA_Rollen__c, ERA_Workflow_Item__c, ERA_Zoekopdracht__c, ERA_Verslag__c, ERA_Publicatie__c, Onderhandeling__c, Bezoekmoment__c.
- **VMA:** VMA_item__c, VMA_item_correction__c, SchattingsverslagItem__c.
- **Documenten:** ERA_Document__c, maar enkel de metadata (naam, type, datum, koppeling). Geen bestand.
- **Opzoektabellen:** User (namen), RecordType en de keuzelijstwaarden.

**Uitsluiten:**

- **Bestanden en bijlagen:** ContentVersion, ContentDocument, ContentBody, Attachment, Attachment__c, Document, renditions, FeedItem, FeedAttachment. Geen foto's, PDF's, presentaties, audio of video.
- **Grote inhoud:** velden van het type base64 en externe downloadlinks vraag ik niet op. Ik zet ze al in de aanvraag uit, en filter ze niet pas achteraf.
- **ERA-brede massatabellen:** ERA_Mariage__c (2,7 miljoen) en ERA_Object_Item__c (2,7 miljoen). Kan later als een module ze nodig heeft.
- **Rest:** history- en share-tabellen, systeemlogs en het ERA-brede deel van scope C. Later uitbreidbaar, bv. alle ERA_Object__c voor VMA (+±4 GB).

## 5. Werking

- **Eerste import:** via Bulk API 2.0, alleen lezen.
- **Updates:** om 07:00 en 19:00 haal ik alles op met `SystemModstamp >` het laatste tijdstip. Verwijderde records komen via `getDeleted`/`queryAll` en worden lokaal als verwijderd gemarkeerd.
- **Opslag:** SQLite-database met één tabel per object en een zoekindex op de evaluatieteksten. Een tabel `_sync` houdt per object het laatste tijdstip, de aantallen en de duur bij. Dat is technische metadata, geen klantinhoud.
- **Planner:** launchd op je Mac. Een gemiste run, omdat de Mac sliep, loopt bij het ontwaken alsnog. Staat de Mac uit, dan haalt de volgende run alles in. Het vaste wekmoment `pmset` (06:55/18:55) moet jij met je wachtwoord instellen, maar het is optioneel.
- **Veiligheid bij elke run:** eerst controleer ik het serienummer, de UUID en de map. Klopt er iets niet, of is de SSD niet aangesloten, dan stopt de run. Er wordt nooit naar de interne schijf of een lege map uitgeweken, en je krijgt een macOS-melding.
- **Aanmelden:** blijft via de Salesforce CLI. Het token staat versleuteld op de interne schijf, met de sleutel in de macOS-sleutelhanger. Het staat nooit op de SSD, in git of in logs. Verloopt het, dan krijg je een melding en meld je zelf opnieuw aan met 2FA.
- **Back-ups:** elke nacht een kopie van de database op de SSD: 7 dagelijkse en 4 wekelijkse, samen ±40–70 GB. Dat beschermt tegen een kapotte sync, maar niet tegen verlies van de SSD zelf.
- **Kosten:** € 0.

## 6. Mijn voorstel

1. Scope **B** (kantoor), met de objecten uit §4. Dat is ±3,5–7 GB op de SSD en ±80 MB per dag.
2. **Versleuteling zonder te formatteren.** Op de SSD komt een versleuteld schijfkopiebestand (APFS sparsebundle) `ERAForce-mirror.sparsebundle`. Het wachtwoord kies je zelf en het komt in je macOS-sleutelhanger. De mirror leeft daarbinnen, de video's blijven ongemoeid. Je moet dit wachtwoord één keer zelf ingeven in het macOS-venster.
3. Eerste import één keer, daarna automatisch om 07:00 en 19:00 via launchd.
4. Bij ERA vragen om een leesgebruiker voor de integratie (aanbevolen, niet blokkerend).
5. Oxpecker gebruikt de mirror later lokaal. Klantdata naar Supabase sturen is een aparte beslissing.

**Wat ik nodig heb:** je akkoord op 1–3, of je aanpassingen. Pas daarna start ik de import en de planner.
