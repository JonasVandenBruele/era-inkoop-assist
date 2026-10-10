// Voegt de brongegevens (alleen-lezen) en de eigen Oxpecker-records samen tot één werkbare toestand.
// Regel: een eigen record wint altijd van de bron (handmatige correcties worden nooit stil overschreven),
// en de bron wordt nooit gewijzigd.
import { dagVan, type DagKey } from '../../core/dates';
import type { Contact } from '../model';
import {
  STANDAARD_VERKOOP_INSTELLINGEN,
  type Afwijzing,
  type Bezoek,
  type Bod,
  type Campagne,
  type Contactactie,
  type Contactmoment,
  type Contactverbod,
  type Criterium,
  type Huishouden,
  type Inzicht,
  type Kandidaat,
  type KenmerkHerkomst,
  type Kenmerken,
  type KenmerkSleutel,
  type Kwalificatie,
  type Medewerker,
  type Notitie,
  type PrijsRegistratie,
  type VerkoopBasis,
  type VerkoopInstellingen,
  type VerkoopPand,
  type Vrijgave,
  type Zoekopdracht,
} from './model';
import { interpreteer, interpreteerBezoek } from './feedback';
import { huidigePrijs } from './prijs';

// ---------------------------------------------------------------- records (eigen gegevens)

export interface RecordData {
  kwalificatie: Kwalificatie;
  /** Beslissing over een criterium: bevestigen, aanpassen, verwerpen of toevoegen. */
  criterium: {
    zoekopdrachtId: string;
    criterium: Criterium;
    beslissing: 'bevestigd' | 'aangepast' | 'verworpen' | 'toegevoegd';
    door: string;
    op: DagKey;
  };
  zoekopdracht_status: { zoekopdrachtId: string; status: 'actief' | 'gesloten'; slotReden: string | null; door: string; op: DagKey };
  notitie: Notitie;
  /** Beslissing over een (voorgesteld) inzicht. */
  inzicht: { inzicht: Inzicht; door: string; op: DagKey };
  vrijgave: Vrijgave & { door: string; op: DagKey };
  kenmerk: { pandId: string; sleutel: KenmerkSleutel; waarde: Kenmerken[KenmerkSleutel]; herkomst: KenmerkHerkomst };
  prijs: PrijsRegistratie;
  prijsoordeel: { registratieId: string; oordeel: 'prijsdaling' | 'geen_prijsdaling'; door: string; op: DagKey };
  campagne: Campagne;
  actie: Contactactie;
  contactmoment: Contactmoment;
  afwijzing: Afwijzing;
  contactverbod: Contactverbod & { ingetrokken: boolean };
  instellingen: VerkoopInstellingen;
  /** Aanmelding voor de opvolging na aankoop (één keer per contact). */
  nazorg: { contactId: string; zoekopdrachtId: string | null; door: string; op: DagKey };
}
export type RecordSoort = keyof RecordData;

export interface OpgeslagenRecord<S extends RecordSoort = RecordSoort> {
  soort: S;
  id: string;
  data: RecordData[S];
  versie: number;
  bijgewerktOp: string;
  bijgewerktDoor: string | null;
}

/** Een gewenste schrijfactie. verwachteVersie null = enkel aanmaken als het record nog niet bestaat. */
export interface Wijziging<S extends RecordSoort = RecordSoort> {
  soort: S;
  id: string;
  data: RecordData[S];
  verwachteVersie: number | null;
}

export function wijziging<S extends RecordSoort>(staat: VerkoopStaat, soort: S, id: string, data: RecordData[S]): Wijziging<S> {
  return { soort, id, data, verwachteVersie: staat.versies.get(`${soort}/${id}`) ?? null };
}

// ---------------------------------------------------------------- toestand

export interface Tegenstrijdigheid {
  contactId: string;
  zoekopdrachtId: string | null;
  tekst: string;
}

export interface VerkoopStaat {
  basis: VerkoopBasis;
  nu: Date;
  vandaag: DagKey;
  instellingen: VerkoopInstellingen;
  medewerkers: Map<string, Medewerker>;
  kandidaten: Map<string, Kandidaat>;
  contacten: Map<string, Contact>;
  huishoudens: Map<string, Huishouden>;
  kwalificaties: Map<string, Kwalificatie>;
  zoekopdrachten: Zoekopdracht[];
  panden: Map<string, VerkoopPand>;
  prijzen: PrijsRegistratie[];
  prijsoordelen: Map<string, 'prijsdaling' | 'geen_prijsdaling'>;
  vrijgaven: Map<string, Vrijgave & { door?: string; op?: DagKey }>;
  bezoeken: Bezoek[];
  biedingen: Bod[];
  notities: Notitie[];
  inzichten: Inzicht[];
  contactverboden: Map<string, Contactverbod>;
  campagnes: Campagne[];
  acties: Contactactie[];
  contactmomenten: Contactmoment[];
  afwijzingen: Afwijzing[];
  nazorg: Map<string, RecordData['nazorg']>;
  tegenstrijdigheden: Tegenstrijdigheid[];
  /** Versie per record ("soort/id"), voor veilige gelijktijdige wijzigingen. */
  versies: Map<string, number>;
  /** Criteria die verworpen of opzij gezet werden door nieuwere expliciete informatie, met uitleg. */
  opzijGezet: Map<string, string>;
}

const LEEG_VRIJGAVE = (pandId: string): Vrijgave => ({
  pandId,
  internMatchen: null,
  contacteren: null,
  bezoeken: null,
  deelbaar: { gemeente: false, adres: false, vraagprijs: false, kenmerken: false },
  vraagprijs: null,
  instructies: null,
});

export function vrijgaveVan(staat: VerkoopStaat, pandId: string): Vrijgave {
  return staat.vrijgaven.get(pandId) ?? LEEG_VRIJGAVE(pandId);
}

function perSoort<S extends RecordSoort>(records: OpgeslagenRecord[], soort: S): OpgeslagenRecord<S>[] {
  return records.filter((r): r is OpgeslagenRecord<S> => r.soort === soort);
}

/** Vervangt elementen met hetzelfde id; voegt nieuwe toe. */
function overschrijf<T>(basis: T[], nieuw: T[], sleutel: (x: T) => string): T[] {
  const m = new Map(basis.map((x) => [sleutel(x), x]));
  for (const x of nieuw) m.set(sleutel(x), x);
  return [...m.values()];
}

export function bouwStaat(basis: VerkoopBasis, records: OpgeslagenRecord[], nu: Date): VerkoopStaat {
  const versies = new Map(records.map((r) => [`${r.soort}/${r.id}`, r.versie]));
  const instellingen = { ...STANDAARD_VERKOOP_INSTELLINGEN, ...(perSoort(records, 'instellingen')[0]?.data ?? {}) };

  // Kandidaten en kwalificaties
  const kwalificaties = new Map(basis.kwalificaties.map((k) => [k.contactId, k]));
  for (const r of perSoort(records, 'kwalificatie')) kwalificaties.set(r.id, r.data);

  // Panden met aanvullingen (eigen kenmerken winnen, met hun eigen herkomst)
  const panden = new Map(basis.panden.map((p) => [p.id, { ...p, kenmerken: { ...p.kenmerken }, herkomst: { ...p.herkomst } }]));
  for (const r of perSoort(records, 'kenmerk')) {
    const p = panden.get(r.data.pandId);
    if (!p) continue;
    (p.kenmerken as Record<string, unknown>)[r.data.sleutel] = r.data.waarde;
    p.herkomst[r.data.sleutel] = r.data.herkomst;
  }

  const prijzen = overschrijf(basis.prijzen, perSoort(records, 'prijs').map((r) => r.data), (p) => p.id);
  const prijsoordelen = new Map(perSoort(records, 'prijsoordeel').map((r) => [r.data.registratieId, r.data.oordeel]));
  const vrijgaven = new Map<string, Vrijgave & { door?: string; op?: DagKey }>(basis.vrijgaven.map((v) => [v.pandId, v]));
  for (const r of perSoort(records, 'vrijgave')) vrijgaven.set(r.id, r.data);

  // Notities: bron + nieuw in Oxpecker. Nieuwe notities worden één keer geïnterpreteerd (deterministisch, op id),
  // zodat onveranderde historiek niet steeds opnieuw geanalyseerd wordt.
  const nieuweNotities = perSoort(records, 'notitie').map((r) => r.data);
  const notities = overschrijf(basis.notities, nieuweNotities, (n) => n.id);
  const bekendeBronnen = new Set(basis.inzichten.map((i) => i.bronRef));
  const nieuweInzichten = [
    ...notities.filter((n) => !bekendeBronnen.has(n.id)).flatMap((n) => interpreteer(n)),
    ...basis.bezoeken.filter((b) => !bekendeBronnen.has(b.id)).flatMap((b) => interpreteerBezoek(b)),
  ];
  const beslissingen = perSoort(records, 'inzicht').map((r) => r.data.inzicht);
  const inzichten = overschrijf([...basis.inzichten, ...nieuweInzichten], beslissingen, (i) => i.id);

  const contactverboden = new Map(basis.contactverboden.map((c) => [c.contactId, c]));
  for (const r of perSoort(records, 'contactverbod')) {
    if (r.data.ingetrokken) contactverboden.delete(r.id);
    else contactverboden.set(r.id, r.data);
  }

  // Zoekopdrachten met criteriumbeslissingen
  const criteriumRecords = perSoort(records, 'criterium');
  const statusRecords = new Map(perSoort(records, 'zoekopdracht_status').map((r) => [r.data.zoekopdrachtId, r.data]));
  const opzijGezet = new Map<string, string>();
  const tegenstrijdigheden: Tegenstrijdigheid[] = [];
  const zoekopdrachten = basis.zoekopdrachten.map((z) => {
    let criteria = [...z.criteria];
    for (const r of criteriumRecords.filter((c) => c.data.zoekopdrachtId === z.id)) {
      const c = r.data.criterium;
      if (r.data.beslissing === 'verworpen') {
        criteria = criteria.map((x) => (x.id === c.id ? { ...x, status: 'verworpen' } : x));
      } else {
        criteria = overschrijf(criteria, [c], (x) => x.id);
      }
    }
    const s = statusRecords.get(z.id);
    const zo: Zoekopdracht = { ...z, criteria, status: s?.status ?? z.status, slotReden: s ? s.slotReden : z.slotReden };
    // Nieuwe expliciete informatie gaat voor op oude vermoedens; tegenspraak met een expliciete wens wordt zichtbaar.
    for (const inz of inzichten) {
      if (inz.contactId !== z.contactId || inz.soort !== 'geen_eis' || inz.status === 'verworpen') continue;
      for (const c of zo.criteria) {
        if (c.status !== 'actief' || c.sleutel !== inz.kenmerk || !('nodig' in c.waarde) || !c.waarde.nodig) continue;
        if (c.soort === 'vermoeden' && inz.dag >= c.bron.dag) {
          opzijGezet.set(c.id, `Opzij gezet: "${inz.citaat}" (${inz.dag}) is recenter en expliciet.`);
        } else if (c.soort === 'hard' || c.soort === 'voorkeur') {
          tegenstrijdigheden.push({
            contactId: z.contactId,
            zoekopdrachtId: z.id,
            tekst: `Zoekopdracht vraagt ${c.sleutel}, maar op ${inz.dag} zei de kandidaat: "${inz.citaat}". Bevestig welke klopt.`,
          });
        }
      }
    }
    zo.criteria = zo.criteria.map((c) => (opzijGezet.has(c.id) ? { ...c, status: 'verworpen' as const } : c));
    return zo;
  });

  const kandidaten = new Map(basis.kandidaten.map((k) => [k.contact.id, k]));
  return {
    basis,
    nu,
    vandaag: dagVan(nu),
    instellingen,
    medewerkers: new Map(basis.medewerkers.map((m) => [m.id, m])),
    kandidaten,
    contacten: new Map(basis.kandidaten.map((k) => [k.contact.id, k.contact])),
    huishoudens: new Map(basis.huishoudens.map((h) => [h.id, h])),
    kwalificaties,
    zoekopdrachten,
    panden,
    prijzen,
    prijsoordelen,
    vrijgaven,
    bezoeken: basis.bezoeken,
    biedingen: basis.biedingen,
    notities,
    inzichten,
    contactverboden,
    campagnes: overschrijf(basis.campagnes, perSoort(records, 'campagne').map((r) => r.data), (c) => c.id),
    acties: overschrijf(basis.acties, perSoort(records, 'actie').map((r) => r.data), (a) => a.id),
    contactmomenten: overschrijf(basis.contactmomenten, perSoort(records, 'contactmoment').map((r) => r.data), (c) => c.id),
    afwijzingen: overschrijf(basis.afwijzingen, perSoort(records, 'afwijzing').map((r) => r.data), (a) => a.id),
    nazorg: new Map(perSoort(records, 'nazorg').map((r) => [r.id, r.data])),
    tegenstrijdigheden,
    versies,
    opzijGezet,
  };
}

// ---------------------------------------------------------------- kleine opzoekingen

export function actieveZoekopdrachten(staat: VerkoopStaat, contactId: string): Zoekopdracht[] {
  return staat.zoekopdrachten.filter((z) => z.contactId === contactId && z.status === 'actief');
}

export function medewerkerNaam(staat: VerkoopStaat, id: string | null | undefined): string {
  if (!id) return 'niemand';
  return staat.medewerkers.get(id)?.voornaam ?? 'onbekende collega';
}

/** Leden van hetzelfde (uitdrukkelijk gekoppelde) huishouden, inclusief het contact zelf. */
export function huishoudenLeden(staat: VerkoopStaat, contactId: string): string[] {
  const h = staat.kandidaten.get(contactId)?.huishoudenId;
  return h ? (staat.huishoudens.get(h)?.contactIds ?? [contactId]) : [contactId];
}

/** Sleutel om acties per contact of gekoppeld huishouden te bundelen. */
export function contactSleutel(staat: VerkoopStaat, contactId: string): string {
  return staat.kandidaten.get(contactId)?.huishoudenId ?? contactId;
}

/** Laatste betekenisvolle contact (gesproken, bezoek, bod): geen belpoging zonder antwoord. */
export function laatsteContact(staat: VerkoopStaat, contactId: string): { dag: DagKey; wat: string } | null {
  const kandidaten: { dag: DagKey; wat: string }[] = [];
  for (const m of staat.contactmomenten) {
    if (m.contactId === contactId && m.uitkomst !== 'geen_antwoord' && m.uitkomst !== 'bericht_verstuurd') kandidaten.push({ dag: dagVan(new Date(m.op)), wat: 'gesprek' });
  }
  for (const b of staat.bezoeken) if (b.contactId === contactId) kandidaten.push({ dag: b.dag, wat: 'bezoek' });
  for (const b of staat.biedingen) if (b.contactId === contactId) kandidaten.push({ dag: b.dag, wat: 'bod' });
  for (const n of staat.notities) if (n.contactId === contactId && n.bron === 'gesprek') kandidaten.push({ dag: n.dag, wat: 'gesprek' });
  kandidaten.sort((a, b) => b.dag.localeCompare(a.dag));
  return kandidaten[0] ?? null;
}

/** De prijs waarmee gematcht wordt: de bevestigde vraagprijs, anders de laatste geregistreerde, anders de interne richtprijs. */
export function matchPrijs(staat: VerkoopStaat, pandId: string): { bedrag: number; soort: 'vraagprijs' | 'richtprijs'; deelbaar: boolean } | null {
  const v = vrijgaveVan(staat, pandId);
  const laatste = huidigeVraagprijs(staat, pandId);
  if (laatste !== null) return { bedrag: laatste, soort: 'vraagprijs', deelbaar: v.deelbaar.vraagprijs };
  if (v.vraagprijs !== null) return { bedrag: v.vraagprijs, soort: 'vraagprijs', deelbaar: v.deelbaar.vraagprijs };
  const p = staat.panden.get(pandId);
  if (p?.richtprijsIntern) return { bedrag: p.richtprijsIntern, soort: 'richtprijs', deelbaar: false };
  return null;
}

export function huidigeVraagprijs(staat: VerkoopStaat, pandId: string): number | null {
  return huidigePrijs(staat.prijzen, staat.prijsoordelen, pandId);
}
