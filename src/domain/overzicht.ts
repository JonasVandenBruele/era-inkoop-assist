// Pure hulpfuncties voor het dagoverzicht (fase 1). Geen database, geen klok: alles komt binnen als parameter.
import { dagVan, type DagKey } from '../core/dates';
import type { Afspraak, Belpoging, Bronactiviteit, Contact } from './model';

export interface AfspraakVanDag {
  afspraak: Afspraak;
  /** Overlapt met een andere (niet-hele-dag) afspraak op dezelfde dag. */
  overlapt: boolean;
}

/** Afspraken die (deels) op deze Brusselse dag vallen: hele-dag-afspraken eerst, daarna op starttijd. */
export function afsprakenVanDag(afspraken: Afspraak[], dag: DagKey): AfspraakVanDag[] {
  const vandaag = afspraken
    .filter((a) => dagVan(a.start) <= dag && dag <= dagVan(a.einde))
    .sort((a, b) => Number(b.heleDag) - Number(a.heleDag) || a.start.getTime() - b.start.getTime());
  const getimed = vandaag.filter((a) => !a.heleDag);
  return vandaag.map((a) => ({
    afspraak: a,
    overlapt: !a.heleDag && getimed.some((b) => b !== a && b.start < a.einde && a.start < b.einde),
  }));
}

export interface LaatsteContact {
  tijdstip: Date;
  herkomst: 'lokaal' | 'bron';
  tekst: string | null;
}

/**
 * Laatste INHOUDELIJK contact: een inhoudelijke, niet-ongedane lokale belpoging of een gesprek uit de bron.
 * Een belpoging zonder antwoord telt niet (PLAN.md §4).
 */
export function laatsteInhoudelijkContact(contactId: string, activiteiten: Bronactiviteit[], belpogingen: Belpoging[]): LaatsteContact | null {
  let beste: LaatsteContact | null = null;
  for (const p of belpogingen) {
    if (p.contactId !== contactId || !p.isInhoudelijk || p.ongedaanOp) continue;
    if (!beste || p.tijdstip > beste.tijdstip) beste = { tijdstip: p.tijdstip, herkomst: 'lokaal', tekst: p.notitie };
  }
  for (const a of activiteiten) {
    if (a.contactId !== contactId || a.type !== 'gesprek' || !a.gebeurdOp) continue;
    if (!beste || a.gebeurdOp > beste.tijdstip) beste = { tijdstip: a.gebeurdOp, herkomst: 'bron', tekst: a.tekst };
  }
  return beste;
}

/** Heeft het contact minstens één bruikbaar telefoonnummer? */
export function heeftTelefoon(c: Contact): boolean {
  return c.telefoons.some((t) => t.nummer.replace(/\D/g, '').length >= 8);
}

export type HistoriekItem =
  | { soort: 'activiteit'; tijdstip: Date; activiteit: Bronactiviteit }
  | { soort: 'belpoging'; tijdstip: Date; belpoging: Belpoging };

/** Alle bronactiviteiten en lokale belpogingen van een contact, nieuwste eerst. */
export function historiek(contactId: string, activiteiten: Bronactiviteit[], belpogingen: Belpoging[]): HistoriekItem[] {
  const items: HistoriekItem[] = [
    ...activiteiten.filter((a) => a.contactId === contactId).map((a) => ({ soort: 'activiteit' as const, tijdstip: a.gebeurdOp ?? a.geimporteerdOp, activiteit: a })),
    ...belpogingen.filter((p) => p.contactId === contactId).map((p) => ({ soort: 'belpoging' as const, tijdstip: p.tijdstip, belpoging: p })),
  ];
  return items.sort((a, b) => b.tijdstip.getTime() - a.tijdstip.getTime());
}
