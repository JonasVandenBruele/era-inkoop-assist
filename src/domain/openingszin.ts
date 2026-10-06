// Openingszin: die van de hook van Claude als die er is, anders een standaardzin zonder AI,
// in de taal van de klant (Nederlands, Frans of Engels) en met je, tenzij Jonas deze klant met u aanspreekt.
// De standaardzin gebruikt enkel herleidbare feiten (groep, herkomst),
// nooit vrije notitietekst — zo komt er geen gevoelige persoonlijke aanleiding of verzonnen voorgeschiedenis in.
import type { Kandidaat } from './prioriteit';
import { haakZin } from './haken';
import { taalVan, zegtJe, type Taal } from './model';

export interface OpeningszinContext {
  kandidaat: Kandidaat;
  voornaamGebruiker: string;
  organisatie: string;
  /** Uur in Brussel (0–23), voor goeiemorgen/-middag/-avond. */
  uur: number;
  vandaag: string;
}

function groet(uur: number, taal: Taal): string {
  if (taal === 'fr') return uur < 18 ? 'Bonjour' : 'Bonsoir';
  if (taal === 'en') return 'Hi';
  if (uur < 12) return 'Goeiemorgen';
  if (uur < 18) return 'Goeiemiddag';
  return 'Goeieavond';
}

/** Voornaam bij je-vorm (Jonas' standaard), anders meneer/mevrouw + achternaam, in de taal van de klant. */
function aanspreking(k: Kandidaat, je: boolean, taal: Taal): string {
  const c = k.contact;
  if ((je || taal !== 'nl') && c.voornaam && !c.voornaam.includes('&')) return c.voornaam;
  const titel = {
    nl: { 'Mevr.': 'mevrouw', 'Dhr.': 'meneer', anders: 'familie' },
    fr: { 'Mevr.': 'Madame', 'Dhr.': 'Monsieur', anders: 'famille' },
    en: { 'Mevr.': 'Ms', 'Dhr.': 'Mr', anders: 'the' },
  }[taal];
  const t = c.aanhef === 'Mevr.' || c.aanhef === 'Dhr.' ? titel[c.aanhef] : titel.anders;
  return taal === 'en' && t === 'the' ? `${c.achternaam} family` : `${t} ${c.achternaam}`;
}

export function standaardOpeningszin({ kandidaat: k, voornaamGebruiker, organisatie, uur }: OpeningszinContext): string {
  // De hook van Claude, als die er is: gemaakt uit de evaluaties en het nieuws, enkel aangeleverde feiten.
  if (k.hook?.openingszin) return k.hook.openingszin;
  const taal = taalVan(k.contact);
  const je = zegtJe(k.contact);
  const naam = aanspreking(k, je, taal);
  const herkomst = k.contact.herkomstContact ?? '';
  const nieuw = k.groep === 'B' || !k.laatste;
  // Geplande opvolging: geen algemene "we hadden afgesproken"-zin (Jonas, 6/10/2026). Het aanknopingspunt
  // (taakonderwerp en laatste gesprek) staat apart op de kaart; de opening blijft kort.
  const gepland = Boolean(k.terugbel && (k.groep === 'A' || k.groep === 'C'));

  if (taal === 'fr') {
    const begin = `${groet(uur, taal)} ${naam}, c'est ${voornaamGebruiker} de ${organisatie}.`;
    const past = 'Vous avez un petit moment ?';
    if (gepland) return `${begin} ${past}`;
    if (nieuw) return /schatting/i.test(herkomst) ? `${begin} Vous aviez demandé une estimation de votre bien. ${past}` : `${begin} Vous aviez montré de l'intérêt pour une estimation de votre bien. ${past}`;
    return `${begin} Je vous appelle pour savoir où en sont vos projets de vente. ${past}`;
  }
  if (taal === 'en') {
    const begin = `${groet(uur, taal)} ${naam}, this is ${voornaamGebruiker} from ${organisatie}.`;
    const past = 'Do you have a moment?';
    if (gepland) return `${begin} ${past}`;
    if (nieuw) return /schatting/i.test(herkomst) ? `${begin} You had asked for a valuation of your property. ${past}` : `${begin} You had shown interest in a valuation of your property. ${past}`;
    return `${begin} I'm calling to see how your plans to sell are coming along. ${past}`;
  }

  const begin = `${groet(uur, taal)} ${naam}, met ${voornaamGebruiker} van ${organisatie}.`;
  const uw = je ? 'je' : 'uw';
  const past = 'Past het even?';
  if (gepland) return `${begin} ${past}`;
  if (nieuw) {
    if (/schatting/i.test(herkomst)) return `${begin} ${je ? 'Je' : 'U'} had een schatting van ${uw} woning aangevraagd. ${past}`;
    if (/open huis/i.test(herkomst)) return `${begin} We hebben elkaar gesproken op het open huis. ${past}`;
    if (/notaris/i.test(herkomst)) return `${begin} Ik kreeg ${uw} gegevens via de notaris. ${past}`;
    return `${begin} ${je ? 'Je' : 'U'} had interesse getoond om ${uw} eigendom te laten schatten. ${past}`;
  }
  // Ossenpikker: liefst met een nuttige hook (nooit persoonlijk of gevoelig); anders een neutrale vraag.
  const haak = (k.haken ?? []).find((h) => h.soort !== 'persoonlijk' && !h.gevoelig);
  const zin = haak ? haakZin(haak, je) : null;
  if (zin) return `${begin} ${zin} ${past}`;
  return `${begin} Ik bel even om te horen hoe het met ${uw} verkoopplannen staat. ${past}`;
}
