// Intern datamodel — los van de structuur van ERAForce of Plaud.
// Adapters vertalen bronnen naar deze types. Velden komen overeen met de tabellen in supabase/migrations.

export type BronSoort = 'crm' | 'agenda' | 'gesprekken';
export type BronAdapter = 'fictief' | 'eraforce_mirror' | 'whatsapp' | 'microsoft_graph' | 'plaud' | 'handmatig' | 'lokaal';

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

/** beeindigd = lead afgesloten in ERAForce; relatie = contact dat geen prospect is (bv. verkoper, kandidaat). Beide enkel op de bellijst met een open terugbeltaak. */
export type ContactStatus = 'nieuwe_lead' | 'prospect' | 'langetermijn' | 'beeindigd' | 'relatie';
export type Fase = 'koud' | 'lauw' | 'warm';
export type Aanspreekvorm = 'u' | 'je';
export type Taal = 'nl' | 'fr' | 'en';

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
  /** Oorspronkelijke status in de bron, bv. "In Opvolging". */
  statusLabelBron?: string | null;
  faseBron: Fase | null;
  tijdshorizonBron: string | null;
  /** Zoals Jonas de klant aanspreekt (uit zijn WhatsApp-berichten); null = onbekend, dan "je" (Jonas, 6/10/2026). */
  aanspreekvormBron: Aanspreekvorm | null;
  /** Communicatietaal uit ERAForce. */
  taal?: Taal | null;
  /** Taal uit de WhatsApp-gesprekken; gaat voor op ERAForce. */
  taalWhatsapp?: Taal | null;
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
  /** Oorspronkelijk type in de bron, bv. "Uitgaande Oproep". */
  soortLabel?: string | null;
  /** Bij taken: het geplande kanaal, uit het onderwerp of het type (bv. "langsgaan met flyer" → bezoek). */
  kanaal?: Contactkanaal | null;
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
  /** Oorspronkelijk type in de bron, bv. "Afspraak prospect kennismaking". */
  soortLabel?: string | null;
}

export type BelUitkomst = 'gesproken' | 'geen_antwoord' | 'terugbellen' | 'afspraak' | 'niet_meer_bellen' | 'bericht_verstuurd' | 'reactie';
/** Kanaal van een geregistreerde poging. Flyer, brief en bezoek tikt Jonas aan als "gedaan". */
export type Kanaal = 'telefoon' | 'sms' | 'whatsapp' | 'mail' | 'flyer' | 'brief' | 'bezoek';

/** Manier om een contact te benaderen: in het kanaaladvies en als gepland kanaal van een taak. */
export type Contactkanaal = 'bellen' | 'bericht' | 'whatsapp' | 'mail' | 'flyer' | 'brief' | 'bezoek';

export interface Belpoging {
  id: string;
  contactId: string;
  tijdstip: Date;
  uitkomst: BelUitkomst;
  /** Telefoon, sms, WhatsApp, mail, flyer, brief of bezoek. Ontbreekt bij oudere records: dan telefoon. */
  kanaal?: Kanaal;
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

export interface Contactvoorkeur {
  contactId: string;
  kanaal: 'geen' | 'bellen' | 'bericht' | 'mail';
  nietVoor: string | null; // "HH:mm"
  nietNa: string | null;
  notitie: string | null;
  isTestdata?: boolean;
}

export type HaakSoort = 'buurt' | 'dossier' | 'algemeen' | 'persoonlijk';

/** Concrete, herleidbare reden om contact op te nemen (PLAN.md §7b.2). */
export interface Waardehaak {
  id: string;
  /** Bereik: contact, pand, straat in gemeente, of algemeen (alles leeg). */
  contactId: string | null;
  pandId: string | null;
  straat: string | null;
  gemeente: string | null;
  soort: HaakSoort;
  onderwerp: string;
  detail: string | null;
  bron: string | null;
  geldigVanaf: string;
  geldigTot: string | null;
  gevoelig: boolean;
  aangemaaktOp: Date;
  isTestdata?: boolean;
  /** Afgeleid uit het dossier (niet opgeslagen). */
  afgeleid?: boolean;
}

/**
 * Hook van de dag voor één contact, gemaakt op de Mac (scripts/hooks-maken.ts) met Claude op basis van de
 * evaluaties, buurtfeiten uit de mirror en het nieuws. Enkel aangeleverde feiten; de app toont hem op de BelKaart.
 */
export interface Contacthook {
  id: string;
  contactId: string;
  dag: string; // DagKey
  onderwerp: string;
  detail: string | null;
  openingszin: string | null;
  kanaal: Contactkanaal | null;
  kanaalReden: string | null;
  conceptbericht: string | null;
  bronlinks: { titel: string; url: string }[];
  aangemaaktOp: Date;
  /** Enkel in de demo (fictieve hooks); echte hooks komen altijd uit de mirror. */
  isTestdata?: boolean;
}

/**
 * Marktsignaal (6/10/2026): de woning van een contact staat te koop — zelf (particulier) of via een andere makelaar.
 * Gevonden op de Mac (scripts/marktsignalen.ts) via Immoweb en de Marketpulse-prospects in de mirror, op basis van het
 * genormaliseerde adres (postcode beslist). Jonas stuurt dan de dag erna een bericht "veel succes".
 */
export interface Marktsignaal {
  id: string;
  contactId: string;
  bron: 'immoweb' | 'marketpulse';
  /** Immoweb-ID of Lead-ID van de Marketpulse-prospect. */
  externId: string;
  verkoper: 'particulier' | 'makelaar' | 'notaris' | null;
  /** Naam van het kantoor (enkel bij een makelaar of notaris). */
  makelaar: string | null;
  vraagprijs: number | null;
  /** Dag dat de advertentie online kwam (volgens de bron). */
  onlineSinds: string | null; // DagKey
  url: string | null;
  /** 'adres' = zelfde woning; 'gebouw' = zelfde gebouw, andere bus. */
  overeenkomst: 'adres' | 'gebouw';
  status: 'te_koop' | 'onder_optie' | 'verkocht' | 'weg';
  eerstGezienOp: Date;
  laatstGezienOp: Date;
  /** Door Jonas afgehandeld (bericht gestuurd of bewust niets). */
  afgehandeldOp: Date | null;
  isTestdata?: boolean;
}

/**
 * Open WhatsApp-chat (7/10/2026, toestemming Jonas): de klant schreef het laatst. Met de laatste klantberichten en een
 * voorgesteld antwoord van Claude in Jonas' stijl. Gemaakt op de Mac (scripts/whatsapp-open.ts).
 */
export interface WhatsappOpen {
  id: string;
  nummer: string;
  contactId: string | null;
  naam: string | null;
  laatsteOp: Date;
  klantBerichten: { tijd: Date; tekst: string }[];
  nodig: boolean;
  antwoord: string | null;
  reden: string | null;
  afgehandeldOp: Date | null;
  isTestdata?: boolean;
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
  return uitkomst !== 'geen_antwoord' && uitkomst !== 'bericht_verstuurd';
}

/** De taal waarin Jonas de klant schrijft of aanspreekt: WhatsApp gaat voor, dan ERAForce, anders Nederlands. */
export function taalVan(c: Pick<Contact, 'taal' | 'taalWhatsapp'>): Taal {
  return c.taalWhatsapp ?? c.taal ?? 'nl';
}

/** Je-vorm, tenzij Jonas deze klant met u aanspreekt (Jonas, 6/10/2026). */
export function zegtJe(c: Pick<Contact, 'aanspreekvormBron'>): boolean {
  return c.aanspreekvormBron !== 'u';
}

export function volledigeNaam(c: Pick<Contact, 'aanhef' | 'voornaam' | 'achternaam'>): string {
  return [c.voornaam, c.achternaam].filter(Boolean).join(' ');
}
