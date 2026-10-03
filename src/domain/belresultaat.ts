// Een belresultaat omzetten naar lokale records (PLAN.md §6). Pure functie: de opslag gebeurt elders.
// Alles wat uit één belresultaat ontstaat, draagt dezelfde belpogingId, zodat "ongedaan maken" alles samen terugdraait.
import { dagVan, opDagUur, type DagKey } from '../core/dates';
import type { Afspraak, Belpoging, Belverbod, BelUitkomst, Contact, Opvolgactie } from './model';
import { volledigeNaam } from './model';

export interface BelresultaatInvoer {
  contact: Contact;
  uitkomst: BelUitkomst;
  tijdstip: Date;
  notitie?: string | null;
  volgendeStap?: string | null;
  /** Bij "gesproken": optionele dag voor de volgende stap. */
  vervolgDag?: DagKey | null;
  /** Bij "terugbellen op datum". */
  terugbelDag?: DagKey | null;
  terugbelUur?: string | null;
  /** Bij "terugbellen": telt het als gesprek? Standaard ja; nee als je bv. enkel een secretariaat sprak. */
  teltAlsGesprek?: boolean;
  /** Bij "afspraak gemaakt". */
  afspraak?: { dag: DagKey; start: string; duurMinuten: number; locatie?: string | null; titel?: string | null } | null;
  reden?: string | null;
  maakId: () => string;
}

export interface Belresultaat {
  belpoging: Belpoging;
  opvolgacties: Opvolgactie[];
  afspraken: Afspraak[];
  belverboden: Belverbod[];
}

export class OngeldigBelresultaat extends Error {}

const leeg = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);

export function verwerkBelresultaat(i: BelresultaatInvoer): Belresultaat {
  const vandaag = dagVan(i.tijdstip);
  const isTestdata = i.contact.isTestdata;
  const belpogingId = i.maakId();
  const isInhoudelijk = i.uitkomst === 'geen_antwoord' ? false : i.uitkomst === 'terugbellen' ? (i.teltAlsGesprek ?? true) : true;

  const resultaat: Belresultaat = {
    belpoging: {
      id: belpogingId,
      contactId: i.contact.id,
      tijdstip: i.tijdstip,
      uitkomst: i.uitkomst,
      isInhoudelijk,
      notitie: leeg(i.notitie),
      volgendeStap: leeg(i.volgendeStap),
      ongedaanOp: null,
      isTestdata,
    },
    opvolgacties: [],
    afspraken: [],
    belverboden: [],
  };

  const opvolg = (soort: Opvolgactie['soort'], dag: DagKey, uur: string | null, omschrijving: string | null): Opvolgactie => ({
    id: i.maakId(),
    contactId: i.contact.id,
    soort,
    dag,
    uur,
    omschrijving,
    aangemaaktOp: i.tijdstip,
    status: 'open',
    belpogingId,
    isTestdata,
  });

  switch (i.uitkomst) {
    case 'gesproken':
      if (i.vervolgDag) {
        if (i.vervolgDag < vandaag) throw new OngeldigBelresultaat('De dag van de volgende stap ligt in het verleden.');
        resultaat.opvolgacties.push(opvolg('vervolgstap', i.vervolgDag, null, leeg(i.volgendeStap)));
      }
      break;

    case 'terugbellen': {
      if (!i.terugbelDag) throw new OngeldigBelresultaat('Kies de dag waarop je moet terugbellen.');
      if (i.terugbelDag < vandaag) throw new OngeldigBelresultaat('De terugbeldag ligt in het verleden.');
      if (i.terugbelUur && !/^\d{2}:\d{2}$/.test(i.terugbelUur)) throw new OngeldigBelresultaat('Gebruik voor het uur de vorm UU:MM.');
      resultaat.opvolgacties.push(opvolg('terugbellen', i.terugbelDag, leeg(i.terugbelUur), leeg(i.notitie)));
      break;
    }

    case 'afspraak': {
      const a = i.afspraak;
      if (!a?.dag || !a.start) throw new OngeldigBelresultaat('Kies dag en uur van de afspraak.');
      if (a.dag < vandaag) throw new OngeldigBelresultaat('De afspraak ligt in het verleden.');
      if (!(a.duurMinuten > 0)) throw new OngeldigBelresultaat('Geef een duur in minuten.');
      const start = opDagUur(a.dag, a.start);
      const einde = new Date(start.getTime() + a.duurMinuten * 60_000);
      const id = i.maakId();
      resultaat.afspraken.push({
        id,
        bron: 'lokaal',
        externId: null,
        gebeurdOp: start,
        gewijzigdInBronOp: null,
        geimporteerdOp: i.tijdstip,
        isTestdata,
        belpogingId,
        titel: leeg(a.titel) ?? `Afspraak ${volledigeNaam(i.contact)}`,
        start,
        einde,
        heleDag: false,
        locatie: leeg(a.locatie) ?? (i.contact.straat ? `${i.contact.straat}, ${i.contact.gemeente ?? ''}`.trim() : null),
        contactId: i.contact.id,
        koppelStatus: 'bevestigd',
        omschrijving: 'Lokaal gemaakt in de Dagplanner (niet in Outlook).',
      });
      break;
    }

    case 'niet_meer_bellen':
      resultaat.belverboden.push({
        id: i.maakId(),
        contactId: i.contact.id,
        reden: leeg(i.reden) ?? leeg(i.notitie),
        belpogingId,
        aangemaaktOp: i.tijdstip,
        ingetrokkenOp: null,
        isTestdata,
      });
      break;

    case 'geen_antwoord':
      break;
  }

  return resultaat;
}

/** Korte referentiecode voor het Donna-overzicht, afgeleid van de belpoging (bv. "DP-7F3K"). */
export function referentieCode(belpogingId: string): string {
  const hex = belpogingId.replace(/-/g, '').toUpperCase();
  return `DP-${hex.slice(0, 4)}`;
}
