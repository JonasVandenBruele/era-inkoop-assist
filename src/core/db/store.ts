// Eén toegangspunt voor gegevens. De schermen weten niet of de data uit Supabase of uit de lokale demo komt.
import type {
  Afspraak,
  Belpoging,
  Belverbod,
  Bronactiviteit,
  Bronstatus,
  Contact,
  ContactPand,
  Contacthook,
  Contactvoorkeur,
  Dagplan,
  DonnaOverzicht,
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
  /** Hook van de dag per contact, gemaakt op de Mac met Claude (enkel echte gegevens). */
  contacthooks: Contacthook[];
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
  /** Pushabonnement van dit toestel bewaren (enkel met Supabase; de demo kan geen meldingen ontvangen). */
  bewaarPushAbonnement(a: { endpoint: string; p256dh: string; auth: string; toestel: string }): Promise<void>;
  verwijderPushAbonnement(endpoint: string): Promise<void>;
}

export function leegGegevens(): Gegevens {
  return { contacten: [], panden: [], contactPanden: [], activiteiten: [], afspraken: [], belpogingen: [], bronnen: [], opvolgacties: [], keuzes: [], belverboden: [], haken: [], voorkeuren: [], contacthooks: [] };
}

/** Toont de app echte (ERAForce) gegevens? Bij 'auto' zodra er minstens één ERAForce-contact is. */
export function gebruiktEchteData(g: Gegevens, i: Pick<Instellingen, 'gegevens'>): boolean {
  if (i.gegevens !== 'auto') return i.gegevens === 'echt';
  return g.contacten.some((c) => !c.isTestdata && c.bron === 'eraforce_mirror');
}

/** Enkel de echte of enkel de testgegevens: nooit door elkaar. */
export function kiesGegevens(g: Gegevens, echt: boolean): Gegevens {
  const ok = <T extends { isTestdata?: boolean }>(xs: T[]) => xs.filter((x) => Boolean(x.isTestdata) !== echt);
  return {
    contacten: ok(g.contacten),
    panden: ok(g.panden),
    contactPanden: ok(g.contactPanden),
    activiteiten: ok(g.activiteiten),
    afspraken: ok(g.afspraken),
    belpogingen: ok(g.belpogingen),
    bronnen: ok(g.bronnen),
    opvolgacties: ok(g.opvolgacties),
    keuzes: ok(g.keuzes),
    belverboden: ok(g.belverboden),
    haken: ok(g.haken),
    voorkeuren: ok(g.voorkeuren),
    contacthooks: ok(g.contacthooks),
  };
}
