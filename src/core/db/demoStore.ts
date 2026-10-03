// Lokale demo zonder Supabase: testdata wordt in de browser gegenereerd, instellingen in localStorage.
// Enkel bedoeld zolang Supabase nog niet gekoppeld is.
import { genereerTestdata } from '../../../fixtures/testdata';
import { leesInstellingen, type Instellingen } from '../settings/schema';
import type { Gegevens, Store } from './store';

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
  let cache: { testdatum: string; gegevens: Gegevens } | null = null;
  const instellingen = () => leesInstellingen(leesLokaal());
  const genereer = (testdatum: string) => {
    cache = { testdatum, gegevens: genereerTestdata({ testdatum, idPrefix: 'demo' }) };
    return cache.gegevens;
  };

  return {
    soort: 'demo',
    async laadGegevens() {
      // Zonder testdatum (echte klok) genereren we de testdata rond de huidige datum.
      const td = instellingen().testdatum ?? new Date().toISOString().slice(0, 16);
      return cache?.testdatum === td ? cache.gegevens : genereer(td);
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
    async herlaadTestdata(testdatum: string) {
      genereer(testdatum);
    },
  };
}
