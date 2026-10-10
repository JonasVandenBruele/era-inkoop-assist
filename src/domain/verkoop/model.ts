// Datamodel van de verkoopmodule (koperspool, matchmaking, gedeelde contactlijsten).
// Twee soorten gegevens, net als in de Dagplanner (PLAN.md §3):
//  - Brongegevens (VerkoopBasis): uit de bron (nu de fictieve demo, later de ERAForce-mirror). Alleen-lezen.
//  - Eigen gegevens (records): kwalificaties, beslissingen, vrijgaven, acties en resultaten. Enkel in Oxpecker bewaard;
//    een synchronisatie raakt ze nooit aan.
import type { DagKey } from '../../core/dates';
import type { Contact, Pand } from '../model';

export type PandType = Pand['type'];

// ---------------------------------------------------------------- medewerkers

export type Rol = 'inkoper' | 'verkoper' | 'kantoorleider';

export interface Medewerker {
  id: string;
  voornaam: string;
  naam: string;
  rol: Rol;
  kantoorId: string;
}

// ---------------------------------------------------------------- herkomst

/** Waar een gegeven vandaan komt. Wordt overal getoond waar een gegeven een beslissing stuurt. */
export interface Bronverwijzing {
  soort: 'zoekopdracht' | 'gesprek' | 'bezoek' | 'bod' | 'medewerker' | 'voorstel' | 'pandfiche' | 'eigenaar';
  /** Id van het bronrecord (zoekopdracht, bezoek, notitie …), indien van toepassing. */
  ref: string | null;
  /** Letterlijke zin waarop een interpretatie steunt. */
  citaat: string | null;
  dag: DagKey;
  /** Medewerker-id, of null bij een automatisch voorstel. */
  door: string | null;
}

export type Betrouwbaarheid = 'hoog' | 'middel' | 'laag';

// ---------------------------------------------------------------- zoekopdrachten

export type Staat = 'instapklaar' | 'op_te_frissen' | 'te_renoveren';
export const STAAT_VOLGORDE: Staat[] = ['instapklaar', 'op_te_frissen', 'te_renoveren'];
export type EpcLabel = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface CriteriumWaarden {
  budget: { min: number | null; max: number };
  regio: { gemeenten: string[] };
  regio_uitgesloten: { gemeenten: string[] };
  type: { types: PandType[] };
  slaapkamers: { min: number };
  bewoonbare_opp: { min: number };
  tuin: { nodig: boolean };
  terras: { nodig: boolean };
  privacy: { nodig: boolean };
  orientatie: { richtingen: string[] };
  parking: { nodig: boolean };
  garage: { nodig: boolean };
  /** Hoeveel werk de kandidaat maximaal aanvaardt. */
  renovatie: { maxWerk: Staat };
  toegankelijkheid: { gelijkvloers: boolean };
  epc: { slechtsteLabel: EpcLabel };
  timing: { omschrijving: string };
}
export type CriteriumSleutel = keyof CriteriumWaarden;

/**
 * hard = harde voorwaarde (schending → nooit "sterke match"); voorkeur = wens; vermoeden = afgeleid, nog te bevestigen;
 * onbekend = er is iets over gezegd, maar de waarde is niet duidelijk.
 */
export type CriteriumSoort = 'hard' | 'voorkeur' | 'vermoeden' | 'onbekend';

interface CriteriumBasis {
  id: string;
  soort: CriteriumSoort;
  bron: Bronverwijzing;
  betrouwbaarheid: Betrouwbaarheid;
  /** verworpen = een medewerker heeft dit (afgeleide) criterium afgewezen; het telt niet meer mee. */
  status: 'actief' | 'verworpen';
}
export type Criterium = { [K in CriteriumSleutel]: CriteriumBasis & { sleutel: K; waarde: CriteriumWaarden[K] } }[CriteriumSleutel];

export interface Zoekopdracht {
  id: string;
  externId: string | null;
  contactId: string;
  /** Korte naam van het scenario, bv. "Instapklaar tot €450.000". */
  titel: string;
  status: 'actief' | 'gesloten';
  /** Waarom gesloten (bv. "Gekocht", "Plannen gewijzigd"). */
  slotReden: string | null;
  criteria: Criterium[];
  aangemaaktOp: DagKey;
  bron: Bronverwijzing;
}

// ---------------------------------------------------------------- kandidaten en huishoudens

export type PoolStatus = 'te_kwalificeren' | 'actief' | 'koopklaar' | 'gepauzeerd' | 'afgerond';
export type FinancieringStatus = 'onbekend' | 'te_onderzoeken' | 'besproken_kredietverstrekker' | 'bevestigd';
export type JaNeeOnbekend = 'ja' | 'nee' | 'onbekend';

/** Een kandidaat-koper uit de bron: het bestaande contact (zelfde identiteit als in de Dagplanner) + relatie-eigenaar. */
export interface Kandidaat {
  contact: Contact;
  /** Medewerker die de contactrelatie beheert (los van wie een actie uitvoert). */
  eigenaarId: string;
  /** Enkel bij een uitdrukkelijk gekoppeld huishouden (nooit afgeleid uit adres of achternaam). */
  huishoudenId: string | null;
}

export interface Huishouden {
  id: string;
  naam: string;
  contactIds: string[];
  /** Hoe de koppeling vastgelegd is, bv. "Gekoppeld in ERAForce (partner)". */
  bron: string;
}

/** Koopbereidheid, vastgelegd in Oxpecker door een medewerker. */
export interface Kwalificatie {
  contactId: string;
  poolStatus: PoolStatus;
  budget: { bedrag: number; bevestigdOp: DagKey; bron: string } | null;
  financiering: { status: FinancieringStatus; bron: string | null; op: DagKey | null };
  afhankelijkVanVerkoop: { status: JaNeeOnbekend; toelichting: string | null };
  termijn: string | null;
  snelBezoeken: JaNeeOnbekend;
  interesseVoorPublicatie: JaNeeOnbekend;
  contactvoorkeur: string | null;
  verantwoordelijkeId: string;
  /** Laatste inhoudelijke bevestiging dat de kandidaat nog zoekt (nooit een technische wijzigingsdatum). */
  laatsteBevestiging: { op: DagKey; door: string; bron: string } | null;
  koopklaar: { door: string; op: DagKey } | null;
  pauze: { tot: DagKey | null; reden: string | null } | null;
  toegevoegd: { door: string; op: DagKey; wijze: 'zelf' | 'voorstel' | 'bron' };
}

export interface Contactverbod {
  contactId: string;
  door: string;
  op: DagKey;
  reden: string | null;
}

// ---------------------------------------------------------------- panden

export type PandFase = 'in_voorbereiding' | 'verkoopopdracht' | 'gepubliceerd' | 'onder_optie' | 'verkocht' | 'ingetrokken';

export interface Tuin {
  aanwezig: boolean;
  /** Bruikbare tuin in m², enkel als die gemeten of opgegeven is. Een perceeloppervlakte is géén tuinmaat. */
  bruikbareOpp: number | null;
  omschrijving: string | null;
}

export interface Kenmerken {
  slaapkamers: number | null;
  bewoonbareOpp: number | null;
  perceelOpp: number | null;
  tuin: Tuin | null;
  terras: boolean | null;
  privacy: 'goed' | 'beperkt' | null;
  orientatie: string | null;
  parking: boolean | null;
  garage: boolean | null;
  staat: Staat | null;
  epc: EpcLabel | null;
  gelijkvloersWonen: boolean | null;
  /** Vrije beschrijving van de ligging, bv. "rustige zijstraat" of "langs drukke steenweg". */
  ligging: string | null;
  indeling: string | null;
}
export type KenmerkSleutel = keyof Kenmerken;

export interface KenmerkHerkomst {
  bron: string;
  door: string | null;
  op: DagKey;
}

export interface VerkoopPand {
  id: string;
  externId: string | null;
  kantoorId: string;
  straat: string;
  postcode: string;
  gemeente: string;
  type: PandType;
  fase: PandFase;
  kenmerken: Kenmerken;
  herkomst: Partial<Record<KenmerkSleutel, KenmerkHerkomst>>;
  /** Interne richtprijs: nooit extern delen. */
  richtprijsIntern: number | null;
  inkoperId: string | null;
  verkoperId: string | null;
  omschrijving: string | null;
  /** Geplande publicatiedatum, indien gekend. */
  publicatieGepland: DagKey | null;
}

export interface PrijsRegistratie {
  id: string;
  pandId: string;
  soort: 'vraagprijs';
  bedrag: number;
  valuta: 'EUR';
  dag: DagKey;
  bron: 'eraforce' | 'handmatig';
  door: string | null;
}

export interface Toestemming {
  door: string;
  op: DagKey;
  /** Afspraak met de eigenaar waarop dit steunt, bv. "Akkoord eigenaar per mail 8/10". */
  bron: string;
}

export interface Vrijgave {
  pandId: string;
  internMatchen: Toestemming | null;
  contacteren: Toestemming | null;
  bezoeken: Toestemming | null;
  deelbaar: { gemeente: boolean; adres: boolean; vraagprijs: boolean; kenmerken: boolean };
  /** Bevestigde, deelbare vraagprijs (los van de interne richtprijs). */
  vraagprijs: number | null;
  instructies: string | null;
}

// ---------------------------------------------------------------- historiek uit de bron

export interface Bezoek {
  id: string;
  contactId: string;
  pandId: string;
  dag: DagKey;
  /** 1 = eerste bezoek, 2 = tweede bezoek … */
  volgnummer: number;
  evaluatie: string | null;
  door: string | null;
}

export interface Bod {
  id: string;
  contactId: string;
  pandId: string;
  bedrag: number;
  dag: DagKey;
  status: 'lopend' | 'geweigerd' | 'overboden' | 'aanvaard' | 'ingetrokken';
}

/** Vrije tekst over een kandidaat: gespreksnotitie, evaluatie of mail. */
export interface Notitie {
  id: string;
  contactId: string;
  pandId: string | null;
  dag: DagKey;
  tekst: string;
  door: string | null;
  bron: 'gesprek' | 'notitie' | 'bezoek';
}

// ---------------------------------------------------------------- interpretatie van vrije tekst

export type InzichtSoort = 'bezwaar' | 'positief' | 'prijs_volgen' | 'geen_eis' | 'aankoopplan' | 'over_ander' | 'gestopt';
export type InzichtKenmerk =
  | 'tuin'
  | 'prijs'
  | 'prijs_kwaliteit'
  | 'staat'
  | 'ligging'
  | 'indeling'
  | 'locatie'
  | 'grootte'
  | 'parking'
  | 'algemeen';

export interface Inzicht {
  id: string;
  contactId: string;
  /** Het pand waarover het gaat (bv. het bezochte pand), of null bij een algemene uitspraak. */
  pandId: string | null;
  bronRef: string;
  citaat: string;
  soort: InzichtSoort;
  kenmerk: InzichtKenmerk;
  uitleg: string;
  betrouwbaarheid: Betrouwbaarheid;
  status: 'voorstel' | 'bevestigd' | 'verworpen';
  dag: DagKey;
  /** 'regels' = deterministische herkenning in de code; 'ai' = later door Claude, met dezelfde bronverwijzing. */
  herkenning: 'regels' | 'ai';
}

// ---------------------------------------------------------------- campagnes, acties en resultaten

export type CampagneSoort = 'lancering' | 'prijsdaling' | 'opvolging';

export interface Campagne {
  id: string;
  pandId: string;
  soort: CampagneSoort;
  /** Unieke sleutel van de aanleiding: dezelfde prijsdaling twee keer verwerken geeft dezelfde campagne. */
  sleutel: string;
  prijs: { van: number; naar: number; registratieId: string } | null;
  aangemaaktDoor: string;
  aangemaaktOp: string; // ISO
  scoreVersie: string;
}

export type Voortgang =
  | 'nog_contacteren'
  | 'in_behandeling'
  | 'geen_antwoord'
  | 'terugbellen'
  | 'interesse'
  | 'bezoek_gepland'
  | 'geen_interesse'
  | 'afgerond';

export const OPEN_VOORTGANG: Voortgang[] = ['nog_contacteren', 'in_behandeling', 'geen_antwoord', 'terugbellen', 'interesse', 'bezoek_gepland'];

export interface Aanleiding {
  campagneId: string | null;
  soort: CampagneSoort | 'herbevestiging' | 'verzoek';
  uitleg: string;
  op: string; // ISO
  door: string;
}

export interface Historiekregel {
  op: string; // ISO
  door: string;
  tekst: string;
}

/** Eén contactactie: hetzelfde record bij het pand, in het kantooroverzicht en in Vandaag bellen. */
export interface Contactactie {
  id: string;
  kantoorId: string;
  contactId: string;
  /** null bij een actie zonder pand (bv. koopbereidheid opnieuw bevestigen of een afgesproken terugbelmoment). */
  pandId: string | null;
  soort: 'pand' | 'herbevestiging' | 'opvolging';
  aanleidingen: Aanleiding[];
  voortgang: Voortgang;
  /** Interesse van de kandidaat staat los van de taakvoortgang: "geen antwoord" zegt niets over interesse. */
  interesse: 'onbekend' | 'ja' | 'nee';
  uitvoerderId: string;
  toegewezenDoor: string;
  /** Bericht van een collega bij toewijzing (bv. de matchreden). */
  verzoek: string | null;
  claim: { door: string; tot: string } | null;
  terugbellen: { dag: DagKey; uur: string | null } | null;
  bezoek: { dag: DagKey; uur: string | null; notitie: string | null } | null;
  volgendePoging: DagKey | null;
  volgendeStap: string | null;
  geenInteresseReden: InzichtKenmerk | null;
  laatsteContactOp: string | null;
  historiek: Historiekregel[];
  aangemaaktOp: string;
  aangemaaktDoor: string;
  scoreVersie: string;
}

export type Uitkomst =
  | 'interesse'
  | 'bezoek'
  | 'geen_interesse'
  | 'profiel_aangepast'
  | 'geen_antwoord'
  | 'terugbellen'
  | 'gepauzeerd'
  | 'gekocht'
  | 'niet_meer_contacteren'
  | 'bericht_verstuurd';

/** Wat er geregistreerd werd na een (in de demo gesimuleerd) gesprek. Een tik op "Bel" alleen bewijst niets. */
export interface Contactmoment {
  id: string;
  contactId: string;
  actieIds: string[];
  door: string;
  op: string; // ISO
  kanaal: 'telefoon' | 'whatsapp' | 'mail' | 'bezoek';
  uitkomst: Uitkomst;
  reden: InzichtKenmerk | null;
  notitie: string | null;
  terugbellen: { dag: DagKey; uur: string | null } | null;
  bezoek: { dag: DagKey; uur: string | null } | null;
  /** In de demo altijd true: er werd niet echt gebeld of verstuurd. */
  gesimuleerd: boolean;
}

/** Een kandidaat wees een pand af. Komt pas terug als het werkelijke bezwaar verandert (bv. prijs bij een prijsdaling). */
export interface Afwijzing {
  id: string;
  contactId: string;
  pandId: string;
  reden: InzichtKenmerk;
  prijsOpMoment: number | null;
  dag: DagKey;
  door: string | null;
}

// ---------------------------------------------------------------- instellingen

export interface VerkoopInstellingen {
  /** Na hoeveel dagen een bevestiging van koopbereidheid verouderd is. */
  bevestigingsritmeDagen: number;
  /** Na hoeveel minuten een vergeten claim vervalt. */
  claimMinuten: number;
  /** Dagdoel van Vandaag bellen (geen bovengrens voor dringende acties). */
  capaciteit: number;
  matchGewichten: { budget: number; locatie: number; woning: number; wensen: number; praktisch: number };
  belGewichten: { match: number; intentie: number; aanleiding: number; opvolging: number };
}

export const STANDAARD_VERKOOP_INSTELLINGEN: VerkoopInstellingen = {
  bevestigingsritmeDagen: 30,
  claimMinuten: 20,
  capaciteit: 15,
  matchGewichten: { budget: 25, locatie: 20, woning: 20, wensen: 25, praktisch: 10 },
  belGewichten: { match: 40, intentie: 30, aanleiding: 20, opvolging: 10 },
};

/** Versie van de scoreregels; wordt bewaard bij campagnes en acties. Verhogen bij elke wijziging van de regels. */
export const SCORE_VERSIE = 'verkoop-scores-v1';

// ---------------------------------------------------------------- brongegevens samen

export interface VerkoopBasis {
  kantoor: { id: string; naam: string };
  medewerkers: Medewerker[];
  kandidaten: Kandidaat[];
  huishoudens: Huishouden[];
  /** Kwalificaties die al bestonden bij de start (in de demo; later uit de eigen Oxpecker-opslag). */
  kwalificaties: Kwalificatie[];
  zoekopdrachten: Zoekopdracht[];
  panden: VerkoopPand[];
  prijzen: PrijsRegistratie[];
  vrijgaven: Vrijgave[];
  bezoeken: Bezoek[];
  biedingen: Bod[];
  notities: Notitie[];
  /** Interpretaties die al gemaakt waren (niet opnieuw analyseren als de historiek niet wijzigt). */
  inzichten: Inzicht[];
  contactverboden: Contactverbod[];
  /** Begintoestand van campagnes en acties (enkel in de demo). */
  campagnes: Campagne[];
  acties: Contactactie[];
  contactmomenten: Contactmoment[];
  afwijzingen: Afwijzing[];
  /** Laatste geslaagde synchronisatie van de bron. */
  laatsteSync: string | null;
  bronNaam: string;
}

export function naamVan(c: Pick<Contact, 'voornaam' | 'achternaam'>): string {
  return [c.voornaam, c.achternaam].filter(Boolean).join(' ');
}
