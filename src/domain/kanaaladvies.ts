// Kanaaladvies (PLAN.md §7b.1): bellen, berichtje of mail. Altijd aanwezig, nooit opdringerig.
import { parseISO, getDay } from 'date-fns';
import type { Instellingen } from '../core/settings/schema';
import type { Belpoging, Contact, Contacthook, Contactkanaal, Contactvoorkeur, Fase, Waardehaak } from './model';
import { heeftTelefoon } from './overzicht';

/** Bellen, berichtje (sms), WhatsApp, mail, flyer in de bus, brief of langsgaan. */
export type AdviesKanaal = Contactkanaal;

export const KANAAL_LABEL: Record<AdviesKanaal, string> = {
  bellen: 'bellen',
  bericht: 'berichtje',
  whatsapp: 'WhatsApp',
  mail: 'mail',
  flyer: 'flyer in de bus',
  brief: 'brief',
  bezoek: 'langsgaan',
};

export const KANAAL_ICOON: Record<AdviesKanaal, string> = {
  bellen: '📞',
  bericht: '💬',
  whatsapp: '🟢',
  mail: '✉️',
  flyer: '📬',
  brief: '✉️',
  bezoek: '🚪',
};

export interface Kanaaladvies {
  kanaal: AdviesKanaal;
  reden: string;
  /** Aanvullende opmerking, bv. "verstuur na 9u" of "bel niet vóór 17u". */
  opmerking: string | null;
}

export interface AdviesInvoer {
  contact: Contact;
  /** Onbeantwoorde pogingen sinds het laatste inhoudelijke contact, nieuwste eerst. */
  pogingen: Belpoging[];
  voorkeur: Contactvoorkeur | null;
  /** Gepland kanaal uit de ERAForce-taak die vandaag aan de beurt is. */
  gepland?: Contactkanaal | null;
  /** Hook van Claude, met een voorgesteld kanaal en de reden. */
  hook?: Contacthook | null;
  /** Is er vandaag een Baanprospectie-blok? Zonder blok stelt de hook geen langsgaan of flyer voor. */
  veldwerkMogelijk?: boolean;
  haken: Waardehaak[];
  fase: Fase | null;
  instellingen: Instellingen;
  /** Brusselse dag en uur ("HH:mm") van nu, voor de rustige uren. */
  dag: string;
  uur: string;
}

const isGsm = (c: Contact) => c.telefoons.some((t) => t.label === 'gsm' || /^\+?32\s?4|^04/.test(t.nummer.replace(/\s/g, '')));

export function kanaalVan(p: Belpoging): Belpoging['kanaal'] {
  return p.kanaal ?? 'telefoon';
}

/** Mag er nu een bericht vertrekken volgens de rustige uren? */
export function berichtNuGepast(inst: Instellingen, dag: string, uur: string): boolean {
  const c = inst.contact;
  if (c.geenBerichtenOpZondag && getDay(parseISO(dag)) === 0) return false;
  return uur >= c.berichtenVanaf && uur < c.berichtenTot;
}

export function kanaaladvies(i: AdviesInvoer): Kanaaladvies {
  const { contact: c, instellingen: inst } = i;
  const kanBellen = heeftTelefoon(c);
  const kanBericht = kanBellen && isGsm(c);
  const kanMail = Boolean(c.email);
  const rustig = (k: AdviesKanaal) =>
    (k === 'bericht' || k === 'whatsapp') && !berichtNuGepast(inst, i.dag, i.uur) ? `Verstuur tussen ${inst.contact.berichtenVanaf} en ${inst.contact.berichtenTot}${inst.contact.geenBerichtenOpZondag ? ', niet op zondag' : ''}.` : null;
  const belUren = () => {
    const v = i.voorkeur;
    if (!v?.nietVoor && !v?.nietNa) return null;
    return `Bel ${v.nietVoor ? `niet vóór ${v.nietVoor}` : ''}${v.nietVoor && v.nietNa ? ' en ' : ''}${v.nietNa ? `niet na ${v.nietNa}` : ''}.`;
  };

  const adres = Boolean(c.straat && c.gemeente);
  const mogelijk = (k: AdviesKanaal): boolean =>
    k === 'bellen' ? kanBellen : k === 'bericht' || k === 'whatsapp' ? kanBericht : k === 'mail' ? kanMail : adres;

  // 0. Het kanaal dat je zelf plande in ERAForce (bv. "langsgaan met flyer") gaat voor.
  const g = i.gepland;
  if (g && g !== 'bellen' && mogelijk(g)) {
    return { kanaal: g, reden: `Gepland in ERAForce: ${KANAAL_LABEL[g]}`, opmerking: g === 'bezoek' ? 'Niemand thuis? Laat een flyer of kaartje achter.' : rustig(g) };
  }

  // 1. Voorkeur van het contact gaat altijd voor.
  const vk = i.voorkeur?.kanaal;
  if (vk === 'mail' && kanMail) return { kanaal: 'mail', reden: 'Voorkeur van het contact: mail', opmerking: null };
  if (vk === 'bericht' && kanBericht) return { kanaal: 'bericht', reden: 'Voorkeur van het contact: berichtje', opmerking: rustig('bericht') };
  if (vk === 'bellen' && kanBellen) return { kanaal: 'bellen', reden: 'Voorkeur van het contact: bellen', opmerking: belUren() };

  // 2. Geen nummer, wel mail.
  if (!kanBellen) return kanMail ? { kanaal: 'mail', reden: 'Geen telefoonnummer bekend', opmerking: null } : { kanaal: 'bellen', reden: 'Geen nummer of e-mail bekend', opmerking: 'Zoek eerst een nummer.' };

  // 3. Na x keer geen antwoord: een berichtje in plaats van nog eens bellen (één keer per reeks).
  const oproepen = i.pogingen.filter((p) => kanaalVan(p) === 'telefoon').length;
  const alBericht = i.pogingen.some((p) => kanaalVan(p) !== 'telefoon');
  if (oproepen >= inst.contact.berichtNaGeenAntwoord && !alBericht) {
    const kanaal: AdviesKanaal = kanBericht ? 'bericht' : kanMail ? 'mail' : 'bellen';
    if (kanaal !== 'bellen') return { kanaal, reden: `${oproepen}× geen antwoord — stuur liever een ${kanaal === 'bericht' ? 'berichtje' : 'mail'} dan nog eens te bellen`, opmerking: rustig(kanaal) };
  }

  // 3b. Claude stelde op basis van het dossier een ander kanaal voor (bv. "telefonisch moeilijk bereikbaar").
  const hk = i.hook?.kanaal;
  const veldwerk = hk === 'bezoek' || hk === 'flyer';
  if (hk && hk !== 'bellen' && mogelijk(hk) && (!veldwerk || i.veldwerkMogelijk !== false)) {
    return { kanaal: hk, reden: i.hook!.kanaalReden ?? `Voorstel van de hook: ${KANAAL_LABEL[hk]}`, opmerking: rustig(hk) };
  }

  // 4. Koud/langetermijn met informatieve haak: rustig te lezen, geen druk.
  const info = i.haken.find((h) => h.soort === 'buurt' || h.soort === 'algemeen');
  if (i.fase === 'koud' && info && (kanMail || kanBericht)) {
    const kanaal: AdviesKanaal = kanMail ? 'mail' : 'bericht';
    return { kanaal, reden: `Koud contact met nuttige info — een ${kanaal === 'mail' ? 'mail' : 'berichtje'} is minder opdringerig`, opmerking: rustig(kanaal) };
  }

  return { kanaal: 'bellen', reden: 'Bellen', opmerking: belUren() };
}
