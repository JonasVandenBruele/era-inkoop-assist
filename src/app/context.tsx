import { createContext, useContext } from 'react';
import type { Klok } from '../core/clock';
import type { Gegevens, Store } from '../core/db/store';
import type { Instellingen } from '../core/settings/schema';
import type { Belresultaat, BelresultaatInvoer } from '../domain/belresultaat';
import type { Contact, Contactvoorkeur, Planningskeuze, Waardehaak } from '../domain/model';

export interface Melding {
  tekst: string;
  /** Optionele knop "Ongedaan maken". */
  ongedaan?: () => Promise<void>;
  fout?: boolean;
}

export interface NieuwContact {
  aanhef: string | null;
  voornaam: string | null;
  achternaam: string;
  telefoon: string | null;
  gemeente: string | null;
  notitie: string | null;
}

/** Een oproep die vanuit de app gestart werd; bij terugkomst volgt de vraag "hoe ging het?". */
export interface LopendeOproep {
  contactId: string;
  sinds: number;
  /** true zodra de vraag getoond mag worden (na terugkeer in de app, of meteen bij een testsimulatie). */
  vraag: boolean;
}

export interface AppStaat {
  store: Store;
  instellingen: Instellingen;
  klok: Klok;
  gegevens: Gegevens;
  gebruikerEmail: string | null;
  /** true = echte ERAForce-gegevens, false = testdata. */
  echteData: boolean;
  /** Verhoogt bij elke testdata-reset, zodat schermen hun dagplan opnieuw ophalen. */
  dataVersie: number;
  /** Gegevens opnieuw ophalen. */
  herlaad(): Promise<void>;
  /** Instellingen bewaren; bij een andere testdatum wordt de testdata mee verschoven. */
  wijzigInstellingen(nieuw: Instellingen): Promise<void>;
  herlaadTestdata(): Promise<void>;
  afmelden(): Promise<void>;

  // ---- Fase 3 ----
  registreerBelresultaat(invoer: Omit<BelresultaatInvoer, 'maakId' | 'tijdstip'>): Promise<Belresultaat>;
  maakBelresultaatOngedaan(belpogingId: string): Promise<void>;
  kies(contactId: string, soort: Planningskeuze['soort'], totDag?: string): Promise<void>;
  herstelKeuze(keuzeId: string): Promise<void>;
  trekBelverbodIn(belverbodId: string): Promise<void>;
  maakTijdelijkContact(c: NieuwContact): Promise<Contact>;
  toon(m: Melding): void;

  // ---- Fase 3b ----
  bewaarHaak(h: Omit<Waardehaak, 'id' | 'aangemaaktOp' | 'isTestdata'>): Promise<void>;
  verwijderHaak(id: string): Promise<void>;
  bewaarVoorkeur(v: Omit<Contactvoorkeur, 'isTestdata'>): Promise<void>;

  // ---- Eén tik na het bellen ----
  oproep: LopendeOproep | null;
  /** Aanroepen bij een tik op "Bel". Met simuleer=true (testdata) verschijnt de vraag meteen. */
  startOproep(contactId: string, simuleer?: boolean): void;
  sluitOproep(): void;
}

export const AppContext = createContext<AppStaat | null>(null);

export function useApp(): AppStaat {
  const s = useContext(AppContext);
  if (!s) throw new Error('useApp buiten AppContext');
  return s;
}
