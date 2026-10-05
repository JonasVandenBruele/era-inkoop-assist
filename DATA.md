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

## ERAForce-mirror (sinds 5/10/2026)

- **Code:** `../eraforce-mirror` (lokale git, geen remote).
- **Data:** in een versleutelde kluis op de SanDisk-SSD (`mirror.sqlite`). Nooit in deze repo.
- **Updates:** om 07:00 en 19:00 via launchd. Elke run haalt enkel de wijzigingen op; om de 28 dagen wordt alles volledig herladen.
- **Scope:** alles wat Jonas' gebruiker mag zien van Lead, Contact, Account, Opportunity, Event, de ERA-objecten (panden en hun details, workflow, documenten als metadata, zoekopdrachten, publicaties, VMA) en de wijzigingsgeschiedenis van leads en kansen. Daarbij komen de taken van het kantoor plus alle taken op leads, en de gelogde mails van het kantoor (zonder HTML).
- **Niet opgenomen:** bestanden, bijlagen, foto's en downloadlinks.
- **Omvang na de eerste import:** ±5 miljoen records en ±4–5 GB. Details staan in `MIRROR-VOORSTEL.md`.
- Elke tabel heeft `_verwijderd` en `_bijgewerkt`. `_velden` bevat de labels en keuzelijsten, `_sync` en `_runs` de technische status. Zoekindex: `zoek_Task`, `zoek_Lead`, ….

## Deep links (getest op iPhone, 3/10/2026)

| Link | Resultaat in de Salesforce-app |
|---|---|
| `https://<domein>/lightning/r/Lead/<LeadId>/view` (ook met `?target=detailTab__body`) | Compacte weergave (Related/Details/Chatter) — **geen** "More" |
| `salesforce1://sObject/<LeadId>/view` | Compacte weergave |
| `https://<domein>/lightning/action/quick/Lead.Maf_Call?objectApiName=Lead&context=RECORD_DETAIL&recordId=<LeadId>` | **Volledige pagina met "More"** ← **gebruikt**. De actie zelf opent niet. |

De technische naam is bevestigd via de browser op een pc: **`Lead.Maf_Call`** (`data-target-selection-name="sfdc:QuickAction.Lead.Maf_Call"`), een Lightning-componentactie (`runtime_platform_actions-executor-lightning-component`). De mobiele Salesforce-app start zulke acties niet via een link, dus op de iPhone blijft het: Dagplanner → volledige pagina → More → Maf Call. De knop vooraan zetten in de mobiele layout is geen optie. Andere acties op de prospect hebben namen als `Lead.ERA_Workflow_Toevoegen_action`.

## Open vragen voor fase 8

1. Vorm en verversingsfrequentie van de mirror (realtime, elk uur, 's nachts?).
2. Waar staan de evaluatievelden van de taak en hoe heten ze?
3. Bevat de mirror ook taken van Donna en afspraken (Events)?
4. Welke statuswaarden en bronnen bestaan er (picklists)?
5. Hoe worden meerdere eigenaars/beslissers en panden gemodelleerd (Lead ↔ Contactpersonen ↔ Object)?
