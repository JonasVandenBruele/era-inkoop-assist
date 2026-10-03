// De bellijst van vandaag: harde regels, voorrangsgroepen en een uitlegbare score (PLAN.md §5).
// Pure functie: alle gegevens, instellingen en "vandaag" komen binnen als parameter. De AI speelt hier geen rol.
import { dagVan, dagenTussen, korteDag, relatief, type DagKey } from '../core/dates';
import type { Instellingen } from '../core/settings/schema';
import type { Afspraak, Belpoging, Bronactiviteit, Contact, Fase } from './model';
import { heeftTelefoon, laatsteInhoudelijkContact, type LaatsteContact } from './overzicht';
import { horizonCategorie, HORIZON_LABEL, type HorizonCategorie } from './horizon';
import { plusWerkdagen, werkdagenTussen } from './werkdagen';

// ---------- Invoer ----------

export interface Planningskeuze {
  id: string;
  contactId: string;
  soort: 'vastpinnen' | 'vandaag_overslaan' | 'uitstellen';
  /** Voor vastpinnen en vandaag_overslaan: de dag waarvoor de keuze geldt. */
  voorDag: DagKey | null;
  /** Voor uitstellen: het contact verschijnt pas weer vanaf deze dag. */
  totDag: DagKey | null;
  ongedaanOp: Date | null;
}

/** Lokale opvolgactie of terugbelafspraak (fase 3); de bron levert terugbeltaken via bronactiviteiten. */
export interface Opvolgactie {
  id: string;
  contactId: string;
  soort: 'terugbellen' | 'vervolgstap';
  dag: DagKey;
  uur: string | null;
  omschrijving: string | null;
  aangemaaktOp: Date;
  status: 'open' | 'afgehandeld' | 'vervallen';
}

export interface Belverbod {
  contactId: string;
  ingetrokkenOp: Date | null;
}

export interface BellijstInvoer {
  contacten: Contact[];
  activiteiten: Bronactiviteit[];
  belpogingen: Belpoging[];
  afspraken: Afspraak[];
  keuzes?: Planningskeuze[];
  opvolgacties?: Opvolgactie[];
  belverboden?: Belverbod[];
  instellingen: Instellingen;
  vandaag: DagKey;
}

// ---------- Uitvoer ----------

export type Groep = 'A' | 'pin' | 'B' | 'C' | 'D';

export const GROEP_LABEL: Record<Groep, string> = {
  A: 'Terugbelafspraak met uur',
  pin: 'Vastgepind',
  B: 'Nieuwe lead',
  C: 'Terugbellen',
  D: 'Opvolging',
};

export interface ScoreOnderdeel {
  label: string;
  punten: number;
}

export interface Terugbelafspraak {
  dag: DagKey;
  uur: string | null;
  tekst: string | null;
  herkomst: 'bron' | 'lokaal';
}

export interface Kandidaat {
  contact: Contact;
  groep: Groep;
  /** Score volgens §5.3. Bepaalt de volgorde in groep D. */
  score: number;
  onderdelen: ScoreOnderdeel[];
  /** Concrete reden waarom vandaag, in gewone taal. */
  reden: string;
  fase: Fase | null;
  horizon: HorizonCategorie;
  laatste: LaatsteContact | null;
  ritmeVerhouding: number | null;
  terugbel: Terugbelafspraak | null;
  pogingenZonderAntwoord: number;
  isVastgepind: boolean;
}

export type UitsluitReden =
  | 'belverbod'
  | 'terugbel_later'
  | 'uitgesteld'
  | 'vandaag_overgeslagen'
  | 'afspraak_vandaag'
  | 'wacht_na_geen_antwoord'
  | 'nog_niet_aan_de_beurt';

export interface Uitgesloten {
  contact: Contact;
  reden: UitsluitReden;
  detail: string;
}

export interface Bellijst {
  /** De daglijst: groep A altijd volledig, daarna tot het maximum. */
  vandaag: Kandidaat[];
  /** Wel aan de beurt, maar past niet in het maximum. */
  nietOpLijst: Kandidaat[];
  /** Aan de beurt, maar geen bruikbaar telefoonnummer. */
  nummerZoeken: Kandidaat[];
  /** Te veel onbeantwoorde pogingen op rij: jij beslist. */
  handmatigBeoordelen: Kandidaat[];
  uitgesloten: Uitgesloten[];
  /** Vastpinnen dat niet kon (bv. belverbod). */
  pinGeweigerd: { contact: Contact; reden: string }[];
  waarschuwingen: string[];
}

// ---------- Hulpfuncties ----------

const actief = <T extends { ongedaanOp: Date | null }>(x: T) => x.ongedaanOp === null;

/** Effectieve fase. Fase 5 voegt hier correcties en goedgekeurde AI-inzichten aan toe (PLAN.md §3.5). */
export function effectieveFase(c: Contact): Fase | null {
  return c.faseBron;
}

/** Onbeantwoorde, niet-ongedane pogingen sinds het laatste inhoudelijke contact, nieuwste eerst. */
function pogingenSindsContact(contactId: string, belpogingen: Belpoging[], laatste: LaatsteContact | null): Belpoging[] {
  return belpogingen
    .filter((p) => p.contactId === contactId && actief(p) && !p.isInhoudelijk && (!laatste || p.tijdstip > laatste.tijdstip))
    .sort((a, b) => b.tijdstip.getTime() - a.tijdstip.getTime());
}

/**
 * Geldende terugbelafspraak. Bron (open terugbeltaak) en lokaal (opvolgactie) worden samen bekeken;
 * de meest recent gemaakte afspraak geldt. Een afspraak waarna al inhoudelijk contact was op of na de vervaldag, is afgehandeld.
 */
function geldendeTerugbel(contactId: string, invoer: BellijstInvoer, laatste: LaatsteContact | null): Terugbelafspraak | null {
  const kandidaten: { aangemaakt: Date; t: Terugbelafspraak }[] = [];
  for (const a of invoer.activiteiten) {
    if (a.contactId !== contactId || a.taakSoort !== 'terugbellen' || a.taakAfgerond || !a.vervaltOp) continue;
    kandidaten.push({ aangemaakt: a.gebeurdOp ?? a.geimporteerdOp, t: { dag: a.vervaltOp, uur: a.vervaltUur, tekst: a.tekst, herkomst: 'bron' } });
  }
  for (const o of invoer.opvolgacties ?? []) {
    if (o.contactId !== contactId || o.soort !== 'terugbellen' || o.status !== 'open') continue;
    kandidaten.push({ aangemaakt: o.aangemaaktOp, t: { dag: o.dag, uur: o.uur, tekst: o.omschrijving, herkomst: 'lokaal' } });
  }
  const open = kandidaten.filter(({ t }) => !(laatste && dagVan(laatste.tijdstip) >= t.dag));
  if (open.length === 0) return null;
  open.sort((a, b) => b.aangemaakt.getTime() - a.aangemaakt.getTime());
  return open[0]!.t;
}

function aanspreking(c: Contact): string {
  return [c.aanhef, c.voornaam, c.achternaam].filter(Boolean).join(' ');
}

// ---------- Hoofdfunctie ----------

export function berekenBellijst(invoer: BellijstInvoer): Bellijst {
  const { instellingen: inst, vandaag } = invoer;
  const w = inst.gewichten;
  const keuzes = (invoer.keuzes ?? []).filter(actief);
  const verboden = new Set((invoer.belverboden ?? []).filter((b) => !b.ingetrokkenOp).map((b) => b.contactId));
  const afspraakVandaag = new Set(invoer.afspraken.filter((a) => a.contactId && dagVan(a.start) <= vandaag && vandaag <= dagVan(a.einde)).map((a) => a.contactId!));

  const resultaat: Bellijst = { vandaag: [], nietOpLijst: [], nummerZoeken: [], handmatigBeoordelen: [], uitgesloten: [], pinGeweigerd: [], waarschuwingen: [] };
  const kandidaten: Kandidaat[] = [];
  const pinVolgorde = new Map<string, number>();

  for (const c of invoer.contacten) {
    const mijnKeuzes = keuzes.filter((k) => k.contactId === c.id);
    const pin = mijnKeuzes.find((k) => k.soort === 'vastpinnen' && k.voorDag === vandaag);
    const sluitUit = (reden: UitsluitReden, detail: string) => resultaat.uitgesloten.push({ contact: c, reden, detail });

    // Regel 1: belverbod. Ook vastpinnen omzeilt dit niet.
    if (c.nietBellenBron || verboden.has(c.id)) {
      sluitUit('belverbod', c.nietBellenBron ? 'Wil niet meer gebeld worden (bron).' : 'Wil niet meer gebeld worden (jouw keuze).');
      if (pin) resultaat.pinGeweigerd.push({ contact: c, reden: 'Kan niet vastgepind worden: belverbod.' });
      continue;
    }

    const laatste = laatsteInhoudelijkContact(c.id, invoer.activiteiten, invoer.belpogingen);
    const terugbel = geldendeTerugbel(c.id, invoer, laatste);
    const pogingen = pogingenSindsContact(c.id, invoer.belpogingen, laatste);

    if (!pin) {
      // Regel 2: toekomstige expliciete terugbeldatum wordt gerespecteerd.
      if (terugbel && terugbel.dag > vandaag) {
        sluitUit('terugbel_later', `Terugbellen op ${korteDag(terugbel.dag)}${terugbel.uur ? ` om ${terugbel.uur}` : ''}.`);
        continue;
      }
      // Regel 3: uitgesteld tot een datum.
      const uitstel = mijnKeuzes.find((k) => k.soort === 'uitstellen' && k.totDag && k.totDag > vandaag);
      if (uitstel) {
        sluitUit('uitgesteld', `Uitgesteld tot ${korteDag(uitstel.totDag!)}.`);
        continue;
      }
      // Regel 4: enkel vandaag overgeslagen.
      if (mijnKeuzes.some((k) => k.soort === 'vandaag_overslaan' && k.voorDag === vandaag)) {
        sluitUit('vandaag_overgeslagen', 'Vandaag overgeslagen; morgen weer zichtbaar.');
        continue;
      }
      // Regel 5: afspraak vandaag met dit contact.
      if (afspraakVandaag.has(c.id)) {
        sluitUit('afspraak_vandaag', 'Je hebt vandaag een afspraak met dit contact.');
        continue;
      }
    }

    // ----- Score (§5.3), voor iedereen berekend zodat "Waarom?" altijd iets toont -----
    const fase = effectieveFase(c);
    const horizon = horizonCategorie(c.tijdshorizonBron);
    const ritme = inst.ritmeDagen[fase ?? 'koud'];
    const sindsDag = laatste ? dagVan(laatste.tijdstip) : c.aangemaaktInBronOp ? dagVan(c.aangemaaktInBronOp) : null;
    const dagenSinds = sindsDag ? dagenTussen(sindsDag, vandaag) : null;
    const verhouding = dagenSinds === null ? null : dagenSinds / ritme;

    const onderdelen: ScoreOnderdeel[] = [];
    const faseTekst = fase ? fase : 'fase onbekend (ritme koud)';
    if (verhouding !== null) {
      const punten = Math.min(Math.round(w.ritmePerVerhouding * verhouding), w.ritmeMax);
      onderdelen.push({
        label: `${laatste ? 'Laatste gesprek' : 'Binnengekomen'} ${dagenSinds} dagen geleden (ritme ${faseTekst}: ${ritme} dagen)`,
        punten,
      });
    } else {
      onderdelen.push({ label: 'Nog nooit gesproken en geen startdatum bekend', punten: w.ritmeMax });
    }
    if (fase === 'warm') onderdelen.push({ label: 'Fase warm', punten: w.faseWarm });
    if (fase === 'lauw') onderdelen.push({ label: 'Fase lauw', punten: w.faseLauw });
    if (horizon === 'kort') onderdelen.push({ label: `Wil verkopen ${HORIZON_LABEL.kort}`, punten: w.horizonKort });
    if (horizon === 'middel') onderdelen.push({ label: `Wil verkopen binnen ${HORIZON_LABEL.middel}`, punten: w.horizonMiddel });
    const vervolgstap = (invoer.opvolgacties ?? []).find((o) => o.contactId === c.id && o.soort === 'vervolgstap' && o.status === 'open' && o.dag <= vandaag);
    if (vervolgstap) onderdelen.push({ label: `Eigen vervolgstap gepland voor ${korteDag(vervolgstap.dag)}`, punten: w.eigenVervolgstap });
    const score = onderdelen.reduce((s, o) => s + o.punten, 0);

    // ----- Groep bepalen -----
    const isNieuweLead =
      c.statusBron === 'nieuwe_lead' && !laatste && (!c.aangemaaktInBronOp || dagenTussen(dagVan(c.aangemaaktInBronOp), vandaag) <= inst.nieuweLeadDagen);
    let groep: Groep | null = null;
    let reden = '';
    if (terugbel && terugbel.dag === vandaag && terugbel.uur) {
      groep = 'A';
      reden = `Terugbelafspraak vandaag om ${terugbel.uur}`;
    } else if (pin) {
      groep = 'pin';
      reden = 'Door jou vastgepind voor vandaag';
    } else if (isNieuweLead) {
      groep = 'B';
      const binnen = c.aangemaaktInBronOp ? relatief(dagVan(c.aangemaaktInBronOp), vandaag) : 'onlangs';
      reden = `Nieuwe lead (binnengekomen ${binnen}), nog niet bereikt${pogingen.length ? ` — ${pogingen.length} ${pogingen.length === 1 ? 'poging' : 'pogingen'} zonder antwoord` : ''}`;
    } else if (terugbel && terugbel.dag <= vandaag) {
      groep = 'C';
      const verstreken = werkdagenTussen(terugbel.dag, vandaag);
      reden =
        terugbel.dag === vandaag
          ? 'Terugbelafspraak vandaag'
          : `Terugbelafspraak was voor ${korteDag(terugbel.dag)} — ${verstreken} ${verstreken === 1 ? 'werkdag' : 'werkdagen'} verstreken`;
    } else if (!laatste && c.statusBron === 'nieuwe_lead') {
      // Een oudere lead die nooit bereikt werd, mag niet uit beeld verdwijnen.
      groep = 'D';
      reden = `Lead van ${dagenSinds ?? '?'} dagen geleden, nog nooit bereikt`;
    } else if (verhouding === null || verhouding >= 0.8) {
      groep = 'D';
      reden = laatste
        ? `Laatste gesprek ${dagenSinds} dagen geleden; ritme ${faseTekst} is ${ritme} dagen`
        : `Sinds binnenkomst ${dagenSinds ?? '?'} dagen geen gesprek`;
    }

    if (groep === null) {
      sluitUit(
        'nog_niet_aan_de_beurt',
        `${laatste ? 'Laatste gesprek' : 'Binnengekomen'} ${dagenSinds} dagen geleden; aan de beurt vanaf ${Math.ceil(ritme * 0.8)} dagen (ritme ${faseTekst}).`,
      );
      continue;
    }

    const kandidaat: Kandidaat = {
      contact: c,
      groep,
      score,
      onderdelen,
      reden,
      fase,
      horizon,
      laatste,
      ritmeVerhouding: verhouding,
      terugbel,
      pogingenZonderAntwoord: pogingen.length,
      isVastgepind: Boolean(pin),
    };

    // Regel 6: geen bruikbaar nummer → aparte actie.
    if (!heeftTelefoon(c)) {
      resultaat.nummerZoeken.push(kandidaat);
      continue;
    }

    // Regel 7 en herplanning na geen antwoord. Een terugbelafspraak (A/C) of vastpinnen gaat voor.
    if (pogingen.length > 0 && !pin && groep !== 'A' && groep !== 'C') {
      const max = inst.geenAntwoord.maxPogingenOpRij;
      if (pogingen.length >= max) {
        kandidaat.reden = `${pogingen.length} keer geen antwoord op rij — beslis zelf: pauze, sms/mail of opnieuw proberen`;
        resultaat.handmatigBeoordelen.push(kandidaat);
        continue;
      }
      const laatstePoging = dagVan(pogingen[0]!.tijdstip);
      const tussen = inst.geenAntwoord.werkdagenTussenPogingen;
      const wachtWerkdagen = tussen[Math.min(pogingen.length, tussen.length) - 1] ?? 1;
      const zelfdeDagOpnieuw = groep === 'B' && pogingen.length === 1 && laatstePoging === vandaag && inst.geenAntwoord.nieuweLeadZelfdeDagOpnieuw;
      const volgende = plusWerkdagen(laatstePoging, wachtWerkdagen);
      if (!zelfdeDagOpnieuw && volgende > vandaag) {
        sluitUit('wacht_na_geen_antwoord', `Geen antwoord op ${korteDag(laatstePoging)}; volgende poging ${korteDag(volgende)}.`);
        continue;
      }
    }

    if (pin) pinVolgorde.set(c.id, keuzes.indexOf(pin));
    kandidaten.push(kandidaat);
  }

  // ----- Volgorde -----
  const groepRang: Record<Groep, number> = { A: 0, pin: 1, B: 2, C: 3, D: 4 };
  const naam = (k: Kandidaat) => aanspreking(k.contact);
  kandidaten.sort((a, b) => {
    if (a.groep !== b.groep) return groepRang[a.groep] - groepRang[b.groep];
    switch (a.groep) {
      case 'A':
        return (a.terugbel!.uur ?? '').localeCompare(b.terugbel!.uur ?? '');
      case 'pin':
        return (pinVolgorde.get(a.contact.id) ?? 0) - (pinVolgorde.get(b.contact.id) ?? 0);
      case 'B':
        return (b.contact.aangemaaktInBronOp?.getTime() ?? 0) - (a.contact.aangemaaktInBronOp?.getTime() ?? 0) || naam(a).localeCompare(naam(b));
      case 'C':
        return a.terugbel!.dag.localeCompare(b.terugbel!.dag) || b.score - a.score;
      default:
        return b.score - a.score || (b.ritmeVerhouding ?? 99) - (a.ritmeVerhouding ?? 99) || naam(a).localeCompare(naam(b));
    }
  });

  // ----- Limiet: groep A altijd volledig, daarna tot het maximum -----
  const max = inst.maxPerDag;
  const groepA = kandidaten.filter((k) => k.groep === 'A');
  const rest = kandidaten.filter((k) => k.groep !== 'A');
  const plaats = Math.max(0, max - groepA.length);
  resultaat.vandaag = [...groepA, ...rest.slice(0, plaats)];
  resultaat.nietOpLijst = rest.slice(plaats);
  if (groepA.length > max) {
    resultaat.waarschuwingen.push(`Je hebt vandaag ${groepA.length} terugbelafspraken met een uur — meer dan je maximum van ${max}. Ze staan er allemaal op.`);
  }
  const pinsTeveel = resultaat.nietOpLijst.filter((k) => k.groep === 'pin').length;
  if (pinsTeveel > 0) resultaat.waarschuwingen.push(`${pinsTeveel} vastgepinde contacten passen niet meer in je maximum.`);

  return resultaat;
}

/** Korte samenvatting van wat niet op de lijst past, bv. "3 verstreken terugbelafspraken, 9 over ritme". */
export function samenvattingNietOpLijst(nietOpLijst: Kandidaat[]): string {
  const tel = (g: Groep) => nietOpLijst.filter((k) => k.groep === g).length;
  const delen = [
    tel('pin') && `${tel('pin')} vastgepind`,
    tel('B') && `${tel('B')} nieuwe ${tel('B') === 1 ? 'lead' : 'leads'}`,
    tel('C') && `${tel('C')} verstreken ${tel('C') === 1 ? 'terugbelafspraak' : 'terugbelafspraken'}`,
    tel('D') && `${tel('D')} over ritme`,
  ].filter(Boolean);
  return delen.join(', ');
}
