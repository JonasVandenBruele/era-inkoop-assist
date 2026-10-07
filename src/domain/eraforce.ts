// Koppeling naar ERAForce (Salesforce) zonder te schrijven: enkel een link die het record opent in de
// Salesforce-app op de iPhone (getest 3/10/2026: https-recordlinks openen rechtstreeks in de app).
// Bellen gebeurt daar via "Maf Call", zodat de taak met evaluatie meteen in ERAForce staat.
import type { Contact } from './model';

/** Salesforce-ID-voorvoegsels → objectnaam in de URL. */
const OBJECT_VOOR_PREFIX: Record<string, string> = { '00Q': 'Lead', '003': 'Contact', '001': 'Account' };

const SALESFORCE_ID = /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/;

/**
 * Link naar het record in ERAForce, of null als het contact niet uit ERAForce komt (testdata, lokaal contact)
 * en ook niet handmatig gekoppeld is, of als het domein niet ingesteld is.
 * @param gekoppeldId Salesforce-ID uit een handmatige koppeling (gaat voor op het extern ID).
 */
export function eraforceLink(
  contact: Pick<Contact, 'bron' | 'externId'>,
  domein: string | null | undefined,
  gekoppeldId?: string | null,
  actie: string = MAF_CALL_ACTIE,
): string | null {
  const id = gekoppeldId ?? (contact.bron === 'eraforce_mirror' ? contact.externId : null);
  if (!domein || !id || !SALESFORCE_ID.test(id)) return null;
  const host = domein.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const object = OBJECT_VOOR_PREFIX[id.slice(0, 3)];
  // Prospects (Leads): een "quick action"-link opent de VOLLEDIGE recordpagina met "More" (getest 3/10/2026);
  // een gewone recordlink opent in de mobiele app de compacte weergave zonder "More".
  // De actienaam Lead.Maf_Call is bevestigd; de mobiele app start de actie niet via de link, maar opent wel de volledige pagina.
  if (object === 'Lead') {
    return `https://${host}/lightning/action/quick/Lead.${encodeURIComponent(actie)}?objectApiName=Lead&context=RECORD_DETAIL&recordId=${id}`;
  }
  return object ? `https://${host}/lightning/r/${object}/${id}/view` : `https://${host}/lightning/r/${id}/view`;
}

/** Technische naam van de actie "Maf Call" in ERAForce (bevestigd 3/10/2026). */
export const MAF_CALL_ACTIE = 'Maf_Call';

/** Haalt het Salesforce-ID uit een geplakte ERAForce-link (of een los ID). Null als er geen geldig ID in zit. */
export function salesforceIdUitLink(tekst: string): string | null {
  const t = tekst.trim();
  const m = /\/lightning\/r\/(?:[A-Za-z_]+\/)?([a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?)(?:\/|\?|$)/.exec(t) ?? /sObject\/([a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?)/.exec(t);
  if (m) return m[1]!;
  return SALESFORCE_ID.test(t) ? t : null;
}

/** Recordtype "ERAforce Prospectie taken" (zelfde als ERA Scout, 7/10/2026). */
export const TAAK_RECORDTYPE = '01224000000gEemAAE';

/** Soorten taken die Oxpecker in ERAForce laat openen (bestaande ERAForce-types; "WhatsApp" bestaat niet, dus "SMS"). */
export type EraforceTaakSoort = 'uitgaand' | 'inkomend' | 'whatsapp' | 'sms' | 'mail';

const TAAK_VELDEN: Record<EraforceTaakSoort, { Subject: string; Type: string }> = {
  uitgaand: { Subject: 'Uitgaande Oproep', Type: 'Uitgaande Oproep' },
  inkomend: { Subject: 'Inkomende Oproep', Type: 'Inkomende Oproep' },
  whatsapp: { Subject: 'WhatsApp verstuurd', Type: 'SMS' },
  sms: { Subject: 'Sms verstuurd', Type: 'SMS' },
  mail: { Subject: 'Mail verstuurd', Type: 'E-mail' },
};

/**
 * Link die in ERAForce een nieuwe, ingevulde taak opent op de prospect (zoals ERA Scout): onderwerp en type, status
 * Gesloten, datum vandaag, gekoppeld aan het contact, en bij een bericht de tekst als omschrijving. Jonas vult enkel
 * nog aan (evaluatie) en bewaart. Oxpecker schrijft zelf niets naar ERAForce.
 */
export function eraforceTaakLink(
  contact: Pick<Contact, 'bron' | 'externId'>,
  domein: string | null | undefined,
  vandaag: string,
  soort: EraforceTaakSoort,
  omschrijving?: string | null,
): string | null {
  const id = contact.bron === 'eraforce_mirror' ? contact.externId : null;
  if (!domein || !id || !SALESFORCE_ID.test(id) || !['00Q', '003'].includes(id.slice(0, 3))) return null;
  const host = domein.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const velden: Record<string, string> = { ...TAAK_VELDEN[soort], Status: 'Gesloten', WhoId: id, ActivityDate: vandaag };
  // Lange teksten inkorten: de link moet in de Salesforce-app passen.
  if (omschrijving?.trim()) velden.Description = omschrijving.trim().slice(0, 1500);
  const dv = Object.entries(velden)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join(',');
  return `https://${host}/lightning/o/Task/new?recordTypeId=${TAAK_RECORDTYPE}&defaultFieldValues=${dv}`;
}

/** Oproeptaak (uitgaand, of inkomend als de klant terugbelde). */
export function eraforceOproepLink(
  contact: Pick<Contact, 'bron' | 'externId'>,
  domein: string | null | undefined,
  vandaag: string,
  richting: 'uitgaand' | 'inkomend' = 'uitgaand',
): string | null {
  return eraforceTaakLink(contact, domein, vandaag, richting);
}

/** Gewone link naar het record (om de prospect te bekijken). */
export function eraforceRecordLink(contact: Pick<Contact, 'bron' | 'externId'>, domein: string | null | undefined): string | null {
  const id = contact.bron === 'eraforce_mirror' ? contact.externId : null;
  if (!domein || !id || !SALESFORCE_ID.test(id)) return null;
  const host = domein.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const object = OBJECT_VOOR_PREFIX[id.slice(0, 3)];
  return object ? `https://${host}/lightning/r/${object}/${id}/view` : `https://${host}/lightning/r/${id}/view`;
}
