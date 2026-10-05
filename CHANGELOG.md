# Changelog

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
