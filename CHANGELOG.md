# Changelog

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
