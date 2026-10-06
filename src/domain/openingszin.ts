// Openingszin: die van de hook van Claude als die er is, anders een standaardzin zonder AI.
// De standaardzin gebruikt enkel herleidbare feiten (groep, herkomst),
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

export function standaardOpeningszin({ kandidaat: k, voornaamGebruiker, organisatie, uur }: OpeningszinContext): string {
  const je = k.contact.aanspreekvormBron === 'je';
  const begin = `${groet(uur)} ${aanspreking(k, je)}, met ${voornaamGebruiker} van ${organisatie}.`;
  const uw = je ? 'je' : 'uw';
  const past = 'Past het even?';

  // De hook van Claude, als die er is: gemaakt uit de evaluaties en het nieuws, enkel aangeleverde feiten.
  if (k.hook?.openingszin) return k.hook.openingszin;
  // Geplande opvolging: geen algemene "we hadden afgesproken"-zin (Jonas, 6/10/2026). Het aanknopingspunt
  // (taakonderwerp en laatste gesprek) staat apart op de kaart; de opening blijft kort.
  if (k.terugbel && (k.groep === 'A' || k.groep === 'C')) {
    return `${begin} ${past}`;
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
