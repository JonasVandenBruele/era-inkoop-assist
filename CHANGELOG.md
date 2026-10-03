# Changelog

## [0.4.1] — 2026-10-03 — Minder handwerk bij het registreren

### Gewijzigd
- **Eén optionele tik na het bellen**: bel je via de app, dan vraagt die bij terugkomst "gesproken / geen antwoord / terugbellen / later". Negeren = niets gelogd. Bij testdata simuleert de belknop de oproep.
- **ERAForce is de bron** voor gesprekken en inhoud; logging in de app is optioneel (PLAN.md §6.4).
- "Reactie ontvangen" verwijderd uit het resultaatpaneel (een reactie komt via ERAForce binnen).
- Avondoverzicht voor Donna uit het menu gehaald (code bewaard).

## [0.4.0] — 2026-10-03 — Fase 3b: contactstrategie "altijd aanwezig, nooit opdringerig" (ossenpikker)

### Toegevoegd
- **Kanaaladvies** per contact: bellen, berichtje of mail. Na 2× geen antwoord een bericht in plaats van een 3e belpoging; geen nummer → mail; koud contact met nuttige info → mail/bericht; contactvoorkeur gaat altijd voor; rustige uren voor berichten (9u–20u, niet op zondag).
- **Bericht- en mailpaneel** met voorgestelde tekst (u/je, haakje, geen "even checken"); opent Berichten, WhatsApp of Mail — de app verstuurt nooit zelf. "Verstuurd" registreren telt mee maar niet als gesprek; daarna 3 werkdagen rust. Nieuwe uitkomst **Reactie ontvangen** telt wel als gesprek.
- **Waardehaken**: buurt, dossier, algemeen en persoonlijk. Automatisch uit het dossier (huurcontract dat afloopt, een jaar na het eerste gesprek). Specifieke haken geven extra punten, halen een contact naar voren vanaf de helft van zijn ritme, en verschijnen in openingszin en bericht. Persoonlijke haken zijn enkel een tip; gevoelige onderwerpen worden geweigerd; verlopen haken verdwijnen.
- **Contactvoorkeur** per contact (kanaal, niet bellen vóór/na), op de contactpagina.
- Instellingen voor haakgewicht, bericht na x keer geen antwoord en rust na een bericht.
- Migratie `20261003000003_contactstrategie.sql` (kanaal en nieuwe uitkomsten bij belpogingen, contactvoorkeuren, waardehaken — met RLS).
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
