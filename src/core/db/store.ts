// Eén toegangspunt voor gegevens. De schermen weten niet of de data uit Supabase of uit de lokale demo komt.
import type {
  Afspraak,
  Belpoging,
  Belverbod,
  Bronactiviteit,
  Bronstatus,
  Contact,
  ContactPand,
  Contactvoorkeur,
  Dagplan,
  DonnaOverzicht,
  EraforceKoppeling,
  Opvolgactie,
  Pand,
  Planningskeuze,
  Waardehaak,
} from '../../domain/model';
import type { Belresultaat } from '../../domain/belresultaat';
import type { Instellingen } from '../settings/schema';

export interface Gegevens {
  contacten: Contact[];
  panden: Pand[];
  contactPanden: ContactPand[];
  activiteiten: Bronactiviteit[];
  afspraken: Afspraak[];
  belpogingen: Belpoging[];
  bronnen: Bronstatus[];
  // Lokaal (fase 3)
  opvolgacties: Opvolgactie[];
  keuzes: Planningskeuze[];
  belverboden: Belverbod[];
  // Contactstrategie (fase 3b)
  haken: Waardehaak[];
  voorkeuren: Contactvoorkeur[];
  koppelingen: EraforceKoppeling[];
}

export interface Store {
  /** 'supabase' = echte database met login; 'demo' = alles lokaal in deze browser. */
  soort: 'supabase' | 'demo';
  laadGegevens(): Promise<Gegevens>;
  laadInstellingen(): Promise<Instellingen>;
  bewaarInstellingen(i: Instellingen): Promise<void>;
  /** Verwijdert alle testgegevens van deze gebruiker en laadt ze opnieuw voor de testdatum. Echte gegevens blijven onaangeroerd. */
  herlaadTestdata(testdatum: string): Promise<void>;

  // ---- Lokale resultaten (fase 3). Een import raakt deze nooit aan. ----
  bewaarBelresultaat(r: Belresultaat): Promise<void>;
  /** Draait een belresultaat terug: de belpoging wordt gemarkeerd als ongedaan, gekoppelde records vervallen. */
  maakBelresultaatOngedaan(belpogingId: string, op: Date): Promise<void>;
  bewaarKeuze(k: Planningskeuze): Promise<void>;
  maakKeuzeOngedaan(keuzeId: string, op: Date): Promise<void>;
  trekBelverbodIn(belverbodId: string, op: Date): Promise<void>;
  maakContact(c: Contact): Promise<void>;
  laadDagplan(dag: string): Promise<Dagplan | null>;
  /** Bewaart het dagplan enkel als er voor die dag nog geen is (eerste opening wint). */
  bewaarDagplan(p: Dagplan): Promise<void>;
  laadDonnaOverzicht(dag: string): Promise<DonnaOverzicht | null>;
  bewaarDonnaOverzicht(o: DonnaOverzicht): Promise<void>;
  bewaarHaak(h: Waardehaak): Promise<void>;
  verwijderHaak(id: string): Promise<void>;
  /** Eén voorkeur per contact; overschrijft de vorige. */
  bewaarVoorkeur(v: Contactvoorkeur): Promise<void>;
  bewaarKoppeling(k: EraforceKoppeling): Promise<void>;
  verwijderKoppeling(contactId: string): Promise<void>;
}

export function leegGegevens(): Gegevens {
  return { contacten: [], panden: [], contactPanden: [], activiteiten: [], afspraken: [], belpogingen: [], bronnen: [], opvolgacties: [], keuzes: [], belverboden: [], haken: [], voorkeuren: [], koppelingen: [] };
}
