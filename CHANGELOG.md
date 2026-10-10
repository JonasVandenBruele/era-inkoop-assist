# Changelog

## [0.15.0] — 2026-10-10 — Opvolgtaak na het bellen

### Toegevoegd
- **Opvolgtaak plannen** na het bellen, onder "Log in ERAForce": kies Morgen, 1 week, 2 weken, 1 maand of een eigen dag, en "📅 Opvolgtaak in ERAForce" opent een tweede, ingevulde taak op de prospect: **Telefonische opvolging**, type Bellen, status Open, met de gekozen dag als vervaldatum. Je hoeft die taak enkel nog te bewaren.
- Tik je daarna op "Gesproken", dan bewaart de app de opvolging meteen als volgende stap, zodat de prospect niet op je lijst komt voor de volgende mirror. Daarna herkent de mirror de open taak in ERAForce zelf. De gekozen dag wordt ook voorgesteld bij "Terugbellen op…".

## [0.14.0] — 2026-10-07 — WhatsApp te beantwoorden

### Toegevoegd
- **WhatsApp te beantwoorden** (toestemming Jonas 7/10/2026), op Vandaag vlak boven de bellijst: elke open 1-op-1-chat op je zakelijke nummer (de klant schreef het laatst, max. 14 dagen) met de laatste klantberichten en een antwoord van Claude in jouw stijl en de taal van de klant, klaar om aan te passen. "Open in WhatsApp Business" zet het antwoord klaar; "✓ Verstuurd — log in ERAForce" opent bij een gekende prospect een ingevulde taak met de tekst; "Geen antwoord nodig" verbergt de chat tot er een nieuw bericht komt. Chats zonder antwoord nodig ("ok", "dank je") worden niet getoond.
- `scripts/whatsapp-open.ts` op de Mac, elk half uur 8–20u (ma–za) via `mirror.py whatsapp` (launchd `be.eraleustoye.oxpecker-whatsapp`). Een ongewijzigde chat wordt niet opnieuw aan Claude gevraagd; wat je beantwoordde, verdwijnt bij de volgende ronde. Claude verzint geen feiten (prijzen, data, beschikbaarheid) en bevestigt geen afspraken zelf.
- Migratie `20261007000011_whatsapp_open.sql`. Naar Supabase gaan enkel de laatste klantberichten (max. 3, ingekort) en het voorgestelde antwoord.

### Opgelost
- Een prospect met reden **Reeds verkocht/verhuurd, Dubbele prospect of No lead** in ERAForce telt als beëindigd, ook als de status nog "Ingave" of "In Opvolging" is (7/10/2026: een al verkocht pand stond op de lijst).
- Knoppen braken midden in een woord af ("Verstu-urd") door de fix voor lange links; nu breken enkel woorden die echt niet passen.

## [0.13.0] — 2026-10-06 — Te koop gezet en adressen

### Toegevoegd
- **Te koop gezet** (`scripts/marktsignalen.ts`, na elke mirror-run, vóór de hooks): staat de woning van een prospect te koop — zelf (particulier) of via een andere makelaar — dan staat hij **de (werk)dag na de ontdekking bovenaan** in een eigen blok "Te koop gezet", met een kort bericht "veel succes met de verkoop" (Jonas, 6/10/2026: urgentie heel hoog). Telt niet mee voor je belmaximum; enkel een belverbod, een afspraak vandaag of "vandaag overslaan" houdt het tegen. Verdwijnt zodra er een bericht of gesprek is, of met "Niets sturen".
- Bronnen: de Immoweb-zoekresultaten per postcode van je prospects (beleefd: robots.txt, 3 s tussen aanvragen, eerlijke naam, nooit een captcha omzeilen) en de Marketpulse-prospects in de mirror. Detail per gevonden advertentie: online sinds, onder optie/verkocht, particulier of kantoor.
- Geen bericht bij: advertenties van ERA zelf, een andere unit in hetzelfde gebouw, advertenties die al langer dan 30 dagen online staan, beëindigde leads, en prospects die zelf uit een Marketpulse-advertentie komen (tenzij ze nu zelf verkopen). Die staan enkel ter info op de contactpagina ("Te koop").
- Claude schrijft voor zo'n contact het succesbericht in je eigen stijl; zonder hook stelt de app een standaardtekst voor. De ochtendmelding noemt het aantal.
- **Adressen normaliseren** (`src/domain/adres.ts`): straat (afkortingen voluit: str → straat, stwg → steenweg, St. → Sint, Av./Chée …; zonder accenten, leestekens en spaties), huisnummer, bus en **postcode** — de gemeentenaam telt niet (3078 Everberg = 3078 Kortenberg). Optioneel de officiële straatnaam uit het Vlaamse Adressenregister ("Lod. van Veltemstraat" → Lodewijk van Veltemstraat), per postcode 30 dagen gecachet in `~/.oxpecker/straatnamen`.
- **Dubbels:** één contact per adres per dag op de bellijst (bv. lead én contact op hetzelfde adres); op de contactpagina "Zelfde adres: …".
- Buurtfeiten in de hooks per postcode in plaats van per gemeentenaam.
- Migratie `20261006000010_marktsignalen.sql`: tabel `marktsignalen` (enkel advertentiegegevens), schrijfbaar door de importrol bij je ERAForce-contacten; jij mag enkel "afgehandeld" zetten.

### Gewijzigd
- **Berichten via WhatsApp Business en loggen in ERAForce** (Jonas, 7/10/2026): "Open in WhatsApp Business" opent de Business-app (zakelijk nummer) met je bericht klaar; lukt dat niet, dan de gewone WhatsApp-link. "✓ Verstuurd — log in ERAForce" registreert het in de app én opent in ERAForce een taak met je tekst al ingevuld (onderwerp "WhatsApp verstuurd", type SMS want WhatsApp bestaat niet als type; mail: type E-mail). Keuze Business/gewoon in Instellingen.
- **Bellen en loggen zoals ERA Scout** (Jonas, 7/10/2026): "📞 Bel" belt rechtstreeks (geen omweg via Maf Call). Kom je terug in de app, dan opent "📝 Log in ERAForce" een ingevulde taak op de prospect (Uitgaande Oproep, status Gesloten, datum vandaag, recordtype ERAforce Prospectie taken): enkel je evaluatie typen en bewaren. Bij "Wacht op antwoord" opent dezelfde knop een Inkomende Oproep. Ook via ⋯ en op de contactpagina, met "Open in ERAForce" en de andere nummers. Maf Call kan nog via Instellingen.
- **Geplande afspraak = volgende stap** (Jonas, 7/10/2026): wie een afspraak heeft vandaag of later (ook op een dubbele prospect), komt niet op de bellijst; de reden toont dag, uur en titel van de afspraak.
- **Dubbele prospects = één persoon** (Jonas, 6/10/2026): zelfde gsm-/telefoonnummer, e-mailadres of adres. De volgende stap op de ene geldt ook voor de andere (bv. een prospect zonder adres komt niet "volgens ritme" op de lijst als de dubbel mét adres een taak in november heeft). Het laatste gesprek, belverbod, te-koop-signaal en de gegevens (adres, nummers, e-mail, taal) van alle dubbels worden samen gebruikt, ook in de hooks en de historiek op de contactpagina ("👥 Dubbele prospect"). Eén persoon per dag op de lijst.
- **Wacht op antwoord:** wie vandaag niet opnam (of een bericht kreeg) verdwijnt niet meer van de bellijst, maar zakt naar een blok onderaan met "Belt terug" (resultaat Gesproken), "ERAForce" (opent de prospect meteen) en "Opnieuw". Ook bij de derde keer geen antwoord. Belde hij die dag niet terug, dan geldt vanaf morgen de gewone herplanning (Jonas, 6/10/2026).
- **Uitgaande oproep zonder evaluatie of met "vm"** (of "ingesproken", "nt opgenomen", "répondeur" …) telt als antwoordapparaat, niet als gesprek (Jonas, 6/10/2026). Een inkomende oproep zonder tekst blijft een gesprek.

### Opgelost
- Bij een bericht (WhatsApp, sms, mail) toont de kaart het voorgestelde bericht in plaats van een openingszin; de openingszin enkel bij bellen of langsgaan.
- Een lange link zonder spaties in een agendalocatie maakte de pagina breder dan het scherm, waardoor alle kaartjes kleiner werden. Lange woorden breken nu af.
- Het rode "te koop"-vak was in de donkere modus onleesbaar (witte tekst op lichtroze); de reden op die kaart herhaalt de details niet meer.
- De scripts op de Mac (hooks) lazen datums een dag te vroeg (bv. een taak op 19/11 als 18/11). De app op je gsm had dat probleem niet.

### Tests
- 224 tests, o.a. oproep loggen in ERAForce, geplande afspraak, dubbele prospects, wacht op antwoord, adresnormalisatie, officiële straatnamen, groep "Te koop gezet" (dag erna, boven het maximum, verdwijnt na een bericht) en voicemail-herkenning.

## [0.12.0] — 2026-10-06 — Taal, aanspreking, ander kanaal en evaluatie-vinkje

### Gewijzigd
- **Na "Gesproken"** geen notitie, volgende stap of dag meer: enkel het vinkje "Evaluatie staat in ERAForce" (verplicht). De opvolging zet je in ERAForce.
- **Aanspreking zoals jij het doet:** je en de voornaam, tenzij je die klant in WhatsApp met u aanspreekt.
- **Taal van de klant** (Nederlands, Frans, Engels): uit je WhatsApp-gesprekken, anders uit de communicatietaal in ERAForce. Ook de openingszin en de berichtvoorstellen zonder AI volgen die taal, in jouw stijl ("Dag/Hi <voornaam>, … Mvg, Jonas van ERA").
- **Ander kanaal na een onbeantwoord bericht:** na 10 werkdagen komt het contact terug met het voorstel te bellen (of langs te gaan zonder nummer), nooit een brief of een tweede bericht. Daarvoor geen tweede bericht.
- Hooks: in jouw schrijfstijl, uit de analyse van je WhatsApp-historiek.
- Migratie `20261006000009_taal_en_aanspreking.sql`.

## [0.11.0] — 2026-10-06 — WhatsApp van de Mac

### Toegevoegd
- **WhatsApp (zakelijk nummer op de Mac), alleen-lezen** (`scripts/whatsapp-naar-oxpecker.ts`, na elke mirror-run). Enkel 1-op-1-chats met nummers van je ERAForce-contacten (toestemming Jonas 6/10/2026). Naar Supabase gaat per contact en per dag enkel wie wat stuurde ("WhatsApp: 2 van jou, 1 van de klant"), nooit de inhoud.
- Antwoordde de klant die dag, dan telt dat als contact voor je ritme. Een WhatsApp die je zelf stuurde, rondt de geplande stap af; die moet je nergens loggen.
- **Hooks lezen ook WhatsApp** (toestemming Jonas 6/10/2026): de laatste 8 berichten per kandidaat gaan lokaal als context naar Claude, nooit naar Supabase. Claude citeert nooit letterlijk uit een bericht van de klant en herhaalt geen vraag die er al beantwoord werd.
- Migratie `20261006000008_whatsapp.sql`: de importrol mag enkel WhatsApp-rijen bij je ERAForce-contacten schrijven.
- Het importwachtwoord wordt niet meer bij elke push opnieuw gezet; de scripts proberen het bij een geweigerde aanmelding nog twee keer.

## [0.10.0] — 2026-10-06 — Hooks en kanalen

### Toegevoegd
- **Meer kanalen dan bellen:** flyer in de bus, brief, WhatsApp en langsgaan. Het kanaal komt uit het taakonderwerp in ERAForce (bv. "langsgaan met flyer" met type Bellen wordt een bezoek) en krijgt voorrang in het advies. Op de kaart: Route (Apple Kaarten) en "Gedaan" bij een bezoek, "Flyer gestoken" of "Brief verstuurd", en WhatsApp als eigen knop.
- **Baanprospectie-blokken:** langsgaan en flyers enkel in de blokken "Baanprospectie" van je ERAForce-agenda. Op zo'n dag in het blok (bij Belmomenten, op postcode), anders wachten ze op je volgende blok.
- **Aanknopingspunt** in plaats van de algemene terugbelzin: het specifieke taakonderwerp en een fragment uit het laatste gesprek met datum.
- **Hooks met Claude** (`scripts/hooks-maken.ts`): na elke mirror-run, via je eigen Claude-abonnement. Hook, openingszin, kanaal en conceptbericht per contact, op basis van je evaluaties, ERA-verkopen in de buurt en het nieuws (algemeen en per gemeente). Op de BelKaart met bronlinks.
- **Migratie `20261006000007_hooks_en_kanalen.sql`:** kolom `kanaal` op bronactiviteiten, flyer/brief/bezoek bij belpogingen, tabel `contacthooks`, leesrecht (geen schrijfrecht) voor de importrol op je eigen resultaten zodat het hooks-script dezelfde bellijst berekent.

### Opgelost
- Het pandadres van leads kwam niet mee: ERAForce bewaart het in de ERA-adresvelden (straat, huisnummer, bus, postcode, gemeente), niet in Street/City.
- Een bericht, flyer of brief op of na de geplande dag rondt de geplande stap af (even rust), zodat het contact niet blijft staan.

### Tests
- 183 tests, o.a. kanaalherkenning, Baanprospectie-blokken, aanknopingspunt, hook van de dag en de nieuwe toegangsregels.

## [0.9.0] — 2026-10-05 — Echte gegevens uit de ERAForce-mirror (fase 8)

### Toegevoegd
- **Import uit de ERAForce-mirror.** `scripts/mirror-naar-oxpecker.ts` draait op de Mac na elke mirror-run (07:00 en 19:00). Het stuurt enkel door wat op Jonas van toepassing is (besluit 5/10/2026): zijn leads, de contacten waarmee hij taken of afspraken heeft, zijn taken (plus taken van collega's op zijn leads) en zijn afspraken.
- **Vertaling** (`src/adapters/crm/eraforce.ts`):
  - Een lead wordt een prospect, nieuwe lead, langetermijnprospect of beëindigde lead. Een geconverteerde lead wordt overgeslagen, want zijn contact neemt het over.
  - Een open beltaak wordt een terugbelafspraak (met uur als er een herinnering op die dag staat). Een andere open taak is een geplande volgende stap.
  - Een afgesloten oproep is een gesprek, tenzij de evaluatie zegt dat er niemand opnam. Een voorbije afspraak met iemand telt ook als contact.
- **Achterstand:** een terugbeltaak uit ERAForce die meer dan 10 werkdagen verlopen is, komt niet meer op de daglijst. Ze staat apart als "achterstand in ERAForce" (instelbaar bij Planning).
- **Instelling "Gegevens":** automatisch, echt of test. Echte data en testdata worden nooit gemengd, en met echte data geldt altijd de echte datum.
- **Migratie `20261005000006_eraforce_mirror.sql`:**
  - nieuwe statussen "beëindigd" en "relatie", plus de oorspronkelijke ERAForce-labels
  - de importrol `oxpecker_import`, die via RLS enkel ERAForce-rijen kan lezen en schrijven
  - de tabel `eraforce_koppelingen` verdwijnt
- Gegevens worden per 1000 rijen geladen (de bovengrens van Supabase).

### Verwijderd
- De tijdelijke "Koppel aan ERAForce" en "Testlink voor alle contacten", zoals afgesproken. De ERAForce-ID's komen nu uit de mirror.

### Tests
- 174 tests, o.a. de vertaling, de bellijst op echte data (beëindigd, relatie, achterstand) en de toegangsregels van de importrol.

## [0.8.0] — 2026-10-03 — Belmomenten en pushmeldingen

### Toegevoegd
- **Belmomenten** op Vandaag: vrije blokken tussen afspraken binnen je werkuren, zonder pauze, met reisbuffer rond afspraken op verplaatsing (niet voor kantoorafspraken). Per blok de capaciteit (minuten ÷ belduur) en wie erin gepland is; een terugbelafspraak met uur komt in het juiste blok. Waarschuwing als niet alles past; een hele-dagafspraak blokkeert de dag. Werkuren, pauze, belduur en reisbuffer zijn instelbaar.
- **Pushmeldingen** (iPhone, app op het beginscherm, iOS 16.4+): ochtendoverzicht, start van een vrij belmoment, en herinnering vóór een terugbelafspraak met uur. Standaard zonder klantnamen; elke soort apart aan/uit. Elke melding vertrekt maar één keer.
- Meldingentaak in GitHub Actions (elke 10 min op werkdagen, ± 7u–20u), met handmatige testmelding. Sleutelpaar: publiek als repo-variabele, privé als GitHub-geheim.
- Migratie `20261003000005_pushmeldingen.sql` (pushabonnementen en meldingenlogboek, met RLS).
- Afspraakbriefings worden niet gebouwd: Donna levert die al.

### Tests
- 155 tests, o.a. belmomenten (overlap, hele dag, zomertijd, vanaf nu) en meldingsregels (vensters, geen namen, maar één keer).

## [0.7.0] — 2026-10-03 — Volgens de officiële ERA Brand Guide

### Gewijzigd
- **Beeldmerk (optie 3, gekozen door Jonas):** ERA brand system "rood, wijzend naar boven" — rood vlak, witte negatieve pijl met de punt in het midden, donkerrode plooi — met een witte ossenpikker in lijnstijl op de punt. Het logodak van ERA wordt niet apart gebruikt (Brand Guide p.14). Bron: `scripts/logo.mjs`, iconen via `node scripts/maak-iconen.mjs`.
- **Officiële kleuren** (p.23–26): blauw digitaal #000086, rood #D70A28, donkerrood #960E34 (enkel accent), grijs #6D6E71, lichtgrijs #E6E7E8.
- **Witte appbalk** met beeldmerk, OXPECKER en DAGPLANNER — rood en blauw raken elkaar niet meer (p.23).
- Titels in Montserrat Black (Gotham-vervanger tot er een weblicentie bevestigd is).
- Officiële ERA-bestanden staan in een aparte map buiten de repository en komen niet op GitHub.

## [0.6.0] — 2026-10-03 — Oxpecker en ERA-huisstijl

### Gewijzigd
- De app heet voortaan **Oxpecker** (ERA Inkoop Assist), naar de ossenpikker op de neushoorn: altijd aanwezig, nooit opdringerig. De Dagplanner is de eerste module.
- **ERA-huisstijl** afgeleid van era.be: blauw #000085, rood #D60A29, grijs #6E6F72; titels vet in hoofdletters; rode knoppen met donker schuin hoekje; Montserrat (in de app gebundeld) als alternatief voor Gotham.
- Nieuwe appbalk, lijnicoontjes in de menubalk, en een beeldmerk: een ossenpikker (witte vogel, rode snavel) op de nok van een tweekleurig rood dak — een knipoog naar het ERA-dak — op ERA-blauw. Ook klein in de appbalk en op het inlogscherm.
- Mail opent standaard in **Outlook** (instelbaar).
- Tijdelijke **testlink naar ERAForce voor alle contacten** (Instellingen → ERAForce); verdwijnt bij de mirror.
- Het officiële ERA-logo wordt pas toegevoegd met het bestand en akkoord van ERA Marketing.

## [0.5.0] — 2026-10-03 — Timeline eerst, scores afgestemd

### Gewijzigd
- **Timeline eerst**: Vandaag toont blokken *Gepland vandaag* → *Vastgepind* → *Nieuwe leads* → *Aanvulling volgens ritme*. Bij elke geplande opvolging staat waar de datum vandaan komt. Geen scores meer op de kaart.
- Prospects zonder opvolgtaak worden enkel geteld (werk je af via je ERAForce-dashboard).
- Afgestemde regels: ritmes warm-zonder-timeline 7 / lauw 60 / koud 180 dagen; nieuwe lead 3 dagen voorrang; vergeten belofte vóór nieuwe lead; korte tijdshorizon +40; hook +20; voorrang voor Realo-sellerleads, zelf contact opgenomen en schattingsaanvragen (+10); geplande volgende stap in de toekomst = timeline.
- Opgeslagen instellingen worden automatisch naar de nieuwe standaardwaarden omgezet (enkel waarden die nog op de oude standaard stonden).
- "Haakje" heet voortaan **hook**.

### Tests
- 138 tests; de voorbeelden in PLAN.md §5.4 zijn herschreven naar de nieuwe regels.

## [0.4.2] — 2026-10-03 — Bellen via ERAForce (Maf Call)

### Toegevoegd
- Knop **Bel via ERAForce**: opent de prospect rechtstreeks in de Salesforce-app (getest op iPhone), waar je via More → Maf Call belt en je evaluatie invult. Ook "Open in ERAForce" op de contactpagina.
- Instellingen: bellen via ERAForce aan/uit, en optioneel toch "hoe ging het?" vragen na bellen via ERAForce (standaard uit: de evaluatie staat dan al in ERAForce).
- **DATA.md** met de eerste waarnemingen over ERAForce (Leads, Taken, Maf Call, deep links), zonder echte gegevens.
- **Koppel aan ERAForce** op de contactpagina: plak de link van een prospect uit de Salesforce-app; enkel het ID wordt bewaard (migratie `20261003000004_eraforce_koppeling.sql`, met RLS). Zo werkt "Bel via ERAForce" al vóór de mirror, ook voor testcontacten.

## [0.4.1] — 2026-10-03 — Minder handwerk bij het registreren

### Gewijzigd
- **Eén optionele tik na het bellen**: bel je via de app, dan vraagt die bij terugkomst "gesproken / geen antwoord / terugbellen / later". Negeren = niets gelogd. Bij testdata simuleert de belknop de oproep.
- **ERAForce is de bron** voor gesprekken en inhoud; logging in de app is optioneel (PLAN.md §6.4).
- "Reactie ontvangen" verwijderd uit het resultaatpaneel (een reactie komt via ERAForce binnen).
- Avondoverzicht voor Donna uit het menu gehaald (code bewaard).

## [0.4.0] — 2026-10-03 — Fase 3b: contactstrategie "altijd aanwezig, nooit opdringerig" (ossenpikker)

### Toegevoegd
- **Kanaaladvies** per contact: bellen, berichtje of mail. Na 2× geen antwoord een bericht in plaats van een 3e belpoging; geen nummer → mail; koud contact met nuttige info → mail/bericht; contactvoorkeur gaat altijd voor; rustige uren voor berichten (9u–20u, niet op zondag).
- **Bericht- en mailpaneel** met voorgestelde tekst (u/je, hook, geen "even checken"); opent Berichten, WhatsApp of Mail — de app verstuurt nooit zelf. "Verstuurd" registreren telt mee maar niet als gesprek; daarna 3 werkdagen rust. Nieuwe uitkomst **Reactie ontvangen** telt wel als gesprek.
- **Hooks**: buurt, dossier, algemeen en persoonlijk. Automatisch uit het dossier (huurcontract dat afloopt, een jaar na het eerste gesprek). Specifieke hooks geven extra punten, halen een contact naar voren vanaf de helft van zijn ritme, en verschijnen in openingszin en bericht. Persoonlijke hooks zijn enkel een tip; gevoelige onderwerpen worden geweigerd; verlopen hooks verdwijnen.
- **Contactvoorkeur** per contact (kanaal, niet bellen vóór/na), op de contactpagina.
- Instellingen voor het hook-gewicht, bericht na x keer geen antwoord en rust na een bericht.
- Migratie `20261003000003_contactstrategie.sql` (kanaal en nieuwe uitkomsten bij belpogingen, contactvoorkeuren, hooks — met RLS).
- PLAN.md §7b: principe, regels, sociale media (enkel manueel) en wat vóór echte data met ERA af te stemmen is (Bel-me-niet-meer, toestemming voor sms/mail, persoonsgegevens).

### Gewijzigd
- Agenda komt uit Salesforce/ERAForce; fase 9 (Outlook) vervalt.

### Tests
- 126 tests, waaronder alle acceptatiecriteria van fase 3b.

## [0.3.0] — 2026-10-03 — Fase 3: belresultaten, keuzes, herplanning en Donna-overzicht

### Toegevoegd
- Knop **Resultaat** per contact met vijf grote uitkomsten: gesproken (notitie + volgende stap), geen antwoord (één tik), terugbellen op datum (met optioneel uur), afspraak gemaakt (lokaal, niet in de ERAForce-agenda), niet meer bellen (met bevestiging).
- Melding na elk resultaat met **Ongedaan maken**; ook achteraf via "Gebeld vandaag". Ongedaan maken draait ook de gekoppelde terugbelafspraak, afspraak of het belverbod terug.
- **Vastpinnen**, **vandaag overslaan** en **uitstellen tot datum** (menu ⋯), met overzicht "Jouw keuzes" en knop Herstellen. "Overslaan" en "niet meer bellen" zijn duidelijk verschillend.
- **Dagplan**: de lijst wordt bij de eerste opening van de dag vastgelegd. Gebelde contacten verdwijnen naar "Gebeld vandaag"; de lijst wordt niet vanzelf aangevuld of herschikt. Terugbellen met uur, vastgepinde contacten en nieuwe leads die later binnenkomen worden wel toegevoegd.
- **Tijdelijk lokaal contact** aanmaken (Contacten → ＋), meteen vastgepind voor vandaag.
- Contactpagina: belresultaat ingeven, keuzes, en jouw lokale gegevens (belverbod intrekken, open terugbelafspraken).
- **Avondoverzicht** voor Donna: bewerkbare tekst, kopiëren, status *klaargezet* / *door mij doorgegeven* (herstelbaar), optionele referentiecode per gesprek. Wordt nooit automatisch verstuurd.
- Migratie `20261003000002_lokale_resultaten.sql`: belverboden, opvolgacties, planningskeuzes, dagplannen, donna_overzichten — allemaal met RLS.

### Online
- Databasemigraties worden automatisch toegepast door GitHub bij elke publicatie (rechtstreekse databaseverbinding, enkel het databasewachtwoord als geheim). Migratie 2 is zo uitgevoerd; anonieme toegang tot de nieuwe tabellen is geweigerd (gecontroleerd).

### Tests
- 103 tests, o.a.: elk belresultaat en het effect op de lijst, nieuwe lead mag dezelfde dag nog eens, lokale terugbelafspraak vervangt een oudere uit de bron, ongedaan maken, dagplan blijft stabiel, Donna-tekst, toegangsregels voor de nieuwe tabellen, en een herimport van de bron die geen enkele lokale keuze of belpoging overschrijft.

## [0.2.0] — 2026-10-03 — Fase 2: bellijst met deterministische score en uitleg

### Toegevoegd
- Bellijst volgens PLAN.md §5: harde regels (belverbod, latere terugbelafspraak, uitgesteld, vandaag overgeslagen, afspraak vandaag), voorrangsgroepen A (terugbellen met uur) → vastgepind → B (nieuwe lead) → C (terugbellen zonder uur/verstreken) → D (opvolging op score).
- Uitlegbare score: ritme-achterstand, fase, tijdshorizon, eigen vervolgstap. Knop **Waarom?** toont de opbouw per contact.
- Maximum per dag (standaard 15); groep A gaat altijd mee. Teller **Niet op vandaag** met uitsplitsing, zodat achterstand zichtbaar blijft.
- Aparte lijsten **Nummer zoeken** en **Handmatig beoordelen** (na 3× geen antwoord op rij).
- Herplanning na geen antwoord (1, 2, 4 werkdagen; nieuwe lead mag dezelfde dag nog eens) — al in de berekening, de knoppen volgen in fase 3.
- Belgische werkdagen en wettelijke feestdagen (incl. Pasen-afhankelijke dagen).
- Standaard-openingszin zonder AI, met juiste aanspreekvorm en groet; gebruikt nooit vrije notitietekst.
- Pagina **Contacten** met zoeken en per contact waarom hij vandaag (niet) op de lijst staat.
- Instellingen: ritmes, maximum, gewichten, nieuwe-lead-periode, max. pogingen en je voornaam zijn aanpasbaar, met knop naar standaardwaarden.

### Online
- Gepubliceerd op https://jonasvandenbruele.github.io/era-inkoop-assist/ met Supabase-login (project in EU-regio Frankfurt).
- Gecontroleerd: niet-ingelogde bezoekers kunnen niets lezen of schrijven; zelfregistratie staat uit. Werkt als app op het beginscherm van de iPhone.
- Git zonder Xcode: losse git in de gebruikersmap; commits met anoniem GitHub-adres.

### Tests
- 85 tests, waaronder alle voorbeelden uit PLAN.md §5.4 als acceptatietest, vastpinnen vs. belverbod, overslaan vs. uitstellen, ongedaan maken, herplanning over weekend, limiet en instelbare gewichten.

## [0.1.0] — 2026-10-03 — Fase 1: projectsetup, fictieve data en Vandaag-pagina

### Toegevoegd
- Projectopzet: Vite + React + TypeScript, PWA (installeerbaar op het beginscherm), app-iconen.
- Eén instelbare klok en datumhulpen in Europe/Brussels (zomertijd-veilig).
- Centraal instellingenschema met de afgesproken startwaarden (ritmes 14/42/90, max. 15, AI-budget €10, AI uit).
- Fictieve testdata: 59 Belgische contacten met taken, notities, Donna-evaluaties, afspraken en lokale belpogingen, reproduceerbaar (vaste seed) en relatief aan de testdatum. Alle randgevallen uit de opdracht zijn aanwezig.
- Supabase-schema (migratie `20261003000001_basis.sql`) met Row Level Security op elke tabel.
- Login met e-mail en wachtwoord (zodra Supabase gekoppeld is). Accounts worden in het Supabase-dashboard aangemaakt; zelfregistratie staat uit. Lokale demo zonder login tot dan.
- Pagina's: **Vandaag** (afspraken met overlapmarkering, contacten per groep, bronstatus), **Contact** (gegevens, panden met mede-eigenaars, open taken, historiek met bron/lokaal-label, herkomst), **Instellingen** (testdatum, testdata herladen, account).
- Testdata kan niet echt gebeld worden: de belknop is uitgeschakeld voor verzonnen nummers.
- Automatisch testen en publiceren naar GitHub Pages (`.github/workflows/publiceer.yml`).

### Gewijzigd
- Stack aangepast op vraag: geen Next.js en geen Vercel; statische app + Supabase (zie PLAN.md §2.1).

### Tests
- 49 tests: datums en zomertijd, klok, instellingen, reproduceerbaarheid en randgevallen van de testdata, afspraken/overlap, laatste inhoudelijk contact, toegangsregels (gebruiker B ziet niets van A), import zonder duplicaten, en het volledig laden van de testdata in het databaseschema.
