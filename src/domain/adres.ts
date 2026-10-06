// Adressen normaliseren (6/10/2026): één pand = één sleutel, hoe het adres ook geschreven is.
//
// "molenstraat 90, 3078 Everberg", "Molenstr 90, 3078 Everberg" en "Molenstraat 90, 3078 Kortenberg" zijn hetzelfde.
// De POSTCODE is altijd doorslaggevend: de gemeentenaam (deelgemeente of hoofdgemeente) telt niet mee in de sleutel.
// Dezelfde regels als ERA Scout (PROJECT2, app.norm_street), aangevuld met Franse afkortingen en zonder spaties,
// zodat "Sint-Jansstraat", "St. Jansstraat" en "Sint Jans straat" samenvallen. Pure functies, geen netwerk:
// de officiële straatnaam uit het Adressenregister komt (optioneel) van scripts/adresregister.ts.

export interface AdresDelen {
  straat: string | null;
  nummer: string | null;
  bus: string | null;
  postcode: string | null;
}

/** Kleine letters, zonder accenten en leestekens, enkele spaties. */
export function normTekst(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Afkortingen als apart woord (na normTekst).
const WOORDEN: Record<string, string> = {
  st: 'sint',
  s: 'sint',
  stwg: 'steenweg',
  stw: 'steenweg',
  stwy: 'steenweg',
  str: 'straat',
  ln: 'laan',
  pl: 'plein',
  dr: 'dreef',
  olv: 'onze lieve vrouw',
  av: 'avenue',
  ave: 'avenue',
  bd: 'boulevard',
  bld: 'boulevard',
  bvd: 'boulevard',
  ch: 'chaussee',
  chee: 'chaussee',
  chauss: 'chaussee',
  sq: 'square',
  ste: 'sainte',
};

/**
 * Straatnaam als vergelijkbare sleutel: afkortingen voluit ("Molenstr." → molenstraat, "Brusselsestwg" →
 * brusselsesteenweg, "St.-Jansstraat" → sintjansstraat) en zonder spaties.
 */
export function normStraat(s: string | null | undefined): string {
  const woorden = normTekst(s)
    .replace(/\bo l v\b/g, 'olv')
    .split(' ')
    .filter(Boolean)
    .map((w) => WOORDEN[w] ?? w)
    // Afkorting vast aan de naam: "molenstr" → "molenstraat", "brusselsestwg" → "brusselsesteenweg".
    .map((w) => w.replace(/(?:stwg|steenwg)$/, 'steenweg').replace(/(?<=[a-z]{3})str$/, 'straat').replace(/(?<=[a-z]{3})ln$/, 'laan'));
  return woorden.join('');
}

/** Huisnummer: "90", "90 A" → "90a", "90-92" blijft. Leeg → "". */
export function normNummer(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9/-]/g, '');
}

/** Bus: "bus 0.1", "b1", "Bte 01", "box 1" → "1"; "B" (unit B) → "b"; "0" blijft "0"; leeg → "". */
export function normBus(s: string | null | undefined): string {
  const t = (s ?? '').toLowerCase().trim();
  if (!t) return '';
  const zonder = t.replace(/^(bus|bte|boite|boîte|box)\b\.?/, '').replace(/^b(?=\s*\.?\s*\d)\.?/, '');
  const kaal = zonder.replace(/[^a-z0-9]/g, '');
  if (!kaal) return '';
  const zonderNullen = kaal.replace(/^0+/, '');
  return zonderNullen || '0';
}

/** Postcode: enkel de cijfers ("B-3078" → "3078"). */
export function normPostcode(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '');
}

/**
 * Splitst "Kerkstraat 33", "Molenstr. 90 bus 2", "Rue Haute 12/3", "Lindenlaan 14B" in straat, nummer en bus.
 * Zonder herkenbaar huisnummer komt alles in `straat`.
 */
export function splitsStraatregel(regel: string | null | undefined): { straat: string | null; nummer: string | null; bus: string | null } {
  const t = (regel ?? '').replace(/\s+/g, ' ').trim().replace(/,$/, '');
  if (!t) return { straat: null, nummer: null, bus: null };
  const m = /^(.*?\D)[\s,]*(\d+(?:\s?[a-zA-Z](?![a-zA-Z]))?(?:-\d+)?)(?:\s*(?:\/|,)?\s*(?:(?:bus|bte|box|b)\.?\s*)?([0-9a-zA-Z.]+))?\s*$/i.exec(t);
  if (!m || !m[1]!.trim()) return { straat: t, nummer: null, bus: null };
  const busDeel = m[3] ?? null;
  // Een los woord na het nummer is enkel een bus als er "/", "bus" of cijfers in zitten (anders hoort het bij de straat).
  const metBus = busDeel && (/\d/.test(busDeel) || /(\/|bus|bte|box)\s*[0-9a-z.]+$/i.test(t));
  return {
    straat: m[1]!.replace(/[\s,]+$/, '').trim(),
    nummer: m[2]!.replace(/\s+/g, ''),
    bus: metBus ? busDeel : null,
  };
}

/** De sleutel van één woning of unit: straat|nummer|bus|postcode. Leeg ("") zonder straat, nummer of postcode. */
export function adresSleutel(a: AdresDelen): string {
  const straat = normStraat(a.straat);
  const nummer = normNummer(a.nummer);
  const postcode = normPostcode(a.postcode);
  if (!straat || !nummer || postcode.length !== 4) return '';
  return `${straat}|${nummer}|${normBus(a.bus)}|${postcode}`;
}

/** Hetzelfde gebouw (zonder bus): straat|nummer|postcode. */
export function gebouwSleutel(a: AdresDelen): string {
  const k = adresSleutel(a);
  if (!k) return '';
  const [straat, nummer, , postcode] = k.split('|');
  return `${straat}|${nummer}|${postcode}`;
}

/** Sleutel van een contact zoals Oxpecker het bewaart: één straatregel ("Kerkstraat 33 bus 2") plus postcode. */
export function adresSleutelVan(c: { straat: string | null; postcode: string | null }): string {
  return adresSleutel({ ...splitsStraatregel(c.straat), postcode: c.postcode });
}

export type Overeenkomst = 'adres' | 'gebouw' | null;

/**
 * Gaat het om dezelfde woning? 'adres' = zelfde straat, nummer, bus en postcode (of bij een van beide geen bus);
 * 'gebouw' = zelfde straat, nummer en postcode maar een andere bus (appartementen); null = ander pand.
 * Een ontbrekende bus aan één kant telt als hetzelfde adres: bij een huis is er geen bus, en bij een appartement
 * vult niet iedereen ze in.
 */
export function vergelijkAdres(a: AdresDelen, b: AdresDelen): Overeenkomst {
  const ka = adresSleutel(a);
  const kb = adresSleutel(b);
  if (!ka || !kb) return null;
  if (ka === kb) return 'adres';
  if (gebouwSleutel(a) !== gebouwSleutel(b)) return null;
  const ba = normBus(a.bus);
  const bb = normBus(b.bus);
  return !ba || !bb ? 'adres' : 'gebouw';
}

/** Leesbaar adres voor de app: "Kerkstraat 33 bus 2, 3070 Kortenberg". */
export function adresTekst(a: AdresDelen & { gemeente?: string | null }): string {
  const straat = [a.straat, a.nummer, a.bus ? `bus ${a.bus}` : null].filter(Boolean).join(' ');
  const plaats = [a.postcode, a.gemeente].filter(Boolean).join(' ');
  return [straat, plaats].filter(Boolean).join(', ');
}

/**
 * Officiële straatnaam (Adressenregister) voor een geschreven straatnaam, binnen de straten van de gemeente van de
 * postcode. Eerst exact na normalisatie ("Molenstr." → Molenstraat), dan afkortingen per woord
 * ("Lod. van Veltemstraat" → Lodewijk van Veltemstraat): zelfde aantal woorden, laatste woord gelijk, de andere
 * woorden een begin van het officiële woord. Enkel bij precies één kandidaat; anders null.
 */
export function officieleStraat(straat: string | null | undefined, officieel: readonly string[]): string | null {
  const n = normStraat(straat);
  if (!n) return null;
  const exact = officieel.filter((o) => normStraat(o) === n);
  if (exact.length >= 1) return exact[0]!;
  const woorden = (s: string) => normTekst(s).split(' ').filter(Boolean).map((w) => WOORDEN[w] ?? w);
  const w = woorden(straat!);
  if (w.length < 2) return null;
  const kandidaten = officieel.filter((o) => {
    const ow = woorden(o);
    if (ow.length !== w.length) return false;
    if (normStraat(ow.at(-1)) !== normStraat(w.at(-1))) return false;
    return w.slice(0, -1).every((x, i) => ow[i]!.startsWith(x));
  });
  return kandidaten.length === 1 ? kandidaten[0]! : null;
}
