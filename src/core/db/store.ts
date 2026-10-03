// Eén toegangspunt voor gegevens. De schermen weten niet of de data uit Supabase of uit de lokale demo komt.
import type { Afspraak, Belpoging, Bronactiviteit, Bronstatus, Contact, ContactPand, Pand } from '../../domain/model';
import type { Instellingen } from '../settings/schema';

export interface Gegevens {
  contacten: Contact[];
  panden: Pand[];
  contactPanden: ContactPand[];
  activiteiten: Bronactiviteit[];
  afspraken: Afspraak[];
  belpogingen: Belpoging[];
  bronnen: Bronstatus[];
}

export interface Store {
  /** 'supabase' = echte database met login; 'demo' = alles lokaal in deze browser. */
  soort: 'supabase' | 'demo';
  laadGegevens(): Promise<Gegevens>;
  laadInstellingen(): Promise<Instellingen>;
  bewaarInstellingen(i: Instellingen): Promise<void>;
  /** Verwijdert alle testgegevens van deze gebruiker en laadt ze opnieuw voor de testdatum. Echte gegevens blijven onaangeroerd. */
  herlaadTestdata(testdatum: string): Promise<void>;
}

export function leegGegevens(): Gegevens {
  return { contacten: [], panden: [], contactPanden: [], activiteiten: [], afspraken: [], belpogingen: [], bronnen: [] };
}
