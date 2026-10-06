// Belmomenten (PLAN.md §11): vrije blokken tussen afspraken, binnen werkuren, zonder pauzes,
// met een reisbuffer rond afspraken op locatie. De bellijst wordt over die blokken verdeeld.
// Pure functies; tijden in Brussel. Beloofd wordt enkel een instelbare buffer, geen echte reistijd.
import { dagVan, opDagUur, uurVan, type DagKey } from '../core/dates';
import type { Instellingen } from '../core/settings/schema';
import type { Afspraak } from './model';
import type { Kandidaat } from './prioriteit';

export interface Belmoment {
  start: Date;
  einde: Date;
  minuten: number;
  /** Aantal telefoontjes dat past (minuten ÷ belduur). */
  capaciteit: number;
  /** Contacten die in dit blok gepland zijn, in volgorde. */
  kandidaten: Kandidaat[];
}

export interface BelmomentenResultaat {
  momenten: Belmoment[];
  /** Contacten die niet meer in de vrije tijd passen. */
  pastNiet: Kandidaat[];
  /** Hele-dag-afspraak die de dag blokkeert (bv. opleiding). */
  heleDag: Afspraak | null;
  /** Totaal aantal telefoontjes dat vandaag (nog) past. */
  capaciteit: number;
  /** Bezoeken en flyers per Baanprospectie-blok, gesorteerd op postcode (handig als route). */
  veldwerk: { blok: Afspraak; kandidaten: Kandidaat[] }[];
}

interface Interval {
  van: number; // ms
  tot: number;
}

const MIN_BLOK_MINUTEN = 15;

/** Trekt de bezette intervallen af van [van, tot] en geeft de vrije stukken terug. */
function vrijeIntervallen(van: number, tot: number, bezet: Interval[]): Interval[] {
  const gesorteerd = [...bezet].filter((b) => b.tot > van && b.van < tot).sort((a, b) => a.van - b.van);
  const vrij: Interval[] = [];
  let cursor = van;
  for (const b of gesorteerd) {
    if (b.van > cursor) vrij.push({ van: cursor, tot: Math.min(b.van, tot) });
    cursor = Math.max(cursor, b.tot);
    if (cursor >= tot) break;
  }
  if (cursor < tot) vrij.push({ van: cursor, tot });
  return vrij;
}

/** Afspraak op verplaatsing? Interne afspraken op kantoor krijgen geen reisbuffer. */
function opVerplaatsing(a: Afspraak): boolean {
  return Boolean(a.locatie) && !/kantoor/i.test(a.locatie ?? '');
}

export function berekenBelmomenten(
  afspraken: Afspraak[],
  lijst: Kandidaat[],
  dag: DagKey,
  inst: Instellingen,
  nu: Date | null,
): BelmomentenResultaat {
  const w = inst.werkdag;
  const vanDag = afspraken.filter((a) => dagVan(a.start) <= dag && dag <= dagVan(a.einde));
  const heleDag = vanDag.find((a) => a.heleDag) ?? null;
  const veldwerk: BelmomentenResultaat['veldwerk'] = [];
  for (const k of lijst.filter((x) => x.veldwerkBlok)) {
    const groep = veldwerk.find((v) => v.blok.id === k.veldwerkBlok!.id) ?? veldwerk[veldwerk.push({ blok: k.veldwerkBlok!, kandidaten: [] }) - 1]!;
    groep.kandidaten.push(k);
  }
  for (const v of veldwerk) v.kandidaten.sort((a, b) => (a.contact.postcode ?? '').localeCompare(b.contact.postcode ?? '') || (a.contact.straat ?? '').localeCompare(b.contact.straat ?? ''));
  lijst = lijst.filter((x) => !x.veldwerkBlok);
  if (heleDag) return { momenten: [], pastNiet: [...lijst], heleDag, capaciteit: 0, veldwerk };

  const buffer = w.reisbufferMinuten * 60_000;
  const bezet: Interval[] = [
    ...vanDag.map((a) => ({
      van: a.start.getTime() - (opVerplaatsing(a) ? buffer : 0),
      tot: a.einde.getTime() + (opVerplaatsing(a) ? buffer : 0),
    })),
    ...w.pauzes.map((p) => ({ van: opDagUur(dag, p.start).getTime(), tot: opDagUur(dag, p.einde).getTime() })),
  ];
  let start = opDagUur(dag, w.start).getTime();
  const einde = opDagUur(dag, w.einde).getTime();
  if (nu && dagVan(nu) === dag) start = Math.max(start, nu.getTime());

  const momenten: Belmoment[] = vrijeIntervallen(start, einde, bezet)
    .map((i) => {
      const minuten = Math.floor((i.tot - i.van) / 60_000);
      return { start: new Date(i.van), einde: new Date(i.tot), minuten, capaciteit: Math.floor(minuten / w.belduurMinuten), kandidaten: [] as Kandidaat[] };
    })
    .filter((m) => m.minuten >= MIN_BLOK_MINUTEN && m.capaciteit > 0);

  // Verdeling: een terugbelafspraak met uur gaat naar het blok waarin dat uur valt; de rest vult de blokken in volgorde.
  const pastNiet: Kandidaat[] = [];
  const vrij = (m: Belmoment) => m.capaciteit - m.kandidaten.length;
  const metUur = lijst.filter((k) => k.groep === 'A' && k.terugbel?.uur);
  const rest = lijst.filter((k) => !metUur.includes(k));
  for (const k of metUur) {
    const t = opDagUur(dag, k.terugbel!.uur!).getTime();
    const blok = momenten.find((m) => m.start.getTime() <= t && t < m.einde.getTime() && vrij(m) > 0);
    if (blok) blok.kandidaten.unshift(k);
    else rest.unshift(k); // uur valt buiten de vrije tijd (bv. tijdens een afspraak): zo vroeg mogelijk inplannen
  }
  for (const k of rest) {
    const blok = momenten.find((m) => vrij(m) > 0);
    if (blok) blok.kandidaten.push(k);
    else pastNiet.push(k);
  }
  return { momenten, pastNiet, heleDag: null, capaciteit: momenten.reduce((s, m) => s + m.capaciteit, 0), veldwerk };
}

/** "08:30–09:40" */
export function blokTekst(m: Pick<Belmoment, 'start' | 'einde'>): string {
  return `${uurVan(m.start)}–${uurVan(m.einde)}`;
}
