// Voorgestelde berichtteksten (sms, WhatsApp, mail) zonder AI. Jonas past aan en verstuurt zelf.
// Enkel herleidbare feiten; geen persoonlijke of gevoelige hooks; geen "even checken". In de taal van de klant.
import type { Kandidaat } from './prioriteit';
import { haakZin } from './haken';
import { succesbericht } from './marktsignaal';
import { taalVan, zegtJe } from './model';

export interface BerichtContext {
  kandidaat: Kandidaat;
  kanaal: 'sms' | 'whatsapp' | 'mail';
  voornaamGebruiker: string;
  organisatie: string;
}

export interface Bericht {
  onderwerp: string | null;
  tekst: string;
}

export function berichtTekst({ kandidaat: k, kanaal, voornaamGebruiker, organisatie }: BerichtContext): Bericht {
  const c = k.contact;
  // Woning te koop gezet: een bericht met veel succes (hook van Claude als die erover gaat, anders de standaardtekst).
  if (k.signaal) {
    const hookOverSucces = k.hook?.conceptbericht && /succes|bonne chance|good luck|best of luck/i.test(k.hook.conceptbericht);
    return { onderwerp: kanaal === 'mail' ? 'Veel succes met de verkoop' : null, tekst: hookOverSucces ? k.hook!.conceptbericht! : succesbericht(c, k.signaal) };
  }
  // Conceptbericht van de hook van Claude, als die er is (Jonas past aan en verstuurt zelf).
  if (k.hook?.conceptbericht) return { onderwerp: kanaal === 'mail' ? k.hook.onderwerp : null, tekst: k.hook.conceptbericht };
  const taal = taalVan(c);
  const je = zegtJe(c);
  const voornaam = c.voornaam && !c.voornaam.includes('&') ? c.voornaam : null;
  const oproepen = k.pogingenZonderAntwoord;
  const nieuw = !k.terugbel && !k.laatste;
  const schatting = /schatting/i.test(c.herkomstContact ?? '');

  // In de stijl van Jonas (WhatsApp-analyse 6/10/2026): "Dag/Hi <voornaam>," kort, een hulpaanbod, "Mvg, Jonas van ERA".
  if (taal === 'fr') {
    const naam = voornaam ?? (c.aanhef === 'Mevr.' ? `Madame ${c.achternaam}` : c.aanhef === 'Dhr.' ? `Monsieur ${c.achternaam}` : c.achternaam);
    const aanleiding = nieuw ? (schatting ? 'Vous aviez demandé une estimation de votre bien.' : "Vous aviez montré de l'intérêt pour une estimation de votre bien.") : oproepen > 0 ? "J'ai essayé de vous joindre par téléphone." : 'Comment allez-vous ?';
    const tekst = `Bonjour ${naam}, ${aanleiding} Est-ce que je peux encore vous aider ? N'hésitez pas à me rappeler. Bav, ${voornaamGebruiker} de ${organisatie}`;
    return { onderwerp: kanaal === 'mail' ? (nieuw ? 'Votre demande d’estimation' : 'Suivi de votre projet') : null, tekst };
  }
  if (taal === 'en') {
    const naam = voornaam ?? (c.aanhef === 'Mevr.' ? `Ms ${c.achternaam}` : c.aanhef === 'Dhr.' ? `Mr ${c.achternaam}` : c.achternaam);
    const aanleiding = nieuw ? (schatting ? 'You had asked for a valuation of your property.' : 'You had shown interest in a valuation of your property.') : oproepen > 0 ? 'I tried to give you a call.' : 'Hope you are doing well!';
    const tekst = `Hi ${naam}, ${voornaamGebruiker} from ${organisatie} here. ${aanleiding} Is there anything I can help you with? Feel free to give me a call. Kind regards, ${voornaamGebruiker}`;
    return { onderwerp: kanaal === 'mail' ? (nieuw ? 'Your valuation request' : 'Follow-up') : null, tekst };
  }

  const naam = je && voornaam ? voornaam : c.aanhef === 'Mevr.' ? `mevrouw ${c.achternaam}` : c.aanhef === 'Dhr.' ? `meneer ${c.achternaam}` : `familie ${c.achternaam}`;
  const u = je ? 'je' : 'u';
  const U = je ? 'Je' : 'U';
  const uw = je ? 'je' : 'uw';
  const haak = k.haken.find((h) => h.soort !== 'persoonlijk' && !h.gevoelig);
  const haakTekst = haak ? haakZin(haak, je) : null;
  const aanleiding = nieuw ? (schatting ? `${U} had een schatting van ${uw} woning aangevraagd.` : `${U} had interesse getoond in een schatting van ${uw} eigendom.`) : '';
  const geprobeerd = oproepen > 0 ? `Ik probeerde ${u} ${oproepen === 1 ? 'eerder' : 'een paar keer'} te bellen.` : '';
  const vraag = je ? 'Kan ik nog ergens bij helpen? Geef me gerust een belletje.' : 'Kan ik u nog ergens bij helpen? Laat gerust iets weten.';
  const slot = `Mvg, ${voornaamGebruiker} van ${organisatie}`;

  if (kanaal === 'mail') {
    const onderwerp = haak ? haak.onderwerp : nieuw ? `${je ? 'Je' : 'Uw'} aanvraag voor een schatting` : `Opvolging — ${uw} woning`;
    const alinea = [aanleiding, geprobeerd].filter(Boolean).join(' ');
    const tekst = [`Dag ${naam},`, '', ...(alinea ? [alinea, ''] : []), ...(haakTekst ? [haakTekst, ''] : []), vraag, '', slot].join('\n');
    return { onderwerp, tekst };
  }
  const tekst = [`${je && voornaam ? 'Hi' : 'Dag'} ${naam}, ${voornaamGebruiker} van ${organisatie} hier.`, aanleiding, geprobeerd, haakTekst ?? '', vraag, slot].filter(Boolean).join(' ');
  return { onderwerp: null, tekst };
}

/** Link die de juiste app opent met de tekst al ingevuld. Jonas verstuurt zelf. */
export function berichtLink(kanaal: 'sms' | 'whatsapp' | 'mail', adres: string, bericht: Bericht, mailApp: 'outlook' | 'standaard' = 'outlook'): string {
  const t = encodeURIComponent(bericht.tekst);
  const onderwerp = encodeURIComponent(bericht.onderwerp ?? '');
  if (kanaal === 'mail' && mailApp === 'outlook') return `ms-outlook://compose?to=${encodeURIComponent(adres)}&subject=${onderwerp}&body=${t}`;
  if (kanaal === 'mail') return `mailto:${adres}?subject=${onderwerp}&body=${t}`;
  const nummer = adres.replace(/[^\d+]/g, '');
  if (kanaal === 'whatsapp') return `https://wa.me/${nummer.replace(/^\+/, '').replace(/^0/, '32')}?text=${t}`;
  return `sms:${nummer}&body=${t}`;
}
