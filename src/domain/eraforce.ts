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
export function eraforceLink(contact: Pick<Contact, 'bron' | 'externId'>, domein: string | null | undefined, gekoppeldId?: string | null): string | null {
  const id = gekoppeldId ?? (contact.bron === 'eraforce_mirror' ? contact.externId : null);
  if (!domein || !id || !SALESFORCE_ID.test(id)) return null;
  const host = domein.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const object = OBJECT_VOOR_PREFIX[id.slice(0, 3)];
  return object ? `https://${host}/lightning/r/${object}/${id}/view` : `https://${host}/lightning/r/${id}/view`;
}

/** Haalt het Salesforce-ID uit een geplakte ERAForce-link (of een los ID). Null als er geen geldig ID in zit. */
export function salesforceIdUitLink(tekst: string): string | null {
  const t = tekst.trim();
  const m = /\/lightning\/r\/(?:[A-Za-z_]+\/)?([a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?)(?:\/|\?|$)/.exec(t) ?? /sObject\/([a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?)/.exec(t);
  if (m) return m[1]!;
  return SALESFORCE_ID.test(t) ? t : null;
}
