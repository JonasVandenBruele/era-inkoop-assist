// Opslag van de eigen verkoopgegevens (records). Vervangbaar:
//  - geheugen: tests;
//  - lokaal: één browser (ontwikkeling zonder Supabase);
//  - gedeeld: de online demo (Supabase, apart schema verkoop_demo, enkel via een toegangscode).
// Elke schrijfactie draagt de verwachte versie. Klopt die niet (een collega was sneller), dan wordt niets bewaard
// en krijgt de app de conflicten terug: nooit stil overschrijven.
import type { OpgeslagenRecord, Wijziging } from '../../domain/verkoop/staat';

export type BewaarResultaat = { ok: true } | { ok: false; conflicten: { soort: string; id: string }[] };

export interface VerkoopOpslag {
  soort: 'geheugen' | 'lokaal' | 'gedeeld';
  laad(): Promise<OpgeslagenRecord[]>;
  /** Alles of niets: bij één conflict wordt geen enkele wijziging bewaard. */
  bewaar(wijzigingen: Wijziging[], door: string): Promise<BewaarResultaat>;
  /** Wist enkel de demoresultaten (de records van deze omgeving). */
  reset(door: string): Promise<void>;
}

/** Past wijzigingen toe op een lijst records, met versiecontrole. Gedeeld door de geheugen- en lokale opslag. */
export function pasToe(records: OpgeslagenRecord[], wijzigingen: Wijziging[], door: string, nu = new Date()): { records: OpgeslagenRecord[]; resultaat: BewaarResultaat } {
  const map = new Map(records.map((r) => [`${r.soort}/${r.id}`, r]));
  const conflicten = wijzigingen.filter((w) => {
    const huidig = map.get(`${w.soort}/${w.id}`);
    return w.verwachteVersie === null ? Boolean(huidig) : huidig?.versie !== w.verwachteVersie;
  });
  if (conflicten.length) return { records, resultaat: { ok: false, conflicten: conflicten.map((c) => ({ soort: c.soort, id: c.id })) } };
  for (const w of wijzigingen) {
    const k = `${w.soort}/${w.id}`;
    map.set(k, { soort: w.soort, id: w.id, data: w.data, versie: (map.get(k)?.versie ?? 0) + 1, bijgewerktOp: nu.toISOString(), bijgewerktDoor: door } as OpgeslagenRecord);
  }
  return { records: [...map.values()], resultaat: { ok: true } };
}

/** Gedeelde geheugenopslag: twee "sessies" op dezelfde Map zien elkaars wijzigingen (zoals twee gsm's op de demo). */
export function maakGeheugenOpslag(gedeeld: { records: OpgeslagenRecord[] } = { records: [] }): VerkoopOpslag {
  return {
    soort: 'geheugen',
    async laad() {
      return structuredClone(gedeeld.records);
    },
    async bewaar(w, door) {
      const r = pasToe(gedeeld.records, structuredClone(w), door);
      gedeeld.records = r.records;
      return r.resultaat;
    },
    async reset() {
      gedeeld.records = [];
    },
  };
}

/** Opslag in deze browser (localStorage). Overleeft verversen en het sluiten van de browser. */
export function maakLokaleOpslag(sleutel = 'oxpecker.verkoopdemo.records'): VerkoopOpslag {
  const lees = (): OpgeslagenRecord[] => {
    try {
      const t = localStorage.getItem(sleutel);
      return t ? (JSON.parse(t) as OpgeslagenRecord[]) : [];
    } catch {
      return [];
    }
  };
  const schrijf = (r: OpgeslagenRecord[]) => {
    try {
      localStorage.setItem(sleutel, JSON.stringify(r));
    } catch {
      throw new Error('Kon niet bewaren in deze browser (privémodus of geen opslagruimte).');
    }
  };
  return {
    soort: 'lokaal',
    async laad() {
      return lees();
    },
    async bewaar(w, door) {
      const r = pasToe(lees(), w, door);
      if (r.resultaat.ok) schrijf(r.records);
      return r.resultaat;
    },
    async reset() {
      schrijf([]);
    },
  };
}
