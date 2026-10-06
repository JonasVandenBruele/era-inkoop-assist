// De bellijst van vandaag: harde regels, voorrangsgroepen en een uitlegbare score (PLAN.md §5).
// Pure functie: alle gegevens, instellingen en "vandaag" komen binnen als parameter. De AI speelt hier geen rol.
import { dagVan, dagenTussen, korteDag, relatief, uurVan, type DagKey } from '../core/dates';
import type { Instellingen } from '../core/settings/schema';
import type { Afspraak, Belpoging, Belverbod, Bronactiviteit, Contact, Contacthook, Contactkanaal, ContactPand, Contactvoorkeur, Fase, Opvolgactie, Pand, Planningskeuze, Waardehaak } from './model';
import { hakenVoorContact, specifiekeHaken } from './haken';
import { KANAAL_LABEL, kanaaladvies, kanaalVan, type Kanaaladvies } from './kanaaladvies';
export type { Belverbod, Opvolgactie, Planningskeuze } from './model';
import { heeftTelefoon, laatsteInhoudelijkContact, type LaatsteContact } from './overzicht';
import { horizonCategorie, HORIZON_LABEL, type HorizonCategorie } from './horizon';
import { plusWerkdagen, werkdagenTussen } from './werkdagen';
import { isVeldwerk, prospectieblokkenOp, volgendProspectieblok } from './prospectieblokken';

// ---------- Invoer ----------

export interface BellijstInvoer {
  contacten: Contact[];
  activiteiten: Bronactiviteit[];
  belpogingen: Belpoging[];
  afspraken: Afspraak[];
  keuzes?: Planningskeuze[];
  opvolgacties?: Opvolgactie[];
  belverboden?: Belverbod[];
  // Contactstrategie (fase 3b)
  haken?: Waardehaak[];
  voorkeuren?: Contactvoorkeur[];
  panden?: Pand[];
  contactPanden?: ContactPand[];
  /** Hooks van Claude (gemaakt op de Mac na de mirror-run). */
  contacthooks?: Contacthook[];
  /** Brussels uur "HH:mm" van nu, voor de rustige uren in het kanaaladvies. */
  uur?: string;
  instellingen: Instellingen;
  vandaag: DagKey;
}

// ---------- Uitvoer ----------

export type Groep = 'A' | 'pin' | 'B' | 'C' | 'D';

export const GROEP_LABEL: Record<Groep, string> = {
  A: 'Gepland met uur',
  pin: 'Vastgepind',
  B: 'Nieuwe lead',
  C: 'Gepland',
  D: 'Aanvulling',
};

/** Blokken op de Vandaag-pagina ("timeline eerst", afgestemd met Jonas 3/10/2026). */
export const BLOK_VAN_GROEP: Record<Groep, 'gepland' | 'vastgepind' | 'leads' | 'aanvulling'> = {
  A: 'gepland',
  C: 'gepland',
  pin: 'vastgepind',
  B: 'leads',
  D: 'aanvulling',
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
  /** Gepland kanaal uit de ERAForce-taak (bv. bezoek bij "langsgaan met flyer"); null bij een lokale afspraak. */
  kanaal: Contactkanaal | null;
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
  /** Geldige waardehaken (incl. algemene). */
  haken: Waardehaak[];
  /** Hook van Claude voor vandaag (of de laatste werkdag ervoor), indien gemaakt. */
  hook: Contacthook | null;
  advies: Kanaaladvies;
  /** Bij langsgaan of een flyer: het Baanprospectie-blok van vandaag waarin het gepland is. */
  veldwerkBlok: Afspraak | null;
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
  /** Actieve prospects zonder geplande volgende stap (enkel geteld; Jonas werkt die af via zijn ERAForce-dashboard). */
  zonderTimeline: Contact[];
  /** Terugbeltaken in de bron die al lang verlopen zijn: niet op de daglijst, maar opruimen in ERAForce (oudste eerst). */
  achterstand: { contact: Contact; dag: DagKey; tekst: string | null }[];
  /** Langsgaan of flyer gepland, maar vandaag geen Baanprospectie-blok: wacht op het volgende blok (null = geen gepland). */
  langsgaanLater: { kandidaat: Kandidaat; blok: Afspraak | null }[];
}

// ---------- Hulpfuncties ----------

const actief = <T extends { ongedaanOp: Date | null }>(x: T) => x.ongedaanOp === null;

/** Effectieve fase. Fase 5 voegt hier correcties en goedgekeurde AI-inzichten aan toe (PLAN.md §3.5). */
export function effectieveFase(c: Contact): Fase | null {
  return c.faseBron;
}

/** Onbeantwoorde, niet-ongedane pogingen sinds het laatste inhoudelijke contact, nieuwste eerst. */
export function pogingenSindsContact(contactId: string, belpogingen: Belpoging[], laatste: LaatsteContact | null): Belpoging[] {
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
    kandidaten.push({ aangemaakt: a.gebeurdOp ?? a.geimporteerdOp, t: { dag: a.vervaltOp, uur: a.vervaltUur, tekst: a.tekst, herkomst: 'bron', kanaal: a.kanaal ?? 'bellen' } });
  }
  for (const o of invoer.opvolgacties ?? []) {
    if (o.contactId !== contactId || o.soort !== 'terugbellen' || o.status !== 'open') continue;
    kandidaten.push({ aangemaakt: o.aangemaaktOp, t: { dag: o.dag, uur: o.uur, tekst: o.omschrijving, herkomst: 'lokaal', kanaal: null } });
  }
  // Een bericht, flyer, brief of bezoek (niemand thuis) op of na de geplande dag rondt de stap ook af.
  // Ook een WhatsApp die je stuurde (gelezen van je Mac, zonder reactie) telt: die log je nergens.
  const gedaan = [
    ...invoer.belpogingen.filter((p) => p.contactId === contactId && !p.ongedaanOp && p.uitkomst === 'bericht_verstuurd').map((p) => dagVan(p.tijdstip)),
    ...invoer.activiteiten.filter((a) => a.contactId === contactId && a.bron === 'whatsapp' && a.gebeurdOp).map((a) => dagVan(a.gebeurdOp!)),
  ];
  const laatsteGedaan = gedaan.reduce<DagKey | null>((m, d) => (m && m > d ? m : d), null);
  const open = kandidaten.filter(({ t }) => !(laatste && dagVan(laatste.tijdstip) >= t.dag) && !(laatsteGedaan && laatsteGedaan >= t.dag));
  if (open.length === 0) return null;
  open.sort((a, b) => b.aangemaakt.getTime() - a.aangemaakt.getTime());
  return open[0]!.t;
}

/** De hook voor vandaag; anders de recentste van de laatste 4 dagen (bv. gemaakt vrijdagavond voor maandag). */
export function hookVanDeDag(contactId: string, hooks: Contacthook[], vandaag: DagKey): Contacthook | null {
  let beste: Contacthook | null = null;
  for (const h of hooks) {
    if (h.contactId !== contactId || h.dag > vandaag || dagenTussen(h.dag, vandaag) > 4) continue;
    if (!beste || h.dag > beste.dag) beste = h;
  }
  return beste;
}

function aanspreking(c: Contact): string {
  return [c.aanhef, c.voornaam, c.achternaam].filter(Boolean).join(' ');
}

/**
 * Vroegste dag voor een nieuwe poging na `aantalOpRij` keer geen antwoord, of null als de app
 * zelf geen poging meer plant (maximum bereikt → handmatig beoordelen).
 */
export function volgendePogingDag(aantalOpRij: number, laatstePogingDag: DagKey, inst: Instellingen): DagKey | null {
  if (aantalOpRij >= inst.geenAntwoord.maxPogingenOpRij) return null;
  const tussen = inst.geenAntwoord.werkdagenTussenPogingen;
  const wachtWerkdagen = tussen[Math.min(aantalOpRij, tussen.length) - 1] ?? 1;
  return plusWerkdagen(laatstePogingDag, wachtWerkdagen);
}

/** Bronnen die extra voorrang krijgen (afgestemd met Jonas, 3/10/2026). Geeft een leesbare naam of null. */
export function bronMetVoorrang(herkomst: string | null | undefined): string | null {
  if (!herkomst) return null;
  if (/realo|sellerlead/i.test(herkomst)) return 'Realo-sellerlead';
  if (/schatting|website/i.test(herkomst)) return 'schattingsaanvraag';
  if (/zelf|kantoor|belde/i.test(herkomst)) return 'nam zelf contact op';
  return null;
}

// ---------- Hoofdfunctie ----------

export function berekenBellijst(invoer: BellijstInvoer): Bellijst {
  const { instellingen: inst, vandaag } = invoer;
  const w = inst.gewichten;
  const keuzes = (invoer.keuzes ?? []).filter(actief);
  const verboden = new Set((invoer.belverboden ?? []).filter((b) => !b.ingetrokkenOp).map((b) => b.contactId));
  const afspraakVandaag = new Set(invoer.afspraken.filter((a) => a.contactId && dagVan(a.start) <= vandaag && vandaag <= dagVan(a.einde)).map((a) => a.contactId!));

  const resultaat: Bellijst = { vandaag: [], nietOpLijst: [], nummerZoeken: [], handmatigBeoordelen: [], uitgesloten: [], pinGeweigerd: [], waarschuwingen: [], zonderTimeline: [], achterstand: [], langsgaanLater: [] };
  const kandidaten: Kandidaat[] = [];
  const blokkenVandaag = prospectieblokkenOp(invoer.afspraken, vandaag, invoer.uur);
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

    // Beëindigde leads en relaties (geen prospect) komen enkel op de lijst met een terugbelafspraak of als je ze vastpint.
    if ((c.statusBron === 'beeindigd' || c.statusBron === 'relatie') && !pin && !(terugbel && terugbel.dag <= vandaag)) continue;

    // Een terugbeltaak uit de bron die al lang verlopen is, is achterstand: die verdringt de actuele beloftes niet.
    if (!pin && terugbel?.herkomst === 'bron' && terugbel.dag < vandaag && werkdagenTussen(terugbel.dag, vandaag) > inst.achterstandNaWerkdagen) {
      resultaat.achterstand.push({ contact: c, dag: terugbel.dag, tekst: terugbel.tekst });
      continue;
    }

    // Open taak met vervaldatum in de bron (bv. "Dossier vervolledigen" in ERAForce): ook dat is een geplande volgende stap.
    const bronStap = invoer.activiteiten
      .filter((a) => a.contactId === c.id && a.type === 'taak' && a.taakSoort !== 'terugbellen' && !a.taakAfgerond && a.vervaltOp && a.vervaltOp >= vandaag)
      .sort((x, y) => x.vervaltOp!.localeCompare(y.vervaltOp!))[0];
    const heeftTimeline =
      Boolean(terugbel) ||
      Boolean(bronStap) ||
      (invoer.opvolgacties ?? []).some((o) => o.contactId === c.id && o.status === 'open' && o.dag >= vandaag);
    if (!heeftTimeline && c.statusBron !== 'nieuwe_lead') resultaat.zonderTimeline.push(c);

    if (!pin) {
      // Regel 2: toekomstige expliciete terugbeldatum wordt gerespecteerd.
      if (terugbel && terugbel.dag > vandaag) {
        sluitUit('terugbel_later', `Terugbellen op ${korteDag(terugbel.dag)}${terugbel.uur ? ` om ${terugbel.uur}` : ''}.`);
        continue;
      }
      // Regel 2b: een geplande volgende stap in de toekomst is de afgesproken timeline.
      const geplandeStap = (invoer.opvolgacties ?? [])
        .filter((o) => o.contactId === c.id && o.soort === 'vervolgstap' && o.status === 'open' && o.dag > vandaag)
        .sort((x, y) => x.dag.localeCompare(y.dag))[0];
      if (geplandeStap) {
        sluitUit('terugbel_later', `Volgende stap gepland op ${korteDag(geplandeStap.dag)}${geplandeStap.omschrijving ? `: ${geplandeStap.omschrijving}` : ''}.`);
        continue;
      }
      if (bronStap && bronStap.vervaltOp! > vandaag) {
        sluitUit('terugbel_later', `Volgende stap in ERAForce op ${korteDag(bronStap.vervaltOp!)}: ${bronStap.tekst.split('\n')[0]}.`);
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
        label: `${laatste ? 'Laatste gesprek' : 'Binnengekomen'} ${dagenSinds} dagen geleden (ritme ${fase === 'warm' ? 'warm zonder timeline' : faseTekst}: ${ritme} dagen)`,
        punten,
      });
    } else {
      onderdelen.push({ label: 'Nog nooit gesproken en geen startdatum bekend', punten: w.ritmeMax });
    }
    if (fase === 'warm') onderdelen.push({ label: 'Fase warm', punten: w.faseWarm });
    if (fase === 'lauw') onderdelen.push({ label: 'Fase lauw', punten: w.faseLauw });
    if (horizon === 'kort') onderdelen.push({ label: `Wil verkopen ${HORIZON_LABEL.kort}`, punten: w.horizonKort });
    if (horizon === 'middel') onderdelen.push({ label: `Wil verkopen binnen ${HORIZON_LABEL.middel}`, punten: w.horizonMiddel });
    const haken = hakenVoorContact({
      contact: c,
      panden: invoer.panden ?? [],
      contactPanden: invoer.contactPanden ?? [],
      haken: invoer.haken ?? [],
      activiteiten: invoer.activiteiten,
      vandaag,
    });
    const specifiek = specifiekeHaken(haken);
    const hook = hookVanDeDag(c.id, invoer.contacthooks ?? [], vandaag);
    if (specifiek.length > 0) onderdelen.push({ label: `Hook: ${specifiek[0]!.onderwerp}`, punten: w.waardehaak });
    const bron = bronMetVoorrang(c.herkomstContact);
    if (bron) onderdelen.push({ label: `Bron: ${bron}`, punten: w.bron });
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
    } else if (terugbel && terugbel.dag <= vandaag) {
      // Een (vergeten) belofte gaat net vóór een nieuwe lead (afgestemd met Jonas, 3/10/2026).
      groep = 'C';
      const verstreken = werkdagenTussen(terugbel.dag, vandaag);
      const wat = !terugbel.kanaal || terugbel.kanaal === 'bellen' ? 'Terugbelafspraak' : `Geplande stap (${KANAAL_LABEL[terugbel.kanaal]})`;
      reden =
        terugbel.dag === vandaag ? `${wat} vandaag` : `${wat} was voor ${korteDag(terugbel.dag)} — ${verstreken} ${verstreken === 1 ? 'werkdag' : 'werkdagen'} verstreken`;
    } else if (isNieuweLead) {
      groep = 'B';
      const binnen = c.aangemaaktInBronOp ? relatief(dagVan(c.aangemaaktInBronOp), vandaag) : 'onlangs';
      reden = `Nieuwe lead (binnengekomen ${binnen}), nog niet bereikt${pogingen.length ? ` — ${pogingen.length} ${pogingen.length === 1 ? 'poging' : 'pogingen'} zonder antwoord` : ''}`;
    } else if (!laatste && c.statusBron === 'nieuwe_lead') {
      // Een oudere lead die nooit bereikt werd, mag niet uit beeld verdwijnen.
      groep = 'D';
      reden = `Lead van ${dagenSinds ?? '?'} dagen geleden, nog nooit bereikt`;
    } else if (verhouding === null || verhouding >= 0.8) {
      groep = 'D';
      reden =
        fase === 'warm'
          ? `Warm, maar geen opvolgtaak gepland (laatste gesprek ${dagenSinds ?? '?'} dagen geleden)`
          : laatste
            ? `Laatste gesprek ${dagenSinds} dagen geleden; ritme ${faseTekst} is ${ritme} dagen`
            : `Sinds binnenkomst ${dagenSinds ?? '?'} dagen geen gesprek`;
    } else if (specifiek.length > 0 && verhouding >= 0.5) {
      // Altijd aanwezig: een nuttige hook haalt een contact naar voren, maar niet vóór de helft van het ritme.
      groep = 'D';
      reden = `Hook: ${specifiek[0]!.onderwerp} (laatste gesprek ${dagenSinds} dagen geleden)`;
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
      haken,
      hook,
      advies: kanaaladvies({
        contact: c,
        pogingen,
        gepland: terugbel?.kanaal ?? null,
        hook,
        veldwerkMogelijk: blokkenVandaag.length > 0,
        voorkeur: (invoer.voorkeuren ?? []).find((v) => v.contactId === c.id) ?? null,
        haken,
        fase,
        instellingen: inst,
        dag: vandaag,
        uur: invoer.uur ?? '10:00',
      }),
      veldwerkBlok: null,
    };

    // Regel 5b: langsgaan of flyer enkel in een Baanprospectie-blok (Jonas, 6/10/2026). Geen nummer nodig.
    if (isVeldwerk(kandidaat.advies.kanaal)) {
      const blok = blokkenVandaag[0];
      if (!blok) {
        resultaat.langsgaanLater.push({ kandidaat, blok: volgendProspectieblok(invoer.afspraken, vandaag) });
        continue;
      }
      kandidaat.veldwerkBlok = blok;
      kandidaat.reden += ` — in je Baanprospectie-blok ${uurVan(blok.start)}–${uurVan(blok.einde)}`;
      kandidaten.push(kandidaat);
      continue;
    }

    // Regel 6: geen bruikbaar nummer → aparte actie.
    if (!heeftTelefoon(c)) {
      resultaat.nummerZoeken.push(kandidaat);
      continue;
    }

    // Regel 7 en herplanning na geen antwoord. Een terugbelafspraak (A/C) of vastpinnen gaat voor.
    if (pogingen.length > 0 && !pin && groep !== 'A' && groep !== 'C') {
      const oproepen = pogingen.filter((p) => kanaalVan(p) === 'telefoon').length;
      const berichten = pogingen.length - oproepen;
      if (oproepen >= inst.geenAntwoord.maxPogingenOpRij) {
        kandidaat.reden = `${oproepen} keer geen antwoord op rij${berichten ? ` (en ${berichten} bericht${berichten > 1 ? 'en' : ''})` : ''} — beslis zelf: pauze, ander kanaal of opnieuw proberen`;
        resultaat.handmatigBeoordelen.push(kandidaat);
        continue;
      }
      const laatste = pogingen[0]!;
      const laatstePoging = dagVan(laatste.tijdstip);
      const naBericht = kanaalVan(laatste) !== 'telefoon';
      const zelfdeDagOpnieuw =
        !naBericht && groep === 'B' && pogingen.length === 1 && laatstePoging === vandaag && inst.geenAntwoord.nieuweLeadZelfdeDagOpnieuw;
      const volgende = naBericht ? plusWerkdagen(laatstePoging, inst.contact.werkdagenNaBericht) : volgendePogingDag(oproepen, laatstePoging, inst)!;
      if (!zelfdeDagOpnieuw && volgende > vandaag) {
        sluitUit(
          'wacht_na_geen_antwoord',
          naBericht
            ? `Bericht gestuurd op ${korteDag(laatstePoging)}; even rust tot ${korteDag(volgende)}.`
            : `Geen antwoord op ${korteDag(laatstePoging)}; volgende poging ${korteDag(volgende)}.`,
        );
        continue;
      }
    }

    if (pin) pinVolgorde.set(c.id, keuzes.indexOf(pin));
    kandidaten.push(kandidaat);
  }

  // ----- Volgorde -----
  const groepRang: Record<Groep, number> = { A: 0, pin: 1, C: 2, B: 3, D: 4 };
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
  // Groep A en bezoeken in een Baanprospectie-blok (die nemen geen belplaats in) staan er altijd op.
  const groepA = kandidaten.filter((k) => k.groep === 'A' || k.veldwerkBlok);
  const rest = kandidaten.filter((k) => !groepA.includes(k));
  const plaats = Math.max(0, max - groepA.filter((k) => !k.veldwerkBlok).length);
  resultaat.achterstand.sort((a, b) => a.dag.localeCompare(b.dag));
  resultaat.vandaag = [...groepA, ...rest.slice(0, plaats)].sort((a, b) => groepRang[a.groep] - groepRang[b.groep]);
  resultaat.nietOpLijst = rest.slice(plaats);
  const metUur = groepA.filter((k) => k.groep === 'A').length;
  if (metUur > max) {
    resultaat.waarschuwingen.push(`Je hebt vandaag ${metUur} terugbelafspraken met een uur — meer dan je maximum van ${max}. Ze staan er allemaal op.`);
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
