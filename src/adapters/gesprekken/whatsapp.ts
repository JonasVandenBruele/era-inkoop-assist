// WhatsApp (zakelijk nummer op de Mac) → Oxpecker. Pure functies; het lezen gebeurt in scripts/whatsapp-lezen.ts.
//
// Afspraken met Jonas (6/10/2026):
// - Enkel 1-op-1-chats met nummers die ook bij een ERAForce-contact staan. Groepen en andere chats worden niet gelezen.
// - Naar Supabase gaat per contact en per dag enkel DAT er WhatsApp-contact was en wie wat stuurde, nooit de inhoud.
// - Een dag waarop de klant iets stuurde, telt als inhoudelijk contact (ritme, geplande stap afgerond).
//   Enkel berichten van jou zonder reactie is geen gesprek.
// - De inhoud van de laatste berichten gaat enkel lokaal naar Claude, als context voor de hooks.
import { dagVan, type DagKey } from '../../core/dates';
import type { Aanspreekvorm, Taal, Telefoon } from '../../domain/model';

/** Core Data bewaart tijden als seconden sinds 1/1/2001. */
export const CORE_DATA_EPOCH = 978307200;

export function coreDataDatum(seconden: number): Date {
  return new Date((seconden + CORE_DATA_EPOCH) * 1000);
}

/** Belgisch nummer in de vorm die WhatsApp gebruikt: "32470123456". Null als het geen bruikbaar nummer is. */
export function waNummer(nummer: string): string | null {
  let d = nummer.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = `32${d.slice(1)}`;
  return /^\d{9,15}$/.test(d) ? d : null;
}

/** "32470123456@s.whatsapp.net" → "32470123456". Groepen (@g.us), kanalen en @lid-adressen geven null. */
export function nummerUitJid(jid: string | null | undefined): string | null {
  const m = /^(\d{9,15})@s\.whatsapp\.net$/.exec(jid ?? '');
  return m ? m[1]! : null;
}

/** Alle WhatsApp-nummers van een contact. */
export function nummersVan(telefoons: Telefoon[]): string[] {
  return [...new Set(telefoons.map((t) => waNummer(t.nummer)).filter((n): n is string => n !== null))];
}

export interface WaBericht {
  tijd: Date;
  vanMij: boolean;
  tekst: string | null;
}

export interface WaDag {
  dag: DagKey;
  vanMij: number;
  vanKlant: number;
  laatste: Date;
}

/** Berichten samenvatten per Brusselse dag, zonder inhoud. Nieuwste dag eerst. */
export function perDag(berichten: WaBericht[]): WaDag[] {
  const dagen = new Map<DagKey, WaDag>();
  for (const b of berichten) {
    const dag = dagVan(b.tijd);
    const d = dagen.get(dag) ?? { dag, vanMij: 0, vanKlant: 0, laatste: b.tijd };
    if (b.vanMij) d.vanMij++;
    else d.vanKlant++;
    if (b.tijd > d.laatste) d.laatste = b.tijd;
    dagen.set(dag, d);
  }
  return [...dagen.values()].sort((a, b) => b.dag.localeCompare(a.dag));
}

/** Tekst voor de bronactiviteit: enkel aantallen, nooit de inhoud. */
export function dagTekst(d: WaDag): string {
  const delen = [d.vanMij && `${d.vanMij} van jou`, d.vanKlant && `${d.vanKlant} van de klant`].filter(Boolean).join(', ');
  return `WhatsApp: ${delen}${d.vanKlant === 0 ? ' (nog geen reactie)' : ''}`;
}

const FR = /\b(bonjour|bonsoir|merci|vous|votre|est-ce|salut|nous|pour|avec|bonne|rappeler|maison)\b/gi;
const EN = /\b(hello|thanks|thank|you|your|please|the|and|call|house|regards|would)\b/gi;
const NL = /\b(dag|bedankt|jij|u|uw|het|een|de|en|niet|woning|huis|bellen|terugbellen|graag|groetjes|mvg|zou|even|kunnen|wanneer|ik|mij|ook|nog|ondertussen|bij|deze)\b/gi;
const tel = (t: string, re: RegExp) => (t.match(re) ?? []).length;

/** Taal van een gesprek: het meest voorkomende van Nederlands, Frans en Engels. Null bij te weinig tekst. */
export function detecteerTaal(teksten: (string | null)[]): Taal | null {
  const t = teksten.filter(Boolean).join(' ');
  const s = { nl: tel(t, NL), fr: tel(t, FR), en: tel(t, EN) };
  const [beste, n] = (Object.entries(s) as [Taal, number][]).sort((a, b) => b[1] - a[1])[0]!;
  return n >= 3 ? beste : null;
}

/** Hoe Jonas de klant aanspreekt in zijn eigen Nederlandstalige berichten: je of u. Null als het niet blijkt. */
export function aanspreekvormVan(eigenTeksten: (string | null)[]): Aanspreekvorm | null {
  const t = eigenTeksten.filter(Boolean).join(' ');
  const je = tel(t, /\b(je|jij|jou|jouw|jullie)\b/gi);
  const u = tel(t, /\b(u|uw)\b/gi);
  if (je === 0 && u === 0) return null;
  return u > je ? 'u' : 'je';
}

// ---------- Te beantwoorden (7/10/2026, toestemming Jonas: alle 1-op-1-chats op het zakelijke nummer) ----------

/** Wat een bericht zonder tekst is, volgens het berichttype in de WhatsApp-database. */
export function berichtSoortTekst(type: number): string {
  return { 1: '[foto]', 2: '[video]', 3: '[spraakbericht]', 4: '[contactkaart]', 5: '[locatie]', 8: '[document]', 14: '[verwijderd bericht]', 15: '[sticker]' }[type] ?? '[bijlage]';
}

/**
 * Is de chat open: schreef de klant het laatst, binnen `dagen` dagen? Dan geeft dit de klantberichten sinds jouw laatste
 * bericht (max. `max`, nieuwste laatst); anders null.
 */
export function openKlantberichten(berichten: WaBericht[], nu: Date, dagen = 14, max = 3): WaBericht[] | null {
  const laatste = berichten.at(-1);
  if (!laatste || laatste.vanMij || nu.getTime() - laatste.tijd.getTime() > dagen * 86400_000) return null;
  const vanaf = berichten.map((b) => b.vanMij).lastIndexOf(true) + 1;
  return berichten.slice(vanaf).slice(-max);
}
