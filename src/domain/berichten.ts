// Voorgestelde berichtteksten (sms, WhatsApp, mail) zonder AI. Jonas past aan en verstuurt zelf.
// Enkel herleidbare feiten; geen persoonlijke of gevoelige haken; geen "even checken".
import type { Kandidaat } from './prioriteit';
import { haakZin } from './haken';
import { succesbericht } from './marktsignaal';

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
  const je = c.aanspreekvormBron === 'je';
  const naam = je && c.voornaam && !c.voornaam.includes('&') ? c.voornaam : c.aanhef === 'Mevr.' ? `mevrouw ${c.achternaam}` : c.aanhef === 'Dhr.' ? `meneer ${c.achternaam}` : `familie ${c.achternaam}`;
  const u = je ? 'je' : 'u';
  const U = je ? 'Je' : 'U';
  const uw = je ? 'je' : 'uw';

  const haak = k.haken.find((h) => h.soort !== 'persoonlijk' && !h.gevoelig);
  const haakTekst = haak ? haakZin(haak, je) : null;
  const oproepen = k.pogingenZonderAntwoord;

  let aanleiding: string;
  if (k.terugbel) aanleiding = `Zoals afgesproken neem ik contact met ${je ? 'je' : 'u'} op.`;
  else if (!k.laatste) {
    const herkomst = c.herkomstContact ?? '';
    aanleiding = /schatting/i.test(herkomst) ? `${U} had een schatting van ${uw} woning aangevraagd.` : `${U} had interesse getoond in een schatting van ${uw} eigendom.`;
  } else aanleiding = '';
  const geprobeerd = oproepen > 0 ? `Ik probeerde ${u} ${oproepen === 1 ? 'eerder' : 'een paar keer'} te bellen.` : '';

  const vraag = je
    ? 'Past een kort telefoontje deze week? Laat gerust weten wanneer het je uitkomt.'
    : 'Past een kort telefoontje deze week? Laat gerust weten wanneer het u schikt.';

  if (kanaal === 'mail') {
    const onderwerp = haak ? haak.onderwerp : !k.laatste ? `${je ? 'Je' : 'Uw'} aanvraag voor een schatting` : `Opvolging — ${uw} woning`;
    const alinea1 = [aanleiding, geprobeerd].filter(Boolean).join(' ');
    const tekst = [
      `${je ? 'Dag' : 'Beste'} ${naam},`,
      '',
      ...(alinea1 ? [alinea1, ''] : []),
      ...(haakTekst ? [haakTekst, ''] : []),
      `${je ? 'Heb je' : 'Heeft u'} zin in een kort gesprek? ${je ? 'Laat gerust weten wanneer het je past.' : 'Laat gerust weten wanneer het u schikt.'}`,
      '',
      je ? 'Groetjes,' : 'Met vriendelijke groet,',
      voornaamGebruiker,
      organisatie,
    ].join('\n');
    return { onderwerp, tekst };
  }

  const groet = je ? `Dag ${naam}` : `Goeiedag ${naam}`;
  const tekst = [`${groet}, met ${voornaamGebruiker} van ${organisatie}.`, aanleiding, geprobeerd, haakTekst ?? '', vraag, je ? `Groetjes, ${voornaamGebruiker}` : `Vriendelijke groet, ${voornaamGebruiker}`]
    .filter(Boolean)
    .join(' ');
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
