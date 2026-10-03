// Lokale demo zonder Supabase: testdata wordt in de browser gegenereerd, instellingen in localStorage.
// Lokale resultaten leven enkel in het geheugen (weg na herladen). Enkel bedoeld zolang Supabase niet gekoppeld is.
import { genereerTestdata } from '../../../fixtures/testdata';
import type { Dagplan, DonnaOverzicht } from '../../domain/model';
import { leesInstellingen, type Instellingen } from '../settings/schema';
import { leegGegevens, type Gegevens, type Store } from './store';

const SLEUTEL = 'dagplanner.demo.instellingen';

function leesLokaal(): unknown {
  try {
    const t = localStorage.getItem(SLEUTEL);
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
}

export function maakDemoStore(): Store {
  let testdatum: string | null = null;
  let g: Gegevens = leegGegevens();
  const dagplannen = new Map<string, Dagplan>();
  const donna = new Map<string, DonnaOverzicht>();
  const instellingen = () => leesInstellingen(leesLokaal());

  const genereer = (td: string) => {
    testdatum = td;
    g = { ...leegGegevens(), ...genereerTestdata({ testdatum: td, idPrefix: 'demo' }) };
    dagplannen.clear();
    donna.clear();
  };
  /** Kopie zodat React wijzigingen ziet. */
  const kopie = (): Gegevens => ({ ...g });

  return {
    soort: 'demo',
    async laadGegevens() {
      // Zonder testdatum (echte klok) genereren we de testdata rond de huidige datum.
      const td = instellingen().testdatum ?? new Date().toISOString().slice(0, 16);
      if (testdatum !== td) genereer(td);
      return kopie();
    },
    async laadInstellingen() {
      return instellingen();
    },
    async bewaarInstellingen(i: Instellingen) {
      try {
        localStorage.setItem(SLEUTEL, JSON.stringify(i));
      } catch {
        /* privémodus: instellingen gelden dan enkel tot herladen */
      }
    },
    async herlaadTestdata(td: string) {
      genereer(td);
    },
    async bewaarBelresultaat(r) {
      g.belpogingen = [...g.belpogingen, r.belpoging];
      g.opvolgacties = [...g.opvolgacties, ...r.opvolgacties];
      g.afspraken = [...g.afspraken, ...r.afspraken];
      g.belverboden = [...g.belverboden, ...r.belverboden];
    },
    async maakBelresultaatOngedaan(id, op) {
      g.belpogingen = g.belpogingen.map((p) => (p.id === id ? { ...p, ongedaanOp: op } : p));
      g.opvolgacties = g.opvolgacties.map((o) => (o.belpogingId === id ? { ...o, status: 'vervallen' } : o));
      g.belverboden = g.belverboden.map((b) => (b.belpogingId === id && !b.ingetrokkenOp ? { ...b, ingetrokkenOp: op } : b));
      g.afspraken = g.afspraken.filter((a) => !(a.belpogingId === id && a.bron === 'lokaal'));
    },
    async bewaarKeuze(k) {
      g.keuzes = [...g.keuzes, k];
    },
    async maakKeuzeOngedaan(id, op) {
      g.keuzes = g.keuzes.map((k) => (k.id === id ? { ...k, ongedaanOp: op } : k));
    },
    async trekBelverbodIn(id, op) {
      g.belverboden = g.belverboden.map((b) => (b.id === id ? { ...b, ingetrokkenOp: op } : b));
    },
    async maakContact(c) {
      g.contacten = [...g.contacten, c];
    },
    async laadDagplan(dag) {
      return dagplannen.get(dag) ?? null;
    },
    async bewaarDagplan(p) {
      if (!dagplannen.has(p.dag)) dagplannen.set(p.dag, p);
    },
    async laadDonnaOverzicht(dag) {
      return donna.get(dag) ?? null;
    },
    async bewaarDonnaOverzicht(o) {
      donna.set(o.dag, o);
    },
    async bewaarHaak(h) {
      g.haken = [...g.haken.filter((x) => x.id !== h.id), h];
    },
    async verwijderHaak(id) {
      g.haken = g.haken.filter((x) => x.id !== id);
    },
    async bewaarKoppeling(k) {
      g.koppelingen = [...g.koppelingen.filter((x) => x.contactId !== k.contactId), k];
    },
    async verwijderKoppeling(contactId) {
      g.koppelingen = g.koppelingen.filter((x) => x.contactId !== contactId);
    },
    async bewaarPushAbonnement() {
      throw new Error('Pushmeldingen werken enkel in de online app met login, niet in de lokale demo.');
    },
    async verwijderPushAbonnement() {
      /* niets te doen in de demo */
    },
    async bewaarVoorkeur(v) {
      g.voorkeuren = [...g.voorkeuren.filter((x) => x.contactId !== v.contactId), v];
    },
  };
}
