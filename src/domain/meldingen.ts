// Welke pushmeldingen er nu verstuurd moeten worden (PLAN.md §12). Pure functie, door de meldingentaak gebruikt.
// Standaard zonder klantgegevens. Elke melding heeft een vaste sleutel, zodat ze maar één keer vertrekt.
import { dagVan, uurVan, type DagKey } from '../core/dates';
import type { Gegevens } from '../core/db/store';
import type { Instellingen } from '../core/settings/schema';
import { berekenBelmomenten, blokTekst } from './belmomenten';
import { berekenBellijst } from './prioriteit';
import { volledigeNaam } from './model';
import { isWerkdag } from './werkdagen';

export interface Pushmelding {
  /** Unieke sleutel per gebruiker, bv. "ochtend:2026-10-13". */
  sleutel: string;
  titel: string;
  tekst: string;
  tag: string;
}

/** Hoe lang na de start van een belmoment de melding nog mag vertrekken (de taak loopt ±elke 10 min). */
const VENSTER_MIN = 20;

const plusMin = (uur: string, min: number) => {
  const [u, m] = uur.split(':').map(Number) as [number, number];
  const t = Math.max(0, Math.min(24 * 60 - 1, u * 60 + m + min));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/**
 * @param nu echt tijdstip. Met een testdatum geldt het uur van nu, maar op de testdag — zo kun je meldingen testen met de testagenda.
 */
export function teVersturenMeldingen(gegevens: Gegevens, inst: Instellingen, nu: Date): Pushmelding[] {
  const dag: DagKey = inst.testdatum ? inst.testdatum.slice(0, 10) : dagVan(nu);
  const uur = uurVan(nu);
  if (!isWerkdag(dag)) return [];
  const m = inst.meldingen;
  const lijst = berekenBellijst({ ...gegevens, instellingen: inst, vandaag: dag, uur }).vandaag;
  const momenten = berekenBelmomenten(gegevens.afspraken, lijst, dag, inst, null).momenten;
  const afspraken = gegevens.afspraken.filter((a) => !a.heleDag && dagVan(a.start) === dag).length;
  const uit: Pushmelding[] = [];

  if (m.ochtend && uur >= m.ochtendUur && uur < '12:00') {
    const gepland = lijst.filter((k) => k.groep === 'A' || k.groep === 'C').length;
    const leads = lijst.filter((k) => k.groep === 'B').length;
    const eerste = momenten.find((b) => uurVan(b.einde) > uur);
    uit.push({
      sleutel: `ochtend:${dag}`,
      titel: 'Goeiemorgen ☀️',
      tekst: `Vandaag: ${lijst.length} te bellen (${gepland} gepland, ${leads} nieuwe ${leads === 1 ? 'lead' : 'leads'}) en ${afspraken} ${afspraken === 1 ? 'afspraak' : 'afspraken'}.${eerste ? ` Eerste belmoment ${blokTekst(eerste)}.` : ''}`,
      tag: 'ochtend',
    });
  }

  if (m.belmoment) {
    for (const b of momenten) {
      const start = uurVan(b.start);
      if (uur >= start && uur < plusMin(start, VENSTER_MIN) && uur < uurVan(b.einde)) {
        uit.push({
          sleutel: `blok:${dag}:${start}`,
          titel: `Belmoment tot ${uurVan(b.einde)}`,
          tekst: `${b.minuten} min vrij: plaats voor ±${b.capaciteit} telefoontjes${b.kandidaten.length ? `, ${b.kandidaten.length} staan klaar` : ''}.`,
          tag: 'belmoment',
        });
      }
    }
  }

  if (m.terugbel) {
    for (const k of lijst) {
      const t = k.groep === 'A' ? k.terugbel?.uur : null;
      if (!t) continue;
      if (uur >= plusMin(t, -m.terugbelMinutenVooraf) && uur < t) {
        uit.push({
          sleutel: `terugbel:${dag}:${k.contact.id}:${t}`,
          titel: `Terugbelafspraak om ${t}`,
          tekst: m.toonNamen ? `${[k.contact.aanhef, volledigeNaam(k.contact)].filter(Boolean).join(' ')} — open Oxpecker voor de details.` : 'Open Oxpecker voor de details.',
          tag: `terugbel-${t}`,
        });
      }
    }
  }
  return uit;
}
