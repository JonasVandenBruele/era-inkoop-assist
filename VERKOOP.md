# VERKOOP — koperspool, matchmaking en gedeelde contactlijsten

Status: **demo met fictieve gegevens** (10/10/2026). Echte gegevens, echte communicatie en activering in de gewone app
pas na uitdrukkelijk akkoord van Jonas.

## 1. Wat al bestond (onderzocht 10/10/2026)

| Onderdeel | Gevonden | Gevolg |
|---|---|---|
| Stack | Statische Vite + React + TypeScript (GitHub Pages), Supabase (database, login, RLS), migraties via de GitHub-workflow | Zelfde stack; demo als tweede build in dezelfde Pages-publicatie |
| Gebruikers | Eén gebruiker (Jonas); RLS per `eigenaar_id`; geen rollen of kantoren | Rollen en kantoorgrenzen nieuw nodig voor productie (§8) |
| Contacten | `Contact` met herkomstvelden (bron, extern-ID) | Hergebruikt: een kandidaat is een bestaand contact |
| Panden | `Pand` (adres, type) zonder kenmerken of prijzen | Uitgebreid in `VerkoopPand` (kenmerken + herkomst, prijzen, vrijgave) |
| Zoekopdrachten, matching | **Niet gebouwd** in Oxpecker. De mirror bevat wel `ERA_Zoekopdracht__c`, `Bezoekmoment__c`, `Onderhandeling__c`, `ERA_Object__c` | Nieuw: zoekprofielen, matching en scores |
| ERAForce-mirror | Alleen-lezen, op de SSD; selectie naar Supabase als rol `oxpecker_import` (enkel Jonas' leads) | Later bron voor kandidaten, zoekopdrachten, panden, bezoeken en biedingen |
| Dagplanner, opvolging | Bellijst, belresultaten, opvolgacties, Donna-overzicht (avondoverzicht vervallen, code bewaard) | Zelfde principes: eigen resultaten apart van de bron, nooit stil overschrijven |
| Opvolging na aankoop | **Niet gebouwd** | Nu enkel een eenmalige aanmelding (`nazorg`), klaar om aan te sluiten |
| Demo-omgeving | Lokale demo in de browser (geheugen) | Nieuw: aparte demo-build met gedeelde, gescheiden opslag |

## 2. Opbouw

| Map | Inhoud |
|---|---|
| `src/domain/verkoop` | Pure logica: model, matching, intentie, feedback, prijs, kandidatenlijst, acties, bellijst, openingszinnen |
| `src/core/verkoop` | Opslag van de eigen records (geheugen, lokaal, gedeeld) met versiecontrole |
| `src/adapters/verkoop/bron.ts` | Vervangbare bron (`VerkoopBron`): nu de fictieve demo, later de mirror |
| `src/modules/verkoop` | Schermen: Vandaag bellen, Koperspool, Aanbod, Pand (Kandidaten & opvolging), Kandidaat, Kantoor, Demonstratieroute |
| `fixtures/verkoop.ts` | Fictieve dataset met de 12 scenario's |
| `supabase/migrations/20261010000012_verkoop_demo.sql` | Gescheiden demo-opslag |

**Brongegevens** (kandidaten, zoekopdrachten, panden, prijzen, bezoeken, biedingen) zijn alleen-lezen.
**Eigen gegevens** zijn records in Oxpecker: kwalificaties, criteriumbeslissingen, inzichten, vrijgaven, aanvullingen,
handmatige prijzen, campagnes, contactacties, contactmomenten, afwijzingen, contactverboden, instellingen. Een eigen
record wint altijd van de bron. Elke schrijfactie draagt de verwachte versie; is een collega sneller, dan wordt niets
bewaard en verschijnt een melding (alles of niets).

Eén contactactie is één record: hetzelfde record staat bij het pand, in het kantooroverzicht en in Vandaag bellen.

## 3. Scores (controleerbare code, versie `verkoop-scores-v1`)

- **Matchscore** per zoekopdracht: budget 25 %, locatie 20 %, type/kamers/oppervlakte 20 %, wensen en bevestigde
  feedback 25 %, staat/praktisch 10 %. Onbekend telt neutraal en verlaagt de **dekking**. "Sterk" vraagt score ≥ 78,
  dekking ≥ 60 %, geen geschonden of oncontroleerbare harde voorwaarde, geen onbekende kerngegevens van het pand en geen
  duidelijk afwijkend onderdeel (bv. buiten de gewenste regio). Biedingen en bezoeken verhogen de match niet.
- **Aankoopintentie**: bod 45, tweede bezoek 25, uitspraak over aankoopplan 20 (voorstel 10), interesse 15, bevestigde
  termijn 15, bezoek 10. Halveert per 45 dagen, telt niet na 180 dagen, één keer per activiteit. Geen signalen = onbekend.
  Los van de koopklare status (die bevestigt enkel een medewerker).
- **Belprioriteit** (pas na contactregels, beschikbaarheid en vrijgave): match 40 %, intentie 30 %, aanleiding 20 %,
  opvolgbehoefte 10 %. Afgesproken terugbelmomenten gaan altijd voor. Geen voorspelde aankoopkans.

Gewichten, bevestigingsritme (30 d), claimduur (20 min) en dagdoel (15) staan in de kantoorinstellingen.

## 4. Belangrijkste regels

- Een kandidaat met een **contactverbod, pauze of afgerond traject** komt in geen enkele lijst, ook niet bij een nieuwe match.
- Een **bevestigd bezwaar** tegen ligging, indeling, tuin … sluit dat pand uit; een prijsdaling verandert dat niet.
  Een prijs(-kwaliteit)bezwaar maakt de kandidaat wél opnieuw relevant bij een prijsdaling, met concrete uitleg.
- **Afwijzing** van een pand: komt pas terug als de reden echt verandert (prijs gezakt bij een prijsbezwaar).
- Een kandidaat met een **open actie** blijft altijd zichtbaar bij het pand; regels worden dan aandachtspunten.
- Een **eerste prijs** is nooit een daling; enkel dezelfde prijssoort en valuta; grote sprongen of snelle correcties
  moeten bevestigd worden. Elke daling is een eigen aanleiding (campagne-ID = prijsregistratie), herverwerken maakt
  niets dubbel.
- **Vrijgave** per pand: intern matchen, contacteren, bezoeken, en wat gedeeld mag worden (gemeente, adres, vraagprijs,
  kenmerken). Zonder contactvrijgave: interne matches wel, openingszin niet, berichten zonder pandgegevens. De interne
  richtprijs komt nooit in een bericht.
- **Feedback uit tekst**: deterministische herkenning met letterlijke bronzin, altijd eerst een voorstel. Enkel
  bevestigde feedback stuurt de match. Geen verzonnen tuinmaten; een groter perceel telt niet als grotere tuin;
  uitspraken over anderen worden niet toegeschreven.
- **Claim** tijdens het bellen; een vergeten claim vervalt na 20 minuten. Gelijktijdige claims beslecht de versiecontrole.

## 5. Demo

- Link: `https://jonasvandenbruele.github.io/era-inkoop-assist/verkoop-demo/#code=<toegangscode>` (code niet in git).
- Profielen: Jonas (inkoper), Nicolas (verkoper), Sofie (fictieve collega). Wisselen rechtsboven. Geen accounts.
- Opslag: Supabase-schema `verkoop_demo`, niet rechtstreeks bereikbaar; enkel `verkoop_demo_laad/bewaar/reset` met
  een geldige code (SHA-256-hash in de migratie). Raakt nooit `public.*`. Grenzen: 60 wijzigingen per keer, 32 kB per
  record, 5000 records.
- Bellen, berichten en bezoeken worden enkel gesimuleerd en intern bewaard.
- **Code intrekken**: `update verkoop_demo.toegang set actief = false;` (of een nieuwe hash toevoegen).
- **Demo opnemen**: `npm run dev:verkoopdemo` (lokaal, opslag in de browser) of `npm run build:verkoopdemo`.

## 6. Na akkoord: aansluiten op echte gegevens (nog niet gedaan)

1. Productieschema met **kantoor en rollen** (inkoper/verkoper/kantoorleider), RLS per kantoor aan de serverkant,
   login per medewerker (geen gedeelde code met echte contactgegevens).
2. Mirror-export uitbreiden voor het eigen kantoor: zoekopdrachten, objecten, bezoeken, biedingen (nu enkel Jonas' leads).
3. `VerkoopBron` voor de mirror (vertaling hieronder), met bron-ID's en laatste geslaagde synchronisatie; bij storing
   blijven de laatst bruikbare gegevens zichtbaar met hun actualiteit.
4. Eigen records verhuizen van `verkoop_demo` naar productietabellen (zelfde vorm).
5. Donna-tekst (Kantoor) als bestaande weg naar ERAForce; ERAForce blijft alleen-lezen.

## 7. Vertaling mirror → model (voorstel, te valideren met 10 echte voorbeelden)

| Mirror | Model |
|---|---|
| `Contact` / `Lead` (+ eigenaar) | `Kandidaat.contact`, `eigenaarId` |
| Partnerkoppeling (`ProspectContacts__c`, `ERA_Rollen__c`) | `Huishouden` — enkel uitdrukkelijke koppelingen |
| `ERA_Zoekopdracht__c` | `Zoekopdracht` (criteria als hard/voorkeur volgens de velden; vrije tekst → voorstel) |
| `ERA_Object__c` (+ publicaties, historiek) | `VerkoopPand`, fase, kenmerken met herkomst; prijswijzigingen → `PrijsRegistratie` |
| `Bezoekmoment__c` (+ evaluatie) | `Bezoek` (+ feedbackvoorstellen) |
| `Onderhandeling__c` | `Bod` |
| `Task`/`Event` | Historiek en laatste betekenisvol contact |

Historische, verkochte en ingetrokken panden enkel als context, nooit als aanbod.
