// Intern datamodel — los van de structuur van ERAForce, Outlook of Plaud.
// Adapters vertalen bronnen naar deze types. Velden komen overeen met de tabellen in supabase/migrations.

export type BronSoort = 'crm' | 'agenda' | 'gesprekken';
export type BronAdapter = 'fictief' | 'eraforce_mirror' | 'microsoft_graph' | 'plaud' | 'handmatig' | 'lokaal';

/** Herkomstvelden die elk geïmporteerd record draagt. */
export interface Herkomst {
  bron: BronAdapter;
  externId: string | null;
  /** Wanneer de gebeurtenis plaatsvond, indien bekend. */
  gebeurdOp: Date | null;
  /** Laatste wijziging in de bron, indien beschikbaar. */
  gewijzigdInBronOp: Date | null;
  geimporteerdOp: Date;
  isTestdata: boolean;
}

export type ContactStatus = 'nieuwe_lead' | 'prospect' | 'langetermijn';
export type Fase = 'koud' | 'lauw' | 'warm';
export type Aanspreekvorm = 'u' | 'je';

export interface Telefoon {
  nummer: string;
  label: 'gsm' | 'vast' | 'werk' | 'ander';
}

export interface Contact extends Herkomst {
  id: string;
  voornaam: string | null;
  achternaam: string;
  /** Bv. "Dhr.", "Mevr.", "Fam." */
  aanhef: string | null;
  telefoons: Telefoon[];
  email: string | null;
  straat: string | null;
  postcode: string | null;
  gemeente: string | null;
  statusBron: ContactStatus;
  faseBron: Fase | null;
  tijdshorizonBron: string | null;
  aanspreekvormBron: Aanspreekvorm | null;
  herkomstContact: string | null;
  nietBellenBron: boolean;
  /** Datum waarop het contact (als lead) binnenkwam. */
  aangemaaktInBronOp: Date | null;
  isLokaalTijdelijk: boolean;
}

export interface Pand extends Herkomst {
  id: string;
  straat: string;
  postcode: string;
  gemeente: string;
  type: 'woning' | 'appartement' | 'bouwgrond' | 'handelspand' | 'opbrengsteigendom' | 'ander';
  omschrijving: string | null;
}

export type PandRol = 'eigenaar' | 'mede_eigenaar' | 'beslisser' | 'erfgenaam' | 'huurder' | 'ander';

export interface ContactPand {
  id: string;
  contactId: string;
  pandId: string;
  rol: PandRol;
  isTestdata: boolean;
}

export type ActiviteitType = 'taak' | 'notitie' | 'evaluatie' | 'gesprek';

export interface Bronactiviteit extends Herkomst {
  id: string;
  type: ActiviteitType;
  contactId: string | null;
  pandId: string | null;
  /** Bij taken: 'terugbellen' of 'algemeen'. */
  taakSoort: 'terugbellen' | 'algemeen' | null;
  vervaltOp: string | null; // DagKey
  vervaltUur: string | null; // "HH:mm"
  taakAfgerond: boolean;
  auteur: string | null;
  tekst: string;
}

export interface Afspraak extends Herkomst {
  id: string;
  /** Lokale afspraak die ontstond uit een belresultaat. */
  belpogingId?: string | null;
  titel: string;
  start: Date;
  einde: Date;
  heleDag: boolean;
  locatie: string | null;
  contactId: string | null;
  koppelStatus: 'bevestigd' | 'voorgesteld' | 'geen';
  omschrijving: string | null;
}

export type BelUitkomst = 'gesproken' | 'geen_antwoord' | 'terugbellen' | 'afspraak' | 'niet_meer_bellen';

export interface Belpoging {
  id: string;
  contactId: string;
  tijdstip: Date;
  uitkomst: BelUitkomst;
  isInhoudelijk: boolean;
  notitie: string | null;
  volgendeStap: string | null;
  ongedaanOp: Date | null;
  isTestdata: boolean;
}

export interface Planningskeuze {
  id: string;
  contactId: string;
  soort: 'vastpinnen' | 'vandaag_overslaan' | 'uitstellen';
  /** Voor vastpinnen en vandaag_overslaan: de dag waarvoor de keuze geldt. */
  voorDag: string | null;
  /** Voor uitstellen: het contact verschijnt pas weer vanaf deze dag. */
  totDag: string | null;
  aangemaaktOp?: Date;
  ongedaanOp: Date | null;
  isTestdata?: boolean;
}

/** Lokale terugbelafspraak of vervolgstap. De bron levert terugbeltaken via bronactiviteiten. */
export interface Opvolgactie {
  id: string;
  contactId: string;
  soort: 'terugbellen' | 'vervolgstap';
  dag: string;
  uur: string | null;
  omschrijving: string | null;
  aangemaaktOp: Date;
  status: 'open' | 'afgehandeld' | 'vervallen';
  belpogingId?: string | null;
  isTestdata?: boolean;
}

export interface Belverbod {
  id?: string;
  contactId: string;
  reden?: string | null;
  belpogingId?: string | null;
  aangemaaktOp?: Date;
  ingetrokkenOp: Date | null;
  isTestdata?: boolean;
}

/** De bellijst zoals ze bij de eerste opening van de dag werd vastgelegd. */
export interface Dagplan {
  dag: string;
  contactIds: string[];
  aangemaaktOp: Date;
  isTestdata: boolean;
}

export interface DonnaOverzicht {
  dag: string;
  tekst: string;
  belpogingIds: string[];
  status: 'klaargezet' | 'doorgegeven';
  klaargezetOp: Date;
  doorgegevenOp: Date | null;
  isTestdata: boolean;
}

export interface Bronstatus {
  id: string;
  soort: BronSoort;
  adapter: BronAdapter;
  naam: string;
  isTestdata: boolean;
  laatstSuccesvolOp: Date | null;
  laatsteFout: string | null;
}

/** Of een uitkomst standaard telt als inhoudelijk contact (zie PLAN.md §4). */
export function standaardInhoudelijk(uitkomst: BelUitkomst): boolean {
  return uitkomst !== 'geen_antwoord';
}

export function volledigeNaam(c: Pick<Contact, 'aanhef' | 'voornaam' | 'achternaam'>): string {
  return [c.voornaam, c.achternaam].filter(Boolean).join(' ');
}
