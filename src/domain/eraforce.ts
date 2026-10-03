// Koppeling naar ERAForce (Salesforce) zonder te schrijven: enkel een link die het record opent in de
// Salesforce-app op de iPhone (getest 3/10/2026: https-recordlinks openen rechtstreeks in de app).
// Bellen gebeurt daar via "Maf Call", zodat de taak met evaluatie meteen in ERAForce staat.
import type { Contact } from './model';

/** Salesforce-ID-voorvoegsels → objectnaam in de URL. */
const OBJECT_VOOR_PREFIX: Record<string, string> = { '00Q': 'Lead', '003': 'Contact', '001': 'Account' };

const SALESFORCE_ID = /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/;

/**
 * Link naar het record in ERAForce, of null als het contact (nog) niet uit ERAForce komt
 * (testdata, lokaal contact) of als het domein niet ingesteld is.
 */
export function eraforceLink(contact: Pick<Contact, 'bron' | 'externId'>, domein: string | null | undefined): string | null {
  if (!domein || contact.bron !== 'eraforce_mirror' || !contact.externId || !SALESFORCE_ID.test(contact.externId)) return null;
  const host = domein.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const object = OBJECT_VOOR_PREFIX[contact.externId.slice(0, 3)];
  return object ? `https://${host}/lightning/r/${object}/${contact.externId}/view` : `https://${host}/lightning/r/${contact.externId}/view`;
}
