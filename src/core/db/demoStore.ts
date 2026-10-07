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
    // Twee fictieve open WhatsApp-chats (Te beantwoorden), zodat de demo het blok toont.
    const t = (uurTerug: number) => new Date(new Date(`${td.slice(0, 16)}:00+02:00`).getTime() - uurTerug * 3600_000);
    const c = g.contacten.find((x) => x.telefoons.some((n) => n.label === 'gsm'));
    g.whatsappOpen = [
      { id: 'demo-wa-1', nummer: '32470000001', contactId: c?.id ?? null, naam: c ? [c.voornaam, c.achternaam].filter(Boolean).join(' ') : 'Fictieve klant', laatsteOp: t(14), klantBerichten: [{ tijd: t(14), tekst: 'Dag Jonas, zou je volgende week eens kunnen langskomen voor die schatting?' }], nodig: true, antwoord: 'Dag! Dat lukt zeker, ik kijk even in mijn agenda en laat je vandaag nog een moment weten. Groetjes, Jonas', reden: 'Vraagt een afspraak voor een schatting.', afgehandeldOp: null, isTestdata: true },
      { id: 'demo-wa-2', nummer: '32470000002', contactId: null, naam: 'Kandidaat-koper (fictief)', laatsteOp: t(3), klantBerichten: [{ tijd: t(3), tekst: 'Is het appartement in de Stationsstraat nog beschikbaar?' }], nodig: true, antwoord: 'Hi, bedankt voor je bericht! Ik check het even en laat je zo snel mogelijk iets weten. Mvg, Jonas', reden: 'Vraagt of een pand nog beschikbaar is.', afgehandeldOp: null, isTestdata: true },
    ];
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
    async handelWhatsappAf(id, op) {
      g.whatsappOpen = g.whatsappOpen.map((w) => (w.id === id ? { ...w, afgehandeldOp: op } : w));
    },
    async handelMarktsignaalAf(id, op) {
      g.marktsignalen = g.marktsignalen.map((s) => (s.id === id ? { ...s, afgehandeldOp: op } : s));
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
