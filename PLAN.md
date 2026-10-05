# PLAN — Oxpecker (ERA Inkoop Assist), module 1: Dagplanner

> Naam gekozen op 3/10/2026: **Oxpecker**, naar de ossenpikker op de neushoorn — altijd aanwezig, nooit opdringerig.

Status: **fase 1–3b, 6 (belmomenten) en 7 (pushmeldingen) online. Oxpecker in ERA-huisstijl. ERAForce-mirror draait sinds 5/10/2026 (SSD, 07:00/19:00); volgende stap fase 8: Oxpecker leest de mirror. Wacht op: Claude API (fase 4).**
Laatst bijgewerkt: 3 oktober 2026

---

## 0. Samenvatting in vijf zinnen

1. Eén statische web-app (gewone HTML/JS/CSS, installeerbaar als PWA) met duidelijk gescheiden modules, plus **Supabase** voor database, login en serverwerk. Geen Vercel.
2. Alle planningslogica (uitsluitingen, score, herplanning, belblokken) is gewone, geteste code — de AI levert alleen gestructureerde context en teksten en is nooit nodig om de dag te plannen.
3. Externe bronnen (ERAForce-mirror — ook voor de agenda — en Plaud) komen binnen via verwisselbare adapters; nu draait alles op ~60 reproduceerbare fictieve Belgische contacten.
4. Brongegevens, AI-interpretaties en jouw correcties worden apart bewaard, zodat een import nooit stilzwijgend jouw keuzes overschrijft.
5. Elke fase eindigt met iets dat je op je iPhone kunt testen.

---

## 1. Antwoorden uit fase 0 (vastgelegd)

| Vraag | Jouw keuze | Gevolg voor het plan |
|---|---|---|
| Toestel | iPhone | Ontwerp en test voor Safari/iOS. Installatie via "Zet op beginscherm". Pushmeldingen kunnen pas vanaf iOS 16.4 en alleen in de geïnstalleerde app (niet in gewone Safari). |
| Accounts | GitHub aanwezig | Supabase maken we in fase 1 samen aan (stappen in §10). Anthropic pas in fase 4. |
| Hosting | **Geen Vercel; gewone HTML + Supabase** | De app is een set statische bestanden. Serverwerk (AI-aanroepen, imports, geplande taken) draait in Supabase Edge Functions + geplande databasetaken. |
| Testen | Meteen op gsm | Fase 1 eindigt met een online versie achter login, met enkel fictieve data. |
| Gebruikers | Later ook collega-inkopers | Elke rij in de database hoort bij een gebruiker; toegangsregels per gebruiker vanaf dag 1. Geen teamfuncties bouwen, wel mogelijk houden. |
| Nieuwe lead vs terugbellen | Voorstel aanvaard | Volgorde: terugbellen met uur → onbereikte nieuwe lead → terugbellen zonder uur/verstreken → rest op score (zie §5). |
| AI-budget | €10/maand | Startwaarde, instelbaar. Bij bereiken stopt alleen de AI. |
| ERA-akkoord | Niet nodig voor fictieve data | We gebruiken uitsluitend fictieve data. Vóór echte data maken we de gegevenskaart (§9) en vraag ik opnieuw jouw akkoord. |

---

## 2. Architectuur

### 2.1 Stack (aangepast: geen Next.js en geen Vercel)

Afwijking van je voorkeursstack, op jouw vraag: Next.js en Vercel vallen weg. De app wordt **gewone HTML/JS/CSS**. Ik schrijf ze in TypeScript (zodat alles getest kan worden), en een bouwstap zet dat om naar gewone bestanden die op elke eenvoudige webhost draaien. Alles wat geheim moet blijven of op de achtergrond moet draaien, doet Supabase.

| Onderdeel | Keuze | Waarom, voor jou |
|---|---|---|
| App (scherm) | **Vite + React + TypeScript** → bouwt naar statische HTML/JS/CSS | Gewone bestanden, geen eigen server nodig. React houdt meerdere schermen overzichtelijk. |
| Hosting van de bestanden | **GitHub Pages** (gratis, via je bestaande GitHub-account) | Nodig omdat je iPhone de app via een veilig https-adres moet openen om ze te kunnen installeren. Zie beslispunt §10.2. |
| Database + login | **Supabase** (Postgres, Auth, Row Level Security) in een EU-regio | Login en toegangsregels per gebruiker zitten in de database zelf. De publieke Supabase-sleutel in de app is daarvoor bedoeld; de toegangsregels beschermen je gegevens. |
| Serverwerk | **Supabase Edge Functions** | Hier draaien later de AI-aanroepen en imports; de Claude-sleutel staat alleen hier, nooit in de app. |
| Geplande taken | **Supabase geplande databasetaken** (cron) die Edge Functions starten | Vervangt Vercel Cron. |
| AI | **Claude API** (officiële `@anthropic-ai/sdk`), alleen in Edge Functions | Sleutel komt nooit op je gsm. |
| Validatie | **Zod** | Eén schema voor instellingen, AI-uitvoer en invoer. |
| Datums | `date-fns` + `@date-fns/tz` met vaste zone **Europe/Brussels** | Correct rond zomertijd en middernacht. |
| Tests | **Vitest** (logica), later **Playwright** (iPhone-schermtest) | Snelle tests zonder database voor alle regels. |
| Migraties | **Supabase CLI** (`supabase/migrations/*.sql`) in git | Elke databasewijziging is een genummerd bestand. |

### 2.2 Mappenstructuur (gepland)

```
src/
  app/                      → pagina's (Vandaag, Contact, Avondoverzicht, Instellingen, Login)
  modules/
    dagplanner/             → schermen + logica van deze module
    (later: dagafsluiting/, leadmelder/, prospectiekaart/, marktradar/, vma/ …)
  domain/                   → PURE logica, geen database: regels, score, herplanning, belblokken
  core/
    clock.ts                → één instelbare klok (testdatum) voor álle datumlogica
    settings/               → centraal instellingenschema + standaardwaarden
    db/                     → Supabase-client, repositories
  adapters/
    crm/       fictief | eraforce-mirror (later)
    agenda/    fictief | eraforce-mirror (later; de agenda staat in Salesforce/ERAForce)
    gesprekken/ handmatig | fictief | plaud (later)
supabase/
  migrations/               → SQL-migraties
  functions/                → Edge Functions (serverkant)
    ai/                     → enige plek die de Claude API aanroept (+ budget + kostenlog), vanaf fase 4
    import/                 → bronimports, vanaf fase 8
prompts/
  extractie/v1.md           → prompts als aparte, geversioneerde bestanden
  openingszin/v1.md
  briefing/v1.md
fixtures/                   → fictieve testdata-generator (vaste seed)
```

Modules mogen `core/`, `domain/` en `adapters/` gebruiken, maar niet elkaars binnenkant. Zo kan een volgende module erbij zonder ombouw.

### 2.3 Adapters

Elke adapter vertaalt een bron naar ons **eigen intern model** en levert per record:
`bron`, `extern_id`, `gebeurd_op` (indien bekend), `gewijzigd_in_bron_op` (indien beschikbaar), `geïmporteerd_op`, `inhoud_hash`.

Interface (vereenvoudigd):

```ts
interface CrmAdapter {
  naam: 'fictief' | 'eraforce_mirror';
  haalWijzigingenOp(sinds?: Date): Promise<ImportBatch>; // contacten, panden, relaties, activiteiten
}
interface AgendaAdapter { haalAfsprakenOp(van: Date, tot: Date): Promise<Afspraak[]>; }
interface GesprekkenAdapter { haalSamenvattingenOp(sinds?: Date): Promise<Gesprek[]>; }
```

We veronderstellen **niet** dat ERAForce standaard Salesforce-objecten gebruikt. De ERAForce-adapter wordt pas ontworpen na inventarisatie (fase 8, DATA.md).

### 2.4 Klok en tijdzone

- `core/clock.ts` geeft "nu" terug. In testmodus komt dat uit de instelling `testdatum` (bv. *dinsdag 13 oktober 2026, 07:30*). Alle code en alle tests gebruiken deze klok, nooit rechtstreeks `new Date()`.
- "Vandaag", "werkdag", "verstreken" worden altijd in **Europe/Brussels** berekend. Tests dekken de zomertijdwissels (eind maart / eind oktober).
- Werkdagen: ma–vr, met een instelbare lijst Belgische feestdagen.

### 2.5 Geplande taken

Imports en AI-verwerking draaien als idempotente taken: elke run krijgt een record in `taak_runs`, en elke schrijfactie gebruikt unieke sleutels (`bron + extern_id`, `activiteit + inhoud_hash + promptversie`). Opnieuw draaien geeft dus nooit dubbele resultaten.

---

## 3. Datamodel

Alle tabellen hebben `eigenaar_id` (de ingelogde gebruiker) en toegangsregels (RLS): je ziet en wijzigt enkel eigen rijen. Testdata krijgt `is_testdata = true` en wordt in de interface zo gelabeld.

### 3.1 Brongegevens (wat uit CRM/agenda komt — wordt door import bijgewerkt)

| Tabel | Inhoud |
|---|---|
| `bronnen` | Per bron: soort (crm/agenda/gesprekken), adapter, testdata ja/nee, **laatst succesvol bijgewerkt**, laatste fout. |
| `import_runs` | Start, einde, status, aantallen (nieuw/gewijzigd/ongewijzigd/genegeerd). |
| `contacten` | Naam, telefoonnummers, e-mail, adres, herkomst, status uit bron (nieuwe lead / prospect / langetermijn), herkomstvelden. `is_lokaal_tijdelijk` voor zelf aangemaakte contacten. |
| `panden` | Adres, type, herkomstvelden. |
| `contact_pand` | Relatie met rol: eigenaar, mede-eigenaar, beslisser, erfgenaam, huurder, ander. Maakt "meerdere beslissers per pand" en "één contact, meerdere panden" mogelijk. |
| `bronactiviteiten` | Taken, notities, Donna-evaluaties, belregistraties uit de bron: type, contact/pand (optioneel), datum, vervaldatum, auteur, tekst, `inhoud_hash`. |
| `afspraken` | Uit agenda-adapter of lokaal: start, einde, hele dag, locatie, titel, gekoppeld contact (optioneel) + **koppelstatus** (bevestigd / voorgesteld / geen). |

### 3.2 Afgeleide gegevens (AI)

| Tabel | Inhoud |
|---|---|
| `extractie_runs` | Welke activiteit, `inhoud_hash`, schemaversie, promptversie, model, tokens, kosten, status. |
| `inzichten` | Per contact één veld (bv. `tijdshorizon`), waarde, **soort** (expliciet / interpretatie), onzekerheid (laag/middel/hoog), bronactiviteit, **letterlijke passage**, brondatum, beoordelingsstatus (voorgesteld / goedgekeurd / afgewezen). |

### 3.3 Lokale gegevens (van jou — een import raakt deze nooit aan)

| Tabel | Inhoud |
|---|---|
| `belpogingen` | Tijdstip, uitkomst (gesproken / geen antwoord / terugbellen op datum / afspraak gemaakt / niet meer bellen), notitie, volgende stap, `is_inhoudelijk`, `ongedaan_op`. |
| `opvolgacties` | Terugbelafspraken en vervolgstappen: datum, optioneel uur, precisie (tijdstip / dag / periode zoals "begin december"), herkomst (bron / lokaal / automatisch na geen antwoord), status (open / afgehandeld / vervallen). |
| `planningskeuzes` | Vastpinnen, vandaag overslaan, uitstellen tot datum, handmatig toegevoegd — met datum en `ongedaan_op` (herstellen). |
| `belverboden` | "Niet meer bellen": wie, wanneer, reden, bron (lokaal of CRM). Met geschiedenis; opheffen kan alleen bewust. |
| `correcties` | Jouw correctie op een veld: waarde, reden, `ingetrokken_op`. Gaat voor alles. |
| `activiteitkoppelingen` | Koppeling lokaal resultaat ↔ mirroractiviteit: status (voorgesteld / bevestigd / verworpen), redenen. |
| `donna_overzichten` | Datum, bewerkbare tekst, opgenomen belpogingen, status **klaargezet** / **door mij doorgegeven** (+ tijdstip). Nooit "bevestigd in CRM" zonder aantoonbare koppeling. |
| `dagplannen` | Momentopname van de lijst van een dag met score-uitleg, zodat de lijst niet verspringt tijdens de dag en je achteraf ziet waarom. |
| `verwijderingen` | "Grafstenen": bron + extern_id van lokaal gewiste records, zodat ze bij een volgende import niet ongemerkt terugkomen. |

### 3.4 Instellingen en kosten

| Tabel | Inhoud |
|---|---|
| `instellingen` | Eén rij per gebruiker, één JSON-document gevalideerd met Zod (met schemaversie): ritmes, gewichten, max per dag, werkuren, pauzes, belduur, reisbuffer, herplanregel, AI-budget, bewaartermijnen, testdatum. **De centrale plaats.** |
| `ai_gebruik` | Per AI-taak: model, input- en outputtokens, geschatte kost, tijdstip. Maandoverzicht = som hiervan. |
| `taak_runs` | Geplande taken: wanneer, resultaat, idempotentiesleutel. |

### 3.5 "Effectieve waarde" van een veld

Voor elk veld dat de planning gebruikt (fase, tijdshorizon, terugbeldatum, belverbod …) geldt deze voorrang:

1. **Jouw correctie** (zolang niet ingetrokken)
2. **Lokaal resultaat** (bv. belpoging met terugbeldatum)
3. **Goedgekeurd AI-inzicht** (alleen als AI-sturing aan staat, vanaf fase 5) — expliciet boven interpretatie, recent boven oud, expliciete terugbelafspraak boven algemene notitie
4. **Bronveld** uit CRM
5. **Onbekend** (nooit gegokt)

De interface toont bij elke waarde waar ze vandaan komt (bron / AI / jij).

---

## 4. Belpoging versus inhoudelijk contact

| Uitkomst | Telt als inhoudelijk contact? |
|---|---|
| Gesproken | Ja |
| Afspraak gemaakt | Ja |
| Terugbellen op datum | Ja (je sprak iemand die een moment voorstelde) — aanpasbaar per poging als het bv. een secretariaat was |
| Niet meer bellen | Ja |
| Geen antwoord / voicemail | **Nee** — telt alleen als poging |

"Laatste inhoudelijk contact" = meest recente inhoudelijke lokale poging óf bronactiviteit van het type gesprek/afspraak, wat het recentst is. Een nieuwe lead met alleen "geen antwoord" blijft dus "nog niet bereikt".

---

## 5. Prioriteit

### 5.1 Harde regels (eerst, in deze volgorde)

1. **Belverbod** (lokaal of uit CRM) → uitgesloten. Vastpinnen omzeilt dit niet; de app toont dan "kan niet: belverbod".
2. **Toekomstige expliciete terugbeldatum** → niet op de lijst vóór die dag. Bij een periode ("begin december") → vanaf de eerste werkdag van die periode, gelabeld als "periode, geen vaste datum".
3. **Uitgesteld tot datum** → weg tot die datum.
4. **Vandaag overgeslagen** → enkel vandaag weg; morgen gewoon terug.
5. **Afspraak vandaag met dit contact** → niet op de bellijst, wel bij afspraken.
6. **Geen bruikbaar telefoonnummer** → niet op de bellijst, wel in een aparte lijst "Nummer zoeken".
7. **Pauze na te veel onbeantwoorde pogingen** → in de lijst "Handmatig beoordelen" (zie §6).

### 5.2 Timeline eerst (afgestemd met Jonas, 3/10/2026)

De afgesproken **volgende stap** (timeline) uit het gesprek stuurt de planning; het ritme is enkel het vangnet. Een timeline komt uit een ERAForce-opvolgtaak met vervaldatum, uit de evaluatietekst (AI, eerst door Jonas goedgekeurd), of uit de snelle tik "terugbellen op…" in de app.

| Blok op Vandaag | Wie | Volgorde |
|---|---|---|
| **Gepland vandaag** | Opvolging vandaag mét uur (A), daarna vandaag zonder uur of te laat (C) | A op uur; C langst te laat eerst |
| **Vastgepind** | Door Jonas op de lijst gezet | Zoals gepind |
| **Nieuwe leads** | Nog niet bereikt, maximaal **3 dagen** oud | Nieuwste eerst |
| **Aanvulling volgens ritme** | Geen opvolgtaak gepland maar aan de beurt (of vroeger dankzij een hook) | Op score |

- Een vergeten belofte (C) gaat net vóór een nieuwe lead.
- Prospects **zonder opvolgtaak** worden niet als taak getoond; enkel geteld in één regel. Jonas werkt ze af via zijn ERAForce-dashboard. Ze blijven wel als vangnet in "aanvulling" komen als ze lang niets hoorden.
- "Warm" = er is een timeline afgesproken, of de klant kocht al iets anders. Een warme prospect zonder opvolgtaak komt na 7 dagen in de aanvulling.
- Scores staan niet op de kaart; de reden in gewone taal wel. "Waarom?" toont de opbouw.

### 5.3 Score (enkel voor de volgorde in "aanvulling" en bij gelijkstand)

| Onderdeel | Punten (instelbaar) |
|---|---|
| Ritme-achterstand | 25 × (dagen sinds gesprek ÷ ritme), max 60 |
| Fase | warm +15, lauw +8 |
| Tijdshorizon | < 3 maanden **+40**, 3–12 maanden +10 |
| Hook (specifiek, niet algemeen) | **+20** |
| Bron: Realo-sellerlead, zelf contact opgenomen, schattingsaanvraag | +10 |
| Eigen vervolgstap vandaag/verstreken | +20 |

Ritmes: **warm zonder timeline 7 d · lauw 60 d · koud 180 d**. Aan de beurt vanaf 80 % van het ritme; met een hook vanaf 50 %. De ERAForce-opvolgingsindicator wordt genegeerd (niet relevant).

### 5.4 Voorbeelden (testdatum dinsdag 13/10/2026)

| Contact | Situatie | Resultaat |
|---|---|---|
| Mevr. Peeters | Opvolging vandaag 10u30 | Gepland vandaag, bovenaan |
| Fam. Janssens | Opvolging was vr 9/10 | Gepland vandaag, "2 werkdagen te laat" — vóór de nieuwe leads |
| Dhr. Claes | Realo/website-lead van gisteren, 1× geen antwoord | Nieuwe leads |
| Dhr. Wouters | Warm, 21 dagen, geen opvolgtaak, wil binnen 3 maanden verkopen | Aanvulling: 60 + 15 + 40 = **115** |
| Dhr. Dubois | Lauw, 50 dagen (ritme 60), horizon volgend jaar, Realo | Aanvulling: 21 + 8 + 10 + 10 = **49** |
| Mevr. Maes | Koud, 200 dagen (ritme 180) | Aanvulling: **28** — met een hook 48, dan vóór een lauwe die net aan de beurt is (43) |
| Mevr. Willems | Koud, 60 dagen | Nog niet aan de beurt |
| Dhr. Mertens | Wil niet meer gebeld worden | Uitgesloten, ook als vastgepind |
| Fam. Goossens | Opvolging na nieuwjaar | Onzichtbaar tot 4/1/2027 |

**Te valideren met echte data:** deze regels zijn afgestemd op Jonas' werkwijze, maar pas met echte evaluaties (fase 8) te toetsen. Eerst 10 echte voorbeelden samen bekijken.

### 5.5 Limiet van 15 zonder dingen te verstoppen

- Groep A gaat altijd mee, ook als dat boven 15 komt (met waarschuwing).
- Onder de lijst: **"Niet op vandaag: 12 — waarvan 3 verstreken terugbelafspraken, 9 over ritme"**, uitklapbaar.
- Achterstand blijft groeien in de score, dus wie blijft liggen komt vanzelf hoger.
- Het dagplan wordt 's morgens vastgelegd; nieuwe lokale resultaten werken het meteen bij, zonder dat de hele lijst herschikt.

---

## 6. Belresultaten, herplanning en handmatige keuzes

### 6.1 Geen antwoord (startwaarden, instelbaar)

| Poging zonder antwoord op rij | Volgende poging |
|---|---|
| 1 | volgende werkdag (nieuwe lead: eerst nog 1× later dezelfde dag) |
| 2 | +2 werkdagen |
| 3 | +4 werkdagen |
| na 3 | **geen automatische poging meer** → lijst "Handmatig beoordelen" met voorstel: pauze 30 dagen, sms/mail sturen, of toch opnieuw |

- Een bestaande, latere terugbelafspraak wordt nooit vervroegd of overschreven.
- Weekends en feestdagen worden overgeslagen.
- De teller reset bij een inhoudelijk contact.

### 6.2 Andere uitkomsten

- **Gesproken** → korte notitie + volgende stap (optioneel datum).
- **Terugbellen op datum** → opvolgactie met datum (en uur indien gekozen).
- **Afspraak gemaakt** → lokale afspraak. De app schrijft niet naar de agenda in ERAForce.
- **Niet meer bellen** → belverbod, met bevestigingsvraag en apart van "overslaan" (andere kleur, andere tekst).

### 6.3 Handmatige keuzes

Vastpinnen · alleen vandaag van de lijst · uitstellen tot datum · bestaand contact toevoegen · tijdelijk lokaal contact aanmaken. Alles is te **herstellen** (ongedaan maken) — keuzes worden niet gewist maar gemarkeerd als ongedaan.

### 6.4 Registreren met zo weinig mogelijk handwerk (vastgelegd 3/10/2026)

- **ERAForce is de bron** voor gesprekken en wat er gezegd is. Jonas logt daar een gedane taak na een gesprek (zoals nu). Zodra de mirror er is, neemt de app die automatisch over.
- **Berichten** worden niet in ERAForce gelogd; omdat ze vanuit de app vertrekken, registreert één tik "Verstuurd" ze.
- **Eén optionele tik na het bellen:** bel je via de app, dan vraagt die bij terugkomst *gesproken / geen antwoord / terugbellen / later*. Negeren = niets gelogd. Zo past de lijst zich dezelfde dag aan, ook als de mirror maar 's nachts ververst.
- **"Reactie ontvangen"** hoeft niet ingegeven te worden: een reactie die tot een gesprek of nuttige info leidt, staat in ERAForce en telt dan als inhoudelijk contact.
- Een webapp op iOS kan belgeschiedenis, sms en WhatsApp niet lezen; automatische herkenning kan enkel via ERAForce, later via Plaud (gesprekken) en eventueel de Outlook-inbox (mailreacties, vraagt ERA-IT-toestemming).
- Het **avondoverzicht voor Donna vervalt** (Jonas logt zelf in ERAForce). De code blijft bewaard voor als het later toch nodig is.
- Herkenning van ERAForce-taken (fase 8): een vast begin maakt het betrouwbaar, bv. "Gebeld – gesproken", "Gebeld – geen antwoord", "Terugbellen 20/10"; vrije tekst wordt vanaf fase 4 door de AI gelezen. Dubbele registraties (snelle tik + ERAForce-taak) worden herkend volgens §7.2; voor de planning telt sowieso het recentste contact.

### 6.5 Gewichten bijsturen

De app bewaart je keuzes (vastpinnen, overslaan …). Pas na voldoende gegevens (bv. 4 werkweken) kan ze een **voorstel** tonen ("je pint vaak koude prospects; ritme koud verlagen?"). Gewichten veranderen nooit automatisch. Dit voorstel bouwen we pas in een latere fase.

---

## 7. Lokale resultaten en synchronisatie

### 7.1 Basisregels

- Lokale resultaten tellen **meteen** mee, ook als de mirror achterloopt.
- Een import werkt alleen brontabellen bij. Correcties, belpogingen, keuzes en belverboden blijven staan.
- Wijzigt een bronrecord waarop je een correctie hebt, dan blijft je correctie gelden en toont de app **"bron gewijzigd na je correctie — bekijken?"**.
- Ongewijzigde inhoud (zelfde `inhoud_hash`) wordt niet opnieuw naar de AI gestuurd.

### 7.2 Dubbele activiteiten herkennen (lokaal ↔ later via Donna in mirror)

Een mirroractiviteit is een **kandidaat** voor een lokaal resultaat als:
- zelfde contact, én
- datum binnen −1 tot +3 werkdagen van de lokale poging (Donna verwerkt later), én
- compatibel type (gesprek/notitie/taak), én
- inhoudelijke overeenkomst (gedeelde kernwoorden, terugbeldatum, uitkomst).

| Situatie | Status |
|---|---|
| Referentie `DP-xxxx` letterlijk gevonden in mirrortekst | **Bevestigd** (aantoonbaar) |
| Precies één sterke kandidaat | **Voorgesteld** — jij bevestigt met één tik |
| Meerdere of zwakke kandidaten | **Onbevestigd**, beide blijven zichtbaar |

Bij twijfel blijft de koppeling dus onbevestigd. Gevolg voor de planning is klein: "laatste inhoudelijk contact" neemt sowieso de recentste datum, en pogingentellers gebruiken enkel lokale pogingen.

### 7.3 Ontbrekende en verwijderde records

- Ontbreekt een record in de mirror, dan is het **niet** automatisch verwijderd. Na meerdere volledige imports zonder dat record → markering "niet meer gezien in bron" ter controle.
- Alleen een expliciet verwijdersignaal van de bron (als de mirror dat biedt) leidt tot "verwijderd in bron", en ook dan blijven lokale gegevens bewaard tot jij beslist.

### 7.4 Lokaal verwijderen

- Je kunt per contact alle lokale gegevens en afgeleide inzichten wissen. **Dat verwijdert niets uit ERAForce.**
- We bewaren alleen een grafsteen (bron + extern ID, geen naam of tekst). Bij de volgende import wordt dat record overgeslagen en geteld als "genegeerd wegens lokale verwijdering".
- In Instellingen kun je een grafsteen opheffen; dan komt het record bij de volgende import terug.

---

## 7b. Contactstrategie — de ossenpikker-aanpak

**Principe: altijd aanwezig, nooit opdringerig.** De ossenpikker zit op de neushoorn omdat hij nuttig is.
- *Altijd aanwezig:* niemand valt uit beeld. Het ritme blijft lopen en tussen gesprekken houdt een licht contact (bericht of mail met iets nuttigs) de band warm.
- *Nooit opdringerig:* elk contactmoment levert de klant iets op (buurt/markt, dossier, persoonlijke attentie); "even checken" is enkel de terugvaloptie. Na 2× geen antwoord een bericht in plaats van een 3e belpoging, na een bericht eerst rust, nooit twee contactmomenten op één dag (behalve een nieuwe lead), geen berichten buiten de rustige uren, en een voorkeur van de klant gaat altijd voor.

### 7b.1 Kanaaladvies (gewone code, instelbaar)

| Situatie | Advies |
|---|---|
| Standaard | 📞 Bellen |
| 2× geen antwoord op rij | 💬 Berichtje (sms/WhatsApp) in plaats van een 3e belpoging |
| Na een berichtje zonder reactie | 3 werkdagen wachten, daarna nog één keer bellen; daarna handmatig beoordelen |
| Geen telefoonnummer, wel e-mail | ✉️ Mail |
| Langetermijn/koud met een informatieve hook (bv. marktinfo) | ✉️ Mail of 💬 bericht — rustig te lezen, geen druk |
| Voorkeur van het contact ("liever sms", "enkel mail", "na 17u") | Altijd gerespecteerd (harde regel) |
| Berichten | Niet vóór 9u, niet na 20u, niet op zondag |

De app verstuurt **nooit zelf**: de knoppen openen Berichten, WhatsApp of Mail met een voorgestelde tekst, jij past aan en verstuurt. Daarna tik je "verstuurd" zodat het meetelt. Een verstuurd bericht is geen inhoudelijk contact; een reactie wel.

### 7b.2 Hooks

Een *hook* is een concrete, herleidbare reden om contact op te nemen. Elke hook heeft: soort, korte tekst, bron, datum, geldig-tot en een gevoeligheidsvlag.

| Soort | Voorbeelden | Bron |
|---|---|---|
| Buurt/markt | woning verkocht of te koop in de straat, prijsevolutie in de wijk, werken of nieuw project in de buurt | nu: manueel of fictief; later: Marktradar |
| Dossier | einde huurcontract nadert, pensioen in zicht, een jaar na de schatting, verbouwing klaar | afgeleid uit de gegevens (later ook AI) |
| Regelgeving/algemeen | wijziging die eigenaars raakt (bv. EPC/renovatie, premies) | manueel, met bron |
| Persoonlijk | verjaardag, iets wat je zelf zag of hoorde | **enkel manueel door jou** |

Regels:
- Een hook met een geldige datum geeft extra punten in de score (instelbaar gewicht) en een voorgestelde opening/tekst die ernaar verwijst.
- Gevoelige onderwerpen (overlijden, ziekte, scheiding, financiële problemen) worden nooit als hook voorgesteld of in een tekst gebruikt.
- Persoonlijke hooks toont de app enkel als tip voor jou (bv. "verjaardag 14/10"); ze komen nooit vanzelf in een voorgestelde tekst. Jij beslist of en hoe je ze gebruikt.
- Verlopen hooks verdwijnen vanzelf; je kunt hooks altijd wissen.

### 7b.3 Sociale media

De app **leest geen Facebook of andere sociale media uit**: dat mag niet volgens hun voorwaarden en het botst met de GDPR. Wel kan de app een knop tonen die een zoekopdracht opent ("bekijk even sociale media"). Wat je zelf ziet en nuttig vindt, noteer je kort als persoonlijke hook.

### 7b.4 Na te gaan met ERA vóór echte data (geen juridisch advies)

- **Bellen:** respecteert ERA de Bel-me-niet-meer-lijst, en voor welke contacten geldt die (bv. niet voor wie zelf een schatting vroeg)?
- **Sms/WhatsApp/mail:** in België vraagt elektronische direct marketing aan particulieren in principe voorafgaande toestemming. Persoonlijke 1-op-1 opvolging van iemand die zelf contact zocht, ligt anders. Wat is het ERA-beleid?
- **Persoonlijke hooks** (verjaardag, sociale media) zijn persoonsgegevens: enkel bewaren wat nodig en gepast is, met bewaartermijn en wisknop.

### 7b.5 Fasering

- **Fase 3b (nu, zonder AI):** kanaaladvies, bericht-/mailknoppen met sjablonen, "verstuurd" en "reactie" registreren, contactvoorkeuren, hooks (manueel, uit het dossier, fictieve buurthooks in de testdata), scorebonus, rustige uren.
- **Fase 4–5 (AI):** hooks en voorkeuren uit notities halen (met bron), persoonlijke berichten en openingszinnen rond een hook.
- **Marktradar (later):** buurthooks automatisch uit toegestane bronnen.

---

## 8. AI-extractie, openingszinnen en briefings

### 8.1 Extractie (fase 4)

- Velden: verkoopmotivatie, tijdshorizon, prijsverwachting, bezwaren, beslissers, terugbelafspraak, volgende stap, fase (koud/lauw/warm), aanspreekvorm (u/je), herkomst.
- Vast Zod-schema met versie; de API gebruikt **structured outputs**, en we valideren alsnog zelf. Ongeldige uitvoer wordt niet opgeslagen.
- Per veld: waarde of `onbekend`, soort (expliciet/interpretatie), onzekerheid, letterlijke passage, brondatum.
- Relatieve datums ("volgende week", "na de zomer") worden omgerekend **vanaf de datum van de brontekst**. Vage perioden blijven perioden.
- Tegenstrijdigheden (bv. "wil snel verkopen" vs. latere "wacht tot pensioen") worden getoond als ze de planning raken.
- Bronteksten gaan als afgebakende **gegevens** naar het model, met de uitdrukkelijke instructie dat tekst in de notities geen opdracht is.
- Vóór verzending verwijderen we telefoonnummers, e-mailadressen en exacte adressen uit de tekst.
- **Beoordelingspoort:** AI-inzichten sturen de planning pas als jij eerst voorbeelden hebt beoordeeld en de schakelaar "AI-context gebruiken" aanzet.

### 8.2 Openingszinnen en briefings (fase 5–6)

- Kort, natuurlijk Belgisch-Nederlands, juiste aanspreekvorm, alleen op basis van herleidbare context. Geen verzonnen eerdere gesprekken, geen gevoelige persoonlijke aanleiding (overlijden, ziekte, scheiding …).
- Zonder AI of context: standaardzin, bv. *"Goeiemorgen meneer Claes, met Jonas van ERA. U had interesse getoond in een schatting van uw woning — past het even?"*
- Briefing per afspraak: wie/waar/waarvoor, historiek in 3–5 regels, motivatie, bezwaren, open vragen, drie gesprekssuggesties. Zonder duidelijke koppeling: beperkte briefing + knop "koppelen".
- Voorlezen alleen op jouw verzoek (ingebouwde spraak van iOS, geen externe dienst).

### 8.3 Model en kosten

- Standaardmodel: **Claude Opus 5.5** (`claude-opus-5-5`, $4 per miljoen input-tokens, $20 per miljoen output-tokens), met lage "effort" voor eenvoudige taken. Het model is instelbaar; een goedkoper model kiezen is jouw beslissing.
- Ruwe schatting (één gebruiker, fictieve data):
  - Eerste extractie 60 contacten: ± $1–2 eenmalig.
  - Openingszinnen 15/dag + 3 briefings/dag: ± $3–5 per maand.
  - Totaal ruim binnen **€10/maand**.
- Elke aanroep registreert model, tokens en geschatte kost. Maandoverzicht in Instellingen.
- Vóór elke taak: past de geschatte maximale kost nog in het budget? Zo niet → taak overslaan, standaardzin gebruiken, melding tonen. De planner blijft volledig werken.
- **Beperking van ramingen:** de kost wordt berekend uit tokens × publieke prijs in dollar, omgerekend met een instelbare wisselkoers. Btw, prijswijzigingen en afrondingen bij Anthropic kunnen afwijken; de factuur in de Anthropic Console is de waarheid.

---

## 9. Privacy, toegang en gegevenskaart

| Dienst | Welke gegevens | Wanneer |
|---|---|---|
| Supabase (EU-regio) | Alle app-gegevens (contacten, notities, belresultaten, instellingen) | Vanaf fase 1 — enkel fictief |
| GitHub Pages | Alleen de gebouwde app-bestanden (geen gegevens) | Vanaf fase 1 |
| Supabase Edge Functions | Technische logs **zonder** persoonsgegevens of prompts | Vanaf fase 4 |
| Anthropic (Claude API) | Alleen noodzakelijke tekstfragmenten, ontdaan van telefoon/e-mail/adres | Vanaf fase 4 — enkel fictief |
| GitHub (repository) | Code, migraties, fictieve fixtures. Geen echte data, geen sleutels | Vanaf fase 1 |
| ERAForce-mirror (CRM + agenda), Plaud | Pas na apart akkoord | Fase 8 en 10 |

Regels:
- Login verplicht; RLS op elke tabel; tests die nagaan dat gebruiker A niets van gebruiker B ziet.
- Geheimen lokaal in `.env.local` (genegeerd door git), online als Supabase-geheimen (alleen leesbaar voor Edge Functions). In de app zelf staan enkel het Supabase-adres en de publieke sleutel, die daarvoor bedoeld zijn. `.env.example` zonder echte waarden.
- Logs bevatten ID's en aantallen, nooit namen, notities of volledige prompts.
- Bewaartermijnen instelbaar (bv. belpogingen 24 maanden, AI-ruwe uitvoer 90 dagen). Volledige transcripten standaard niet bewaren, enkel samenvattingen.
- **Vóór echte ERA-data**: deze tabel herbekijken, controleren of Anthropic-, Supabase- en GitHub-voorwaarden voor ERA volstaan (verwerkersovereenkomst/DPA), en jouw uitdrukkelijk akkoord.

---

## 10. Accounts, kosten en toestemmingen

### 10.1 Wat jij moet regelen (met mijn stapsgewijze instructies op het moment zelf)

| Wat | Wanneer | Kost |
|---|---|---|
| **Xcode Command Line Tools** op je Mac (nodig voor git) | Begin fase 1 | Gratis — vraagt je Mac-wachtwoord |
| **Node.js LTS** via het officiële installatieprogramma (nodejs.org) | Begin fase 1 | Gratis — vraagt je Mac-wachtwoord |
| **GitHub**: repository aanmaken (openbaar of privé, §10.2) en GitHub Pages aanzetten | Fase 1 | Gratis bij openbaar; ± $4/maand (GitHub Pro) bij privé |
| **Supabase**: account + 2 projecten (dev en test) in EU-regio | Fase 1 | Gratis plan volstaat voor fictieve data |
| **Anthropic Console**: account, API-sleutel, kleine tegoedstorting, maandlimiet instellen | Fase 4 | Betalen per gebruik (raming hierboven) |
| Apple Developer-account | Niet nodig voor webpush | — |
| ERA-IT: toegang ERAForce-mirror | Fase 8 | n.t.b. |
| Plaud: nagaan of er een officiële export/API is | Fase 10 | Niet beloofd tot onderzocht |

### 10.2 Twee aandachtspunten die ik onderzocht heb

1. **GitHub Pages is gratis, maar alleen vanuit een openbare repository.** Dan is je code openbaar zichtbaar. Er staan geen gegevens of geheime sleutels in: echte gegevens zitten in Supabase achter login, en de testdata is verzonnen. Wil je de code privé houden, dan kost dat GitHub Pro (± $4/maand); de site zelf blijft wel bereikbaar voor wie het adres kent, maar zonder login zie je niets. GitHub Pages is niet bedoeld voor commerciële webdiensten; een persoonlijk werkhulpmiddel is dat niet, maar het blijft een grijze zone. Beslissing voor jou: **openbaar (gratis)** of **privé (GitHub Pro)**.
2. **Supabase gratis plan pauzeert een project na 1 week zonder gebruik.** Bij dagelijks gebruik geen probleem; na een vakantie moet je het met één klik herstellen. Voor echt dagelijks gebruik met echte data adviseer ik later Supabase Pro (± $25/maand), dat niet pauzeert.

### 10.3 Verwachte maandkost

| Scenario | Ongeveer |
|---|---|
| Fase 1–3, fictief | $0 (of $4 voor GitHub Pro bij privé-code) |
| Fase 4–7, fictief met AI | + $3–8 AI |
| Dagelijks gebruik met echte data | ± $25 Supabase Pro (niet pauzeren, back-ups) + eventueel $4 GitHub Pro + AI binnen budget |

---

## 11. Fictieve testdata

- **~60 Belgische contacten**, gegenereerd met een vaste seed → elke keer exact dezelfde data.
- Alle datums **relatief aan de testdatum** (bv. "laatste gesprek = testdatum − 21 dagen"), dus de data veroudert nooit.
- Mix: ±12 nieuwe leads, ±25 actieve prospects, ±23 langetermijnprospects, verspreid over regio's (Gent, Antwerpen, Brugge, Leuven, Kortrijk, Aalst, …).
- Taken, notities, afspraken, contacthistoriek en verzonnen Donna-evaluaties in kort Belgisch-Nederlands met afkortingen en onvolledige notities (bv. *"tel. gehad m. dhr, vrouw wil nog nt verkopen, tb na nieuwjaar?? — evt. schatting app."*).
- Randgevallen (elk met een vaste naam zodat tests ernaar verwijzen):
  - pand met meerdere eigenaars/beslissers (broer en zus, erfenis)
  - contact met meerdere panden (investeerder met 3 appartementen)
  - contact zonder telefoonnummer
  - afspraak zonder gekoppeld contact
  - prospect die niet meer gebeld wil worden
  - expliciete afspraak om pas over enkele maanden terug te bellen
  - lokaal belresultaat dat nog niet in de CRM-bron staat
  - tegenstrijdige notities (Donna-evaluatie vs. eigen notitie)
  - terugbelafspraak met uur vandaag, zonder uur vandaag, en verstreken
  - nieuwe lead met 1 en met 3 onbeantwoorde pogingen
  - afspraak die de hele dag duurt, overlappende afspraken
- Alles gelabeld als **testdata**; in de interface staat een duidelijke "TESTDATA"-strook.

---

## 12. Fases en acceptatiecriteria

Elke fase sluit af met: wat werkt · hoe je het zelf test · wat je moet regelen · uitgevoerde controles · bekende beperkingen · voorstel volgende fase. Werkende stappen worden gecommit en in `CHANGELOG.md` gezet.

### Fase 1 — Projectsetup, login, fictieve data, Vandaag-pagina
- Vite + React + TypeScript project, git-repo op GitHub, `.env.example`, `CHANGELOG.md`.
- Automatische publicatie naar GitHub Pages bij elke geteste wijziging.
- Supabase-migraties voor de basistabellen, RLS aan op alle tabellen.
- Login met e-mail + wachtwoord (werkt betrouwbaar in een geïnstalleerde iPhone-app; magische links openen vaak Safari i.p.v. de app).
- Instelbare klok + testdatum; fictieve data-generator met vaste seed; laadknop "testdata opnieuw laden".
- **Vandaag-pagina** (gsm-eerst): afsprakenlijst van de dag en een eenvoudige lijst contacten (nog zonder score), TESTDATA-strook, "laatst bijgewerkt" per bron.
- PWA-manifest + icoon: installeerbaar op het beginscherm.
- **Acceptatie:** je kunt op je iPhone inloggen, de app op je beginscherm zetten, en ziet de fictieve afspraken en contacten van de testdatum. Zonder login zie je niets. Na wijzigen van de testdatum verschuiven de afspraken mee. Tests voor klok, seed (2× genereren = identiek) en toegang (gebruiker B ziet niets van A) slagen.

### Fase 2 — Bellijst met deterministische score en uitleg
- Harde regels (§5.1), groepen A–D, score (§5.3), limiet en "niet op vandaag"-teller (§5.5).
- Kaart per contact: naam, fase, pand/adres, reden vandaag, laatste inhoudelijk contact, standaard-openingszin, **Bel**-knop (`tel:`), **Waarom?**.
- Aparte lijsten: "Nummer zoeken", "Handmatig beoordelen".
- Instellingen-pagina: ritmes, gewichten, maximum.
- **Acceptatie:** alle voorbeelden uit §5.4 geven exact het getoonde resultaat (als test). Vastgepind contact met belverbod verschijnt niet. Met 30 kandidaten toont de app 15 + "Niet op vandaag: 15". Tests voor datumgrenzen (middernacht, zomertijd, weekend) slagen.

### Fase 3 — Belresultaten, keuzes, herplanning, Donna-overzicht
- Vijf uitkomsten met grote knoppen; notitie + volgende stap na "gesproken".
- Herplanning na geen antwoord (§6.1) met werkdagen en stoplimiet.
- Vastpinnen, overslaan vandaag, uitstellen, toevoegen, tijdelijk contact, herstellen.
- ~~Avondoverzicht~~ vervallen (zie §6.4); vervangen door één optionele tik na het bellen.
- **Acceptatie:** na "geen antwoord" verdwijnt het contact en verschijnt het op de juiste werkdag; na 3× staat het bij "Handmatig beoordelen". "Overslaan" is morgen terug, "Niet meer bellen" niet. Elke keuze is ongedaan te maken. Een lokaal resultaat telt meteen mee terwijl de fictieve mirror nog niets weet. Een nieuwe import overschrijft geen enkele lokale keuze (test).

### Fase 3b — Contactstrategie (ossenpikker), zonder AI
- Kanaaladvies per contact (bellen / berichtje / mail) volgens §7b.1; contactvoorkeuren als harde regel.
- Knoppen sms, WhatsApp en mail met voorgestelde tekst; jij verstuurt, de app registreert "verstuurd" en later "reactie".
- Hooks: manueel toevoegen (incl. persoonlijk), afgeleid uit het dossier, fictieve buurthooks in testdata; scorebonus; gevoelige onderwerpen uitgesloten.
- **Acceptatie:** na 2× geen antwoord stelt de app een bericht voor in plaats van een 3e belpoging; een bericht telt niet als gesprek, een reactie wel; na een bericht wacht de app 3 werkdagen; een contact met "enkel mail" krijgt nooit belen als advies; een geldige hook verhoogt de score en verschijnt in de voorgestelde tekst; een verlopen of gevoelige hook niet; berichten niet buiten de rustige uren voorgesteld.

### Fase 4 — AI-extractie, bronnen en correcties
- Prompt v1 + schema v1, budgetcontrole, kostenlog, maandoverzicht.
- Contactpagina: historiek, bronnen, inzichten met passage en label (bron / AI / jij), corrigeren en intrekken.
- Beoordelingsscherm voor voorbeelden; AI-sturing standaard uit.
- **Acceptatie:** ontbrekende info blijft "onbekend"; tegenstrijdige notities worden getoond; ongewijzigde notities worden niet opnieuw verwerkt; prompt-/schemawijziging triggert herverwerking; bij uitgeschakelde of falende AI en bij bereikt budget werkt de Dagplanner gewoon (tests met nep-AI). Een notitie met "negeer je instructies…" verandert de uitvoer niet (test).

### Fase 5 — Contextgestuurde prioritering en openingszinnen
- Goedgekeurde inzichten (fase, horizon, terugbel) via de voorrangsregel (§3.5) in de score.
- AI-openingszinnen met aanspreekvorm; standaardzin als terugval.
- **Acceptatie:** een correctie van jou wint altijd van AI; een expliciete terugbelafspraak wint van een algemene notitie; openingszinnen bevatten geen feiten die niet in de bron staan (steekproef + regels).

### Fase 6 — Belmomenten (gebouwd 3/10/2026); afspraakbriefings vervallen (Donna levert ze)
- Instellingen: werkuren, pauzes, belduur, reisbuffer.
- Vrije belblokken tussen afspraken (overlap, hele-dag-afspraken, zomertijd) en verdeling van de lijst over de blokken; melding als niet alles past; blokken aanpasbaar.
- Briefings (30 seconden leestijd), beperkte briefing + koppelen bij twijfel; voorlezen op verzoek.
- **Acceptatie:** testdag met overlappende afspraken en een hele-dag-afspraak geeft correcte blokken; reistijd wordt nooit als "exact" voorgesteld.

### Fase 7 — Pushmeldingen (gebouwd 3/10/2026: ochtend, belmoment, terugbelherinnering via GitHub Actions elke 10 min) en mobiele controle
- Eerst actuele iOS-ondersteuning nagaan; dan webpush met service worker, toestemming via een knop.
- Meldingen zonder klantdetails ("3 terugbelafspraken vandaag"); herinneringen ook in de app.
- Volledige controle op iPhone-formaat (Playwright) + jouw eigen test.
- **Acceptatie:** melding komt binnen op je geïnstalleerde iPhone-app; zonder toestemming werkt alles behalve meldingen.

### Fase 8 — ERAForce-mirror (zodra beschikbaar)
**Opruimen bij de start van fase 8 (op vraag van Jonas, 3/10/2026):** de tijdelijke instelling **"Testlink voor alle contacten"** (`eraforce.testIdVoorIedereen`) én de tijdelijke functie **"Koppel aan ERAForce"** (link plakken op de contactpagina, tabel `eraforce_koppelingen`, component `EraforceKoppeling.tsx`) verwijderen zodra de mirror de ERAForce-ID's levert. Bestaande koppelingen eerst nakijken, dan via een migratie de tabel laten vallen.

Eerste waarnemingen staan al in [DATA.md](DATA.md): prospects zijn Salesforce-**Leads**, gesprekken zijn **Taken** (recordtype "ERAforce Taken algemeen", type "Uitgaande Oproep") die via **Maf Call** ontstaan. Bellen gebeurt via ERAForce; de Dagplanner opent het record met één tik (knop "Bel via ERAForce", gebouwd 3/10/2026).
Volgt de 8 stappen uit je instructies: inventaris → DATA.md → mappingvoorstel → **jouw akkoord** → alleen-lezen adapter → tests (herhaalde import, wijzigingen, ontbrekende velden, verwijderingen, lokale resultaten) → 10 extractievoorbeelden beoordelen.

### Fase 9 — vervallen (agenda zit in ERAForce)
Je agenda staat in Salesforce/ERAForce, Outlook gebruik je enkel voor mail. Een Outlook-koppeling is dus niet nodig: afspraken komen mee met de ERAForce-mirror in fase 8. Blijkt de mirror de agenda niet (of te traag) te bevatten, dan bekijken we in fase 8 een alternatief.

### Fase 10 — Plaud-samenvattingen
Eerst handmatige import (plakken/bestand), daarna enkel een officieel ondersteunde koppeling als die bestaat.

Fases 8–10 mogen in andere volgorde als een bron eerder beschikbaar is; dat bespreken we dan.

---

## 13. Wat volledig met fictieve data werkt

| Fase | Fictief bruikbaar? |
|---|---|
| 1–3 | Volledig, geen AI nodig |
| 4–5 | Volledig met fictieve notities; Anthropic-sleutel nodig voor echte AI-uitvoer, tests draaien met nep-AI |
| 6 | Volledig met fictieve agenda |
| 7 | Volledig |
| 8–10 | Adapter-skelet en tests met fictieve "mirror"-bestanden; echte werking vraagt toegang |

---

## 14. Aannames (omkeerbaar — zeg het als iets niet klopt)

1. De app-interface is in het Nederlands; de code (namen van variabelen) in het Engels, de tabellen in het Nederlands zoals hierboven.
2. "Nieuwe lead" = contact met status nieuwe lead, binnengekomen ≤ 14 dagen, nog geen inhoudelijk contact.
3. Werkdagen ma–vr; Belgische wettelijke feestdagen als standaard.
4. Standaardwerkuren 8u30–18u00 met middagpauze 12u30–13u15; belduur 6 min; reisbuffer 20 min (fase 6, instelbaar).
5. Standaard-aanspreekvorm **u** zolang niets anders bekend is.
6. Login met e-mail + wachtwoord; geen tweestapsverificatie in fase 1 (kan later).
7. Eén taal-/regio-instelling: nl-BE, datums als "di 13 okt".
8. Testdatum standaard dinsdag 13 oktober 2026, 07:30.
9. "Afspraak gemaakt" telt als inhoudelijk contact én zet een lokale afspraak; die verschijnt in fase 6 ook in de belblokken.

## 15. Open punten

1. **Code openbaar (gratis) of privé (GitHub Pro, ± $4/maand)** (§10.2) — beslissen vóór fase 1.
2. Komt Donna's verwerking doorgaans dezelfde dag of de volgende dag in ERAForce? (Bepaalt het venster in §7.2; nu −1/+3 werkdagen.)
3. Wil je de referentiecode `DP-xxxx` in het Donna-overzicht? (Maakt koppeling aantoonbaar, maar vraagt dat Donna die mee overneemt.)
4. ERAForce-mirror: vorm (database, export, API?) en verversingsfrequentie — pas bekend bij toegang.
5. Plaud: bestaat er een officiële export of API voor jouw abonnement? — te onderzoeken in fase 10.
6. Agenda: staat in Salesforce/ERAForce (vastgesteld 3/10/2026). Nagaan in fase 8 of afspraken (Events/Tasks of eigen objecten) in de mirror zitten en hoe vaak ze ververst worden — voor een dagplanner is de verversingsfrequentie van de agenda belangrijk.
7. **Vóór Marktradar en VMA:** beslissen welke gegevensverzameling (bv. dagelijkse momentopnames van toegestane bronnen) eerder moet starten om historiek op te bouwen. Ik leg dit voor na fase 7, met de gebruiksvoorwaarden van mogelijke bronnen.

## 16. Roadmap (niet bouwen nu)

**Spraakbesturing (later, onderzocht 3/10/2026):** de spraakherkenning van de browser werkt niet in een app op het beginscherm van de iPhone. Werkbare opties voor later: (A) spraakknop in de app via het dicteermicrofoontje van het toetsenbord + AI-interpretatie met bevestiging; (B) "Hé Siri" via een iPhone-opdracht die naar de server gaat en hardop antwoordt (handenvrij, voor in de auto); (C) voorlezen van lijst en briefings. Vraagt de Claude API. Een echte iPhone-app (volledige Siri) is nu niet de moeite.


Dagafsluiting · Leadmelder · Prospectiekaart · Marktradar · Uitgebreide langetermijnopvolging · Vergelijkende marktanalyse (VMA).
De VMA-principes uit je instructies (gerealiseerde vs. vraagprijzen gescheiden, geen willekeurige korting, onzekerheid tonen, berekening in code, AI alleen voor toelichting) blijven gelden en worden in een eigen plan uitgewerkt wanneer we daar komen.
