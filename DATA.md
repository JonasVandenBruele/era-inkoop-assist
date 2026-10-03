# DATA — ERAForce (Salesforce) en andere bronnen

Status: **eerste waarnemingen** (3 oktober 2026), op basis van screenshots van de Salesforce-app op Jonas' iPhone. De volledige inventaris (velden, relaties, historiek, verversingsfrequentie van de mirror) volgt in fase 8 zodra de mirror beschikbaar is. Geen echte namen, nummers of record-ID's in dit document.

## ERAForce

| Wat | Waarneming | Gevolg voor de Dagplanner |
|---|---|---|
| Platform | Salesforce Lightning, eigen ERA-domein (`*.lightning.force.com`) | Domein staat als repo-variabele `VITE_ERAFORCE_DOMEIN`, niet in de code. |
| Prospect | Salesforce-object **Lead** (ID begint met `00Q`), in de app "Prospect" genoemd | Contact in ons model = Lead; `extern_id` = Lead-ID. |
| Velden op de prospect (gezien) | Adres, Object Foto, **Bron/Bemiddelaar** (bv. "Realo.be – Sellerlead / Nog niet op de markt"), Totaal aantal dagen op de markt, **Prospecteigenaar**, **Opvolgingsindicator** (bv. "2 Dagen", kleurschaal) | Herkomst ← Bron/Bemiddelaar. Prospecteigenaar → filter "mijn prospects". Opvolgingsindicator later vergelijken met ons ritme. |
| Status | Pad *In Opvolging → Beëindigd → Geconverteerd* | "Beëindigd" → niet meer op de lijst (te bevestigen). "Geconverteerd" → verkoper/verhuurder (aparte opvolging?). |
| Acties (mobiel, menu More) | o.a. Nieuwe taak, Nieuwe afspraak, Activiteiten rapport, Converteer Verkoper/Verhuurder, Bereken KWZ, Print/Verstuur KWZ, **Maf Call**, Workflow Toevoegen | — |
| **Maf Call** | Toont de nummers van de prospect (Mobile/Phone). Tik op een nummer → iPhone belt (keuze ERA-lijn of privé) én opent een nieuwe **Taak** | Bellen gebeurt via ERAForce; de Dagplanner opent enkel het record (knop "Bel via ERAForce"). |
| Taak na Maf Call | Recordtype **"ERAforce Taken algemeen"**, Type **"Uitgaande Oproep"**, Vervaldatum, Herinnering, Prioriteit, Toegewezen aan, Uitgevoerd op, In verkoopverslag, + evaluatievelden | Gesprekken in de mirror herkennen via recordtype + type, zonder vaste tekst. Evaluatie = brontekst voor AI-extractie (fase 4). |
| Agenda | In Salesforce (niet Outlook) | Afspraken via de mirror (Events/Tasks?) — te inventariseren. |

## Deep links (getest op iPhone, 3/10/2026)

Beide vormen openen de prospect rechtstreeks in de Salesforce-app (niet in Safari):

- `https://<domein>/lightning/r/Lead/<LeadId>/view` ← **gebruikt** (werkt ook op een computer)
- `salesforce1://sObject/<LeadId>/view`

Rechtstreeks de actie "Maf Call" openen is niet getest; de knop vooraan zetten in de mobiele layout is geen optie.

## Open vragen voor fase 8

1. Vorm en verversingsfrequentie van de mirror (realtime, elk uur, 's nachts?).
2. Waar staan de evaluatievelden van de taak en hoe heten ze?
3. Bevat de mirror ook taken van Donna en afspraken (Events)?
4. Welke statuswaarden en bronnen bestaan er (picklists)?
5. Hoe worden meerdere eigenaars/beslissers en panden gemodelleerd (Lead ↔ Contactpersonen ↔ Object)?
