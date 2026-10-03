// Waardehaken (PLAN.md §7b.2): concrete redenen om contact op te nemen die de klant iets opleveren.
// Pure functies. Afgeleide haken komen uit het dossier; opgeslagen haken voegt Jonas toe (of later de Marktradar).
import { dagenTussen, korteDag, type DagKey } from '../core/dates';
import type { Bronactiviteit, Contact, ContactPand, Pand, Waardehaak } from './model';

/** Onderwerpen die nooit als haak gebruikt worden. */
const GEVOELIG = /overl[ei]d|overlijden|begrafenis|ziek|kanker|ziekenhuis|scheiding|gescheiden|faillis|schulden|beslag|depressie/i;

export function isGevoelig(tekst: string): boolean {
  return GEVOELIG.test(tekst);
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+\d.*$/, '').trim(); // "Lindenlaan 14" → "lindenlaan"

export interface HaakContext {
  contact: Contact;
  panden: Pand[];
  contactPanden: ContactPand[];
  haken: Waardehaak[];
  activiteiten: Bronactiviteit[];
  vandaag: DagKey;
}

/** Afgeleide haken uit het dossier, bv. een huurcontract dat binnenkort afloopt. */
export function afgeleideHaken(ctx: HaakContext): Waardehaak[] {
  const { contact, vandaag } = ctx;
  const resultaat: Waardehaak[] = [];
  const mijnPanden = ctx.contactPanden.filter((cp) => cp.contactId === contact.id).map((cp) => ctx.panden.find((p) => p.id === cp.pandId)).filter((p): p is Pand => Boolean(p));

  for (const p of mijnPanden) {
    const m = /verhuurd tot (\d{2})\/(\d{4})/i.exec(p.omschrijving ?? '');
    if (!m) continue;
    const einde = `${m[2]}-${m[1]}-01`;
    const dagen = dagenTussen(vandaag, einde);
    if (dagen >= 0 && dagen <= 183) {
      resultaat.push({
        id: `afgeleid:huur:${p.id}`,
        contactId: contact.id,
        pandId: p.id,
        straat: null,
        gemeente: null,
        soort: 'dossier',
        onderwerp: `Huurcontract ${p.straat} loopt af in ${m[1]}/${m[2]}`,
        detail: 'Goed moment om de opties te bespreken: opnieuw verhuren of verkopen.',
        bron: 'pandgegevens',
        geldigVanaf: vandaag,
        geldigTot: einde,
        gevoelig: false,
        aangemaaktOp: new Date(0),
        afgeleid: true,
      });
    }
  }

  // Een jaar na het eerste gesprek (±7 dagen): rustig moment om iets nuttigs te delen.
  const eerste = ctx.activiteiten
    .filter((a) => a.contactId === contact.id && a.type === 'gesprek' && a.gebeurdOp)
    .sort((a, b) => a.gebeurdOp!.getTime() - b.gebeurdOp!.getTime())[0];
  if (eerste) {
    const dagen = dagenTussen(eerste.gebeurdOp!.toISOString().slice(0, 10), vandaag);
    const jaren = Math.round(dagen / 365);
    if (jaren >= 1 && Math.abs(dagen - jaren * 365) <= 7) {
      resultaat.push({
        id: `afgeleid:jaar:${contact.id}`,
        contactId: contact.id,
        pandId: null,
        straat: null,
        gemeente: null,
        soort: 'dossier',
        onderwerp: `${jaren === 1 ? 'Een jaar' : `${jaren} jaar`} geleden sinds jullie eerste gesprek`,
        detail: 'Goed moment voor een update over de waarde of de markt in de buurt.',
        bron: 'contacthistoriek',
        geldigVanaf: vandaag,
        geldigTot: vandaag,
        gevoelig: false,
        aangemaaktOp: new Date(0),
        afgeleid: true,
      });
    }
  }
  return resultaat;
}

/**
 * Geldige haken voor een contact: rechtstreeks gekoppeld, via een van zijn panden, via de straat/gemeente
 * van een pand of zijn adres, of algemeen. Verlopen en gevoelige haken vallen weg.
 */
export function hakenVoorContact(ctx: HaakContext): Waardehaak[] {
  const { contact, vandaag } = ctx;
  const mijnPanden = ctx.contactPanden.filter((cp) => cp.contactId === contact.id).map((cp) => ctx.panden.find((p) => p.id === cp.pandId)).filter((p): p is Pand => Boolean(p));
  const pandIds = new Set(mijnPanden.map((p) => p.id));
  const adressen = [...mijnPanden.map((p) => ({ straat: norm(p.straat), gemeente: norm(p.gemeente) })), { straat: norm(contact.straat), gemeente: norm(contact.gemeente) }];

  const geldig = (h: Waardehaak) => h.geldigVanaf <= vandaag && (!h.geldigTot || h.geldigTot >= vandaag) && !h.gevoelig && !isGevoelig(`${h.onderwerp} ${h.detail ?? ''}`);
  const vanToepassing = (h: Waardehaak) => {
    if (h.contactId) return h.contactId === contact.id;
    if (h.pandId) return pandIds.has(h.pandId);
    if (h.gemeente) return adressen.some((a) => a.gemeente === norm(h.gemeente) && (!h.straat || a.straat === norm(h.straat)));
    return h.soort === 'algemeen';
  };

  const rang: Record<Waardehaak['soort'], number> = { dossier: 0, buurt: 1, persoonlijk: 2, algemeen: 3 };
  return [...afgeleideHaken(ctx), ...ctx.haken.filter((h) => vanToepassing(h) && geldig(h))].sort((a, b) => rang[a.soort] - rang[b.soort]);
}

/** Haken die specifiek zijn voor dit contact (niet algemeen) en dus een scorebonus geven. */
export function specifiekeHaken(haken: Waardehaak[]): Waardehaak[] {
  return haken.filter((h) => h.soort !== 'algemeen');
}

/** Een haak als zin in een opening of bericht. Persoonlijke haken nooit (enkel tip voor Jonas). */
export function haakZin(h: Waardehaak, je: boolean): string | null {
  const uw = je ? 'je' : 'uw';
  const klein = h.onderwerp.charAt(0).toLowerCase() + h.onderwerp.slice(1);
  switch (h.soort) {
    case 'buurt':
      return `Ik heb nieuws uit ${uw} buurt: ${klein}.`;
    case 'dossier':
      return `Ik dacht aan ${je ? 'jou' : 'u'}: ${klein}.`;
    case 'algemeen':
      return `Ik wou ${je ? 'je' : 'u'} iets laten weten dat voor eigenaars interessant is: ${klein}.`;
    case 'persoonlijk':
      return null;
  }
}

export function haakLabel(h: Waardehaak): string {
  const soort = { buurt: 'Buurt', dossier: 'Dossier', algemeen: 'Algemeen', persoonlijk: 'Persoonlijk' }[h.soort];
  return `${soort}: ${h.onderwerp}${h.geldigTot ? ` (tot ${korteDag(h.geldigTot)})` : ''}`;
}
