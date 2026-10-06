// ERAForce-mirror → intern model (fase 8). Pure functies: de import (scripts/mirror-naar-oxpecker.ts) leest de rijen
// uit de mirror en schrijft het resultaat naar Supabase. Hier zit enkel de vertaling, zodat ze los te testen is.
//
// Afspraken met Jonas (5/10/2026):
// - Prospects zijn Leads. Geconverteerde leads slaan we over: hun Contact neemt het over.
// - De timeline is een open taak met vervaldatum. Een open beltaak = terugbelafspraak.
// - Een afgesloten oproep telt als gesprek, tenzij de evaluatie zegt dat er niemand opnam.
// - Een afspraak die voorbij is, telt ook als inhoudelijk contact.
import { dagVan, uurVan, vanBrusselsLokaal } from '../../core/dates';
import type { Afspraak, Bronactiviteit, Contact, Contactkanaal, ContactStatus, Telefoon } from '../../domain/model';

/** Een rij uit de mirror (SQLite): veldnamen zoals in Salesforce; booleans als 0/1. */
export type SfRij = Record<string, unknown>;

export type ContactImport = Omit<Contact, 'id' | 'geimporteerdOp'>;
export type ActiviteitImport = Omit<Bronactiviteit, 'id' | 'geimporteerdOp' | 'contactId' | 'pandId'> & { contactExternId: string };
export type AfspraakImport = Omit<Afspraak, 'id' | 'geimporteerdOp' | 'contactId' | 'belpogingId'> & { contactExternId: string | null };

const BRON = 'eraforce_mirror' as const;

// ---------- hulpfuncties ----------

const tekst = (r: SfRij, veld: string): string | null => {
  const v = r[veld];
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
};
const waar = (r: SfRij, veld: string) => r[veld] === 1 || r[veld] === true || r[veld] === '1' || r[veld] === 'true';
const tijd = (r: SfRij, veld: string): Date | null => {
  const t = tekst(r, veld);
  if (!t) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(t) ? vanBrusselsLokaal(t) : new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
};
const dag = (r: SfRij, veld: string): string | null => {
  const t = tekst(r, veld);
  return t && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
};

/** Leads (00Q) en contacten (003) zijn de enige records die in Oxpecker een contact worden. */
export const isPersoonId = (id: string | null | undefined): id is string => Boolean(id && /^(00Q|003)/.test(id));

const herkomst = (r: SfRij, gebeurdOp: Date | null) => ({
  bron: BRON,
  externId: String(r.Id),
  gebeurdOp,
  gewijzigdInBronOp: tijd(r, 'LastModifiedDate') ?? tijd(r, 'SystemModstamp'),
  isTestdata: false,
});

const AANHEF: Record<string, string> = { 'mr.': 'Dhr.', mr: 'Dhr.', 'mrs.': 'Mevr.', 'ms.': 'Mevr.', mevrouw: 'Mevr.', meneer: 'Dhr.', heer: 'Dhr.', dhr: 'Dhr.', 'dhr.': 'Dhr.', 'mevr.': 'Mevr.', mevr: 'Mevr.' };
function aanhef(r: SfRij): string | null {
  const t = tekst(r, 'ERA_Aanspreking__c') ?? tekst(r, 'Salutation');
  return t ? (AANHEF[t.toLowerCase()] ?? t) : null;
}

/** Telefoonnummers: gsm eerst, zonder dubbels. Belgische 04-nummers zijn gsm's. */
export function telefoons(r: SfRij, velden: [string, Telefoon['label']][]): Telefoon[] {
  const uit: Telefoon[] = [];
  const gezien = new Set<string>();
  for (const [veld, label] of velden) {
    const nummer = tekst(r, veld);
    if (!nummer) continue;
    const cijfers = nummer.replace(/\D/g, '').replace(/^0032/, '').replace(/^32/, '').replace(/^0/, '');
    if (cijfers.length < 8 || gezien.has(cijfers)) continue;
    gezien.add(cijfers);
    uit.push({ nummer, label: label === 'vast' && /^4\d{8}$/.test(cijfers) ? 'gsm' : label });
  }
  return uit.sort((a, b) => Number(b.label === 'gsm') - Number(a.label === 'gsm'));
}

// ---------- contacten ----------

/** Leadstatus in ERAForce → status in Oxpecker. */
export function leadStatus(r: SfRij): ContactStatus {
  const status = (tekst(r, 'Status') ?? '').toLowerCase();
  if (status.startsWith('beëindigd') || status.startsWith('beeindigd')) return 'beeindigd';
  if (waar(r, 'ERA_Long_term_lead__c')) return 'langetermijn';
  if (status === 'ingave' || status === 'nieuw') return 'nieuwe_lead';
  return 'prospect';
}

/** Straat met huisnummer en bus uit de ERA-adresvelden van een lead. */
function eraStraat(r: SfRij): string | null {
  const straat = tekst(r, 'ERA_Straat__c');
  if (!straat) return null;
  const nr = tekst(r, 'ERA_Huisnummer__c');
  const bus = tekst(r, 'ERA_Bus__c');
  return [straat, nr, bus ? `bus ${bus}` : null].filter(Boolean).join(' ');
}

/** Lead → contact, of null voor een geconverteerde lead (die bestaat verder als Contact). */
export function leadNaarContact(r: SfRij): ContactImport | null {
  if (waar(r, 'IsConverted')) return null;
  const bron = tekst(r, 'LeadSource');
  const subbron = tekst(r, 'ERA_Lead_subbron__c');
  return {
    ...herkomst(r, null),
    aanhef: aanhef(r),
    voornaam: tekst(r, 'FirstName'),
    achternaam: tekst(r, 'LastName') ?? tekst(r, 'Company') ?? '(zonder naam)',
    telefoons: telefoons(r, [['MobilePhone', 'gsm'], ['Phone', 'vast']]),
    email: tekst(r, 'Email'),
    // Het pandadres staat in de ERA-velden (Street/City zijn bij ERA leeg).
    straat: eraStraat(r) ?? tekst(r, 'Street'),
    postcode: tekst(r, 'ERA_Postcode__c') ?? tekst(r, 'PostalCode'),
    gemeente: tekst(r, 'ERA_Gemeente__c') ?? tekst(r, 'City'),
    statusBron: leadStatus(r),
    statusLabelBron: tekst(r, 'Status'),
    faseBron: null,
    tijdshorizonBron: null,
    aanspreekvormBron: null,
    herkomstContact: bron && subbron && subbron !== bron ? `${bron} – ${subbron}` : bron,
    nietBellenBron: waar(r, 'DoNotCall'),
    aangemaaktInBronOp: tijd(r, 'CreatedDate'),
    isLokaalTijdelijk: false,
  };
}

/** Contact (geen prospect, bv. verkoper of kandidaat) → contact met status "relatie". */
export function contactNaarContact(r: SfRij): ContactImport {
  return {
    ...herkomst(r, null),
    aanhef: aanhef(r),
    voornaam: tekst(r, 'FirstName'),
    achternaam: tekst(r, 'LastName') ?? '(zonder naam)',
    telefoons: telefoons(r, [['MobilePhone', 'gsm'], ['Phone', 'vast'], ['HomePhone', 'vast'], ['OtherPhone', 'ander']]),
    email: tekst(r, 'Email'),
    straat: tekst(r, 'MailingStreet') ?? tekst(r, 'OtherStreet'),
    postcode: tekst(r, 'MailingPostalCode') ?? tekst(r, 'OtherPostalCode'),
    gemeente: tekst(r, 'MailingCity') ?? tekst(r, 'OtherCity'),
    statusBron: 'relatie',
    statusLabelBron: 'Contact',
    faseBron: null,
    tijdshorizonBron: null,
    aanspreekvormBron: null,
    herkomstContact: tekst(r, 'LeadSource'),
    nietBellenBron: waar(r, 'DoNotCall'),
    aangemaaktInBronOp: tijd(r, 'CreatedDate'),
    isLokaalTijdelijk: false,
  };
}

// ---------- taken ----------

const EVALUATIEVELDEN = ['Description', 'ERA_Evaluatie__c', 'ERA_Broker_Evaluation_Text__c', 'ERA_Property_Evaluation_Text__c', 'ERA_Interne_Informatie__c'];

/** Onderwerp en evaluaties samen, zonder herhalingen. */
function inhoud(r: SfRij): string {
  const delen: string[] = [];
  for (const v of ['Subject', ...EVALUATIEVELDEN]) {
    const t = tekst(r, v);
    if (t && !delen.some((d) => d.includes(t))) delen.push(t);
  }
  return delen.join('\n\n') || tekst(r, 'Type') || 'Taak';
}

/** Gaat de taak over bellen? Op type ("Uitgaande Oproep", "Bellen") of onderwerp ("terugbellen", "ZO bellen"). */
export function isBeltaak(r: SfRij): boolean {
  return /oproep|bellen|call/i.test(tekst(r, 'Type') ?? '') || /\b(terug)?bel(len)?\b|\bcall\b|opvolgtaak/i.test(tekst(r, 'Subject') ?? '');
}

/**
 * Herkenning van het kanaal, in volgorde van voorrang. "Aanbellen" is aan de deur bellen (bezoek), geen oproep.
 * "Langsgaan met flyer" is een bezoek: de flyer is wat je achterlaat als er niemand thuis is.
 */
const KANAAL_PATRONEN: [Contactkanaal, RegExp][] = [
  ['bezoek', /langs\s*(gaan|gaat|komen|lopen|rijden)|\bbezoek|\baanbellen|\bdag zeggen|\bop de stoep|\bdeur\b/i],
  ['flyer', /flyer|folder|\bin de bus\b|brievenbus|flyeren/i],
  ['whatsapp', /whats\s*app|\bwa\b/i],
  ['bericht', /\bsms|berichtje|\btekstbericht/i],
  ['brief', /\bbrief|aangetekend|kaartje|\bkaart\b|buurtmailing|zomerbrief|nieuwjaarsbrief/i],
  ['mail', /\be-?mail|\bmailen\b|\bmail\b/i],
];

/**
 * Het geplande kanaal van een taak: eerst uit het onderwerp (wat Jonas zelf schreef), dan uit het type.
 * Het type staat vaak op "Bellen" terwijl het onderwerp iets anders zegt (bv. "langsgaan met flyer").
 * Een beltaak zonder ander kanaal is "bellen"; een administratieve taak heeft geen kanaal (null).
 */
export function kanaalUitTaak(r: SfRij): Contactkanaal | null {
  const onderwerp = tekst(r, 'Subject') ?? '';
  // Staat er uitdrukkelijk "bellen" in het onderwerp ("Bellen indien bezoek mogelijk"), dan is het bellen.
  if (/\b(terug|op)?bel(len|t)?\b|\bcall\b/i.test(onderwerp)) return 'bellen';
  for (const [k, re] of KANAAL_PATRONEN) if (re.test(onderwerp)) return k;
  const type = tekst(r, 'Type') ?? '';
  if (/^aanbellen/i.test(type)) return 'bezoek';
  if (/flyer/i.test(type)) return 'flyer';
  if (/^sms/i.test(type)) return 'bericht';
  if (/brief|buurtmailing/i.test(type)) return 'brief';
  if (/^e-?mail/i.test(type)) return 'mail';
  return isBeltaak(r) ? 'bellen' : null;
}

/** Een afgesloten oproep waarbij niemand opnam, is geen inhoudelijk contact. */
const GEEN_GEHOOR =
  /geen\s*(gehoor|antwoord|reactie)|niet\s*(op)?genomen|nt\s*opgenomen|voicemail|antwoordapparaat|antw\.?\s*app|onbereikbaar|niet\s*bereikbaar|nummer\s*(bestaat niet|onjuist|fout)|(?<![\p{L}])(vm|v\.m\.?|vmail|ingesproken|inspreken|bericht\s*ingesproken|r[ée]pondeur|messagerie|no answer|pas de r[ée]ponse)(?![\p{L}])/iu;

/**
 * Niemand gesproken bij een afgesloten oproep: de evaluatie zegt het ("geen gehoor", "vm", …), of een UITGAANDE oproep
 * zonder evaluatie (Jonas, 6/10/2026: leeg of "vm" = antwoordapparaat). Een inkomende oproep zonder tekst blijft een gesprek.
 */
export function geenGehoor(evaluatie: string, type: string | null): boolean {
  if (GEEN_GEHOOR.test(evaluatie)) return true;
  const leeg = !/\p{L}{2,}/u.test(evaluatie);
  return leeg && !/inkomend/i.test(type ?? '');
}

/** Taak → bronactiviteit, of null als de taak niet aan een lead of contact hangt. */
export function taakNaarActiviteit(r: SfRij, eigenaarNaam: (id: string | null) => string | null): ActiviteitImport | null {
  const wie = tekst(r, 'WhoId');
  if (!isPersoonId(wie)) return null;
  const open = !waar(r, 'IsClosed');
  const kanaal = kanaalUitTaak(r);
  const evaluatie = EVALUATIEVELDEN.map((v) => tekst(r, v)).filter(Boolean).join(' ');
  const basis = {
    contactExternId: wie,
    auteur: eigenaarNaam(tekst(r, 'OwnerId')),
    tekst: inhoud(r),
    soortLabel: tekst(r, 'Type'),
  };
  if (open) {
    const vervalt = dag(r, 'ActivityDate');
    const herinnering = waar(r, 'IsReminderSet') ? tijd(r, 'ReminderDateTime') : null;
    // Elke open taak met een contactkanaal is een geplande contactstap (timeline eerst), ook flyer, brief of bezoek.
    return {
      ...herkomst(r, tijd(r, 'CreatedDate')),
      ...basis,
      type: 'taak',
      kanaal,
      taakSoort: kanaal ? 'terugbellen' : 'algemeen',
      vervaltOp: vervalt,
      vervaltUur: herinnering && vervalt && dagVan(herinnering) === vervalt ? uurVan(herinnering) : null,
      taakAfgerond: false,
    };
  }
  const gebeurd = tijd(r, 'CompletedDateTime') ?? tijd(r, 'ERA_Close_Date__c') ?? tijd(r, 'ActivityDate') ?? tijd(r, 'CreatedDate');
  // Een bezoek telt enkel als gesprek als er een evaluatie is en je iemand trof.
  const gesprek = kanaal === 'bellen' ? !geenGehoor(evaluatie, tekst(r, 'Type')) : kanaal === 'bezoek' && Boolean(evaluatie) && !GEEN_GEHOOR.test(evaluatie) && !/niet thuis|niemand thuis/i.test(evaluatie);
  return {
    ...herkomst(r, gebeurd),
    ...basis,
    type: gesprek ? 'gesprek' : 'notitie',
    kanaal,
    taakSoort: null,
    vervaltOp: dag(r, 'ActivityDate'),
    vervaltUur: null,
    taakAfgerond: true,
  };
}

// ---------- afspraken ----------

/** Event → afspraak in de agenda. Hele-dagafspraken lopen van middernacht tot middernacht (Brussel). */
export function eventNaarAfspraak(r: SfRij): AfspraakImport | null {
  const heleDag = waar(r, 'IsAllDayEvent');
  let start = tijd(r, 'StartDateTime');
  let einde = tijd(r, 'EndDateTime');
  if (heleDag) {
    const van = dag(r, 'ActivityDate') ?? (start ? start.toISOString().slice(0, 10) : null);
    const tot = dag(r, 'EndDate') ?? van;
    if (!van || !tot) return null;
    start = vanBrusselsLokaal(`${van}T00:00`);
    einde = vanBrusselsLokaal(`${tot}T23:59`);
  }
  if (!start || !einde) return null;
  if (einde < start) einde = start;
  const wie = tekst(r, 'WhoId');
  const type = tekst(r, 'Type');
  return {
    ...herkomst(r, start),
    titel: tekst(r, 'Subject') ?? type ?? 'Afspraak',
    start,
    einde,
    heleDag,
    locatie: tekst(r, 'Location'),
    contactExternId: isPersoonId(wie) ? wie : null,
    koppelStatus: isPersoonId(wie) ? 'bevestigd' : 'geen',
    omschrijving: tekst(r, 'Description'),
    soortLabel: type,
  };
}

/** Types die geen ontmoeting met het contact zijn. */
const GEEN_ONTMOETING = /^(bezet|permanentie|andere afspraak|training|opleiding|vakantie|verlof)/i;

/**
 * Een voorbije afspraak met een lead of contact telt als inhoudelijk contact. Daarvoor maken we een extra
 * "gesprek"-activiteit, zodat de planning weet wanneer je die persoon laatst sprak.
 */
export function afspraakAlsGesprek(r: SfRij, nu: Date, eigenaarNaam: (id: string | null) => string | null): ActiviteitImport | null {
  const a = eventNaarAfspraak(r);
  if (!a || !a.contactExternId || a.einde > nu || GEEN_ONTMOETING.test(a.soortLabel ?? '')) return null;
  return {
    bron: BRON,
    externId: `${String(r.Id)}:gesprek`,
    gebeurdOp: a.start,
    gewijzigdInBronOp: a.gewijzigdInBronOp,
    isTestdata: false,
    contactExternId: a.contactExternId,
    auteur: eigenaarNaam(tekst(r, 'OwnerId')),
    tekst: [`Afspraak: ${a.soortLabel ?? a.titel}`, a.omschrijving].filter(Boolean).join('\n\n'),
    soortLabel: a.soortLabel,
    type: 'gesprek',
    taakSoort: null,
    vervaltOp: null,
    vervaltUur: null,
    taakAfgerond: true,
  };
}
