// Standaard-openingszin zonder AI. Gebruikt enkel herleidbare feiten (groep, herkomst, terugbelafspraak),
// nooit vrije notitietekst — zo komt er geen gevoelige persoonlijke aanleiding of verzonnen voorgeschiedenis in.
import type { Kandidaat } from './prioriteit';
import { haakZin } from './haken';

export interface OpeningszinContext {
  kandidaat: Kandidaat;
  voornaamGebruiker: string;
  organisatie: string;
  /** Uur in Brussel (0–23), voor goeiemorgen/-middag/-avond. */
  uur: number;
  vandaag: string;
}

function groet(uur: number): string {
  if (uur < 12) return 'Goeiemorgen';
  if (uur < 18) return 'Goeiemiddag';
  return 'Goeieavond';
}

function aanspreking(k: Kandidaat, je: boolean): string {
  const c = k.contact;
  if (je && c.voornaam && !c.voornaam.includes('&')) return c.voornaam;
  if (c.aanhef === 'Mevr.') return `mevrouw ${c.achternaam}`;
  if (c.aanhef === 'Dhr.') return `meneer ${c.achternaam}`;
  return `familie ${c.achternaam}`;
}

export function standaardOpeningszin({ kandidaat: k, voornaamGebruiker, organisatie, uur, vandaag }: OpeningszinContext): string {
  const je = k.contact.aanspreekvormBron === 'je';
  const begin = `${groet(uur)} ${aanspreking(k, je)}, met ${voornaamGebruiker} van ${organisatie}.`;
  const u = je ? 'je' : 'u';
  const uw = je ? 'je' : 'uw';
  const past = 'Past het even?';

  if (k.terugbel && (k.groep === 'A' || k.groep === 'C')) {
    return `${begin} We hadden afgesproken dat ik ${u}${k.terugbel.dag === vandaag ? ' vandaag' : ''} zou terugbellen. ${past}`;
  }
  if (k.groep === 'B' || !k.laatste) {
    const herkomst = k.contact.herkomstContact ?? '';
    if (/schatting/i.test(herkomst)) return `${begin} ${je ? 'Je' : 'U'} had een schatting van ${uw} woning aangevraagd. ${past}`;
    if (/open huis/i.test(herkomst)) return `${begin} We hebben elkaar gesproken op het open huis. ${past}`;
    if (/notaris/i.test(herkomst)) return `${begin} Ik kreeg ${uw} gegevens via de notaris. ${past}`;
    return `${begin} ${je ? 'Je' : 'U'} had interesse getoond om ${uw} eigendom te laten schatten. ${past}`;
  }
  // Ossenpikker: liefst met een nuttig haakje (nooit persoonlijk of gevoelig); anders een neutrale vraag.
  const haak = (k.haken ?? []).find((h) => h.soort !== 'persoonlijk' && !h.gevoelig);
  const zin = haak ? haakZin(haak, je) : null;
  if (zin) return `${begin} ${zin} ${past}`;
  return `${begin} Ik bel even om te horen hoe het met ${uw} verkoopplannen staat. ${past}`;
}
