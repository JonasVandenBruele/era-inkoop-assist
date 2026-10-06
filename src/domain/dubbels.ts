// Dubbele prospects (6/10/2026): in ERAForce staat dezelfde persoon soms twee keer, bv. één lead mét adres en
// opvolgtaak en één zonder adres. Oxpecker behandelt ze als één persoon: zelfde gsm-/telefoonnummer, zelfde
// e-mailadres of zelfde (genormaliseerd) adres. Pure functies.
import { adresSleutelVan } from './adres';
import type { Contact } from './model';

/** Een sleutel die door meer contacten gedeeld wordt (kantoornummer, algemeen mailadres), telt niet. */
const MAX_PER_SLEUTEL = 4;

/** "+32 490 19 19 59", "0032490191959", "0490/19.19.59" → "0490191959". */
export function normTelefoon(nummer: string): string {
  let d = nummer.replace(/\D/g, '');
  if (d.startsWith('0032')) d = `0${d.slice(4)}`;
  else if (d.startsWith('32') && d.length >= 10) d = `0${d.slice(2)}`;
  return d.length >= 9 ? d : '';
}

export type DubbelReden = 'telefoon' | 'e-mail' | 'adres';

function sleutelsVan(c: Contact): { sleutel: string; reden: DubbelReden }[] {
  const uit: { sleutel: string; reden: DubbelReden }[] = [];
  for (const t of c.telefoons) {
    const n = normTelefoon(t.nummer);
    if (n) uit.push({ sleutel: `t:${n}`, reden: 'telefoon' });
  }
  const mail = c.email?.trim().toLowerCase();
  if (mail && mail.includes('@')) uit.push({ sleutel: `m:${mail}`, reden: 'e-mail' });
  const adres = adresSleutelVan(c);
  if (adres) uit.push({ sleutel: `a:${adres}`, reden: 'adres' });
  return uit;
}

/** Per contact: alle contacten die dezelfde persoon zijn (ook zichzelf), via gedeelde telefoon, e-mail of adres. */
export function personen(contacten: Contact[]): Map<string, Contact[]> {
  const perSleutel = new Map<string, Contact[]>();
  for (const c of contacten) for (const { sleutel } of sleutelsVan(c)) perSleutel.set(sleutel, [...(perSleutel.get(sleutel) ?? []), c]);

  // Union-find over de gedeelde sleutels.
  const ouder = new Map(contacten.map((c) => [c.id, c.id]));
  const wortel = (id: string): string => {
    let x = id;
    while (ouder.get(x) !== x) x = ouder.get(x)!;
    ouder.set(id, x);
    return x;
  };
  for (const groep of perSleutel.values()) {
    if (groep.length < 2 || groep.length > MAX_PER_SLEUTEL) continue;
    for (const c of groep.slice(1)) ouder.set(wortel(c.id), wortel(groep[0]!.id));
  }
  const perWortel = new Map<string, Contact[]>();
  for (const c of contacten) perWortel.set(wortel(c.id), [...(perWortel.get(wortel(c.id)) ?? []), c]);
  const uit = new Map<string, Contact[]>();
  for (const groep of perWortel.values()) for (const c of groep) uit.set(c.id, groep);
  return uit;
}

/** Waarom twee contacten dezelfde persoon zijn (voor de contactpagina). */
export function dubbelReden(a: Contact, b: Contact): DubbelReden | null {
  const sa = new Map(sleutelsVan(a).map((x) => [x.sleutel, x.reden]));
  for (const { sleutel } of sleutelsVan(b)) if (sa.has(sleutel)) return sa.get(sleutel)!;
  return null;
}

/**
 * Eén persoon uit dubbele prospects: wat bij het eerste contact ontbreekt (adres, e-mail, aanspreekvorm, taal, …), komt
 * van de andere; telefoonnummers van alle. ID, status en herkomst blijven die van het eerste contact.
 */
export function samengevoegd(c: Contact, anderen: Contact[]): Contact {
  if (anderen.length === 0) return c;
  const metAdres = c.straat ? c : (anderen.find((x) => x.straat) ?? c);
  const telefoons = [...c.telefoons];
  for (const t of anderen.flatMap((x) => x.telefoons)) {
    if (!telefoons.some((y) => normTelefoon(y.nummer) === normTelefoon(t.nummer))) telefoons.push(t);
  }
  const eerste = <K extends keyof Contact>(k: K) => (c[k] ?? anderen.map((x) => x[k]).find((v) => v !== null && v !== undefined) ?? c[k]) as Contact[K];
  return {
    ...c,
    telefoons,
    email: eerste('email'),
    straat: metAdres.straat,
    postcode: metAdres.straat ? metAdres.postcode : eerste('postcode'),
    gemeente: metAdres.straat ? metAdres.gemeente : eerste('gemeente'),
    voornaam: eerste('voornaam'),
    aanhef: eerste('aanhef'),
    aanspreekvormBron: eerste('aanspreekvormBron'),
    faseBron: eerste('faseBron'),
    tijdshorizonBron: eerste('tijdshorizonBron'),
    taal: eerste('taal'),
    taalWhatsapp: eerste('taalWhatsapp'),
  };
}
