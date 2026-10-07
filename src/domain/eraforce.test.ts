import { describe, expect, it } from 'vitest';
import { eraforceLink, salesforceIdUitLink } from './eraforce';

const DOMEIN = 'voorbeeld.lightning.force.com';

describe('ERAForce-link', () => {
  it('opent een prospect (Lead) op de volledige pagina via de quick-action-link', () => {
    expect(eraforceLink({ bron: 'eraforce_mirror', externId: '00QAA00000AbCdEFGH' }, DOMEIN)).toBe(
      'https://voorbeeld.lightning.force.com/lightning/action/quick/Lead.Maf_Call?objectApiName=Lead&context=RECORD_DETAIL&recordId=00QAA00000AbCdEFGH',
    );
  });

  it('de actienaam is aanpasbaar', () => {
    expect(eraforceLink({ bron: 'eraforce_mirror', externId: '00QAA00000AbCdEFGH' }, DOMEIN, null, 'ERA_MafCall')).toContain('/quick/Lead.ERA_MafCall?');
  });

  it('herkent ook contactpersonen en accounts, en valt anders terug op een algemene recordlink', () => {
    expect(eraforceLink({ bron: 'eraforce_mirror', externId: '003AA00000AbCdE' }, DOMEIN)).toContain('/lightning/r/Contact/');
    expect(eraforceLink({ bron: 'eraforce_mirror', externId: 'a0XAA00000AbCdE' }, DOMEIN)).toBe('https://voorbeeld.lightning.force.com/lightning/r/a0XAA00000AbCdE/view');
  });

  it('geen link voor testdata, lokale contacten, ongeldige ID\'s of zonder domein', () => {
    expect(eraforceLink({ bron: 'fictief', externId: 'FIC-C-001' }, DOMEIN)).toBeNull();
    expect(eraforceLink({ bron: 'lokaal', externId: null }, DOMEIN)).toBeNull();
    expect(eraforceLink({ bron: 'eraforce_mirror', externId: 'kapot id' }, DOMEIN)).toBeNull();
    expect(eraforceLink({ bron: 'eraforce_mirror', externId: '00QAA00000AbCdEFGH' }, '')).toBeNull();
  });

  it('aanvaardt een domein met https:// of een pad', () => {
    expect(eraforceLink({ bron: 'eraforce_mirror', externId: '00QAA00000AbCdE' }, `https://${DOMEIN}/lightning/page/home`)).toMatch(
      /^https:\/\/voorbeeld\.lightning\.force\.com\/lightning\/action\/quick\/Lead\./,
    );
  });
});

describe('handmatige koppeling', () => {
  it('een gekoppeld ID geeft ook testcontacten een ERAForce-link', () => {
    expect(eraforceLink({ bron: 'fictief', externId: 'FIC-C-004' }, DOMEIN, '00QAA00000AbCdEFGH')).toContain('recordId=00QAA00000AbCdEFGH');
  });

  it('haalt het ID uit allerlei geplakte links', () => {
    expect(salesforceIdUitLink('https://x.lightning.force.com/lightning/r/Lead/00QAA00000AbCdEFGH/view?target=detailTab__body')).toBe('00QAA00000AbCdEFGH');
    expect(salesforceIdUitLink('https://x.lightning.force.com/lightning/r/00QAA00000AbCdE/view')).toBe('00QAA00000AbCdE');
    expect(salesforceIdUitLink('salesforce1://sObject/00QAA00000AbCdEFGH/view')).toBe('00QAA00000AbCdEFGH');
    expect(salesforceIdUitLink('  00QAA00000AbCdEFGH ')).toBe('00QAA00000AbCdEFGH');
    expect(salesforceIdUitLink('https://www.google.com')).toBeNull();
    expect(salesforceIdUitLink('')).toBeNull();
  });
});

import { eraforceOproepLink, eraforceRecordLink } from './eraforce';

describe('oproep loggen in ERAForce (zoals ERA Scout)', () => {
  const lead = { bron: 'eraforce_mirror' as const, externId: '00QTt00000F0DcbMAF' };
  it('opent een ingevulde Uitgaande Oproep-taak op de prospect', () => {
    expect(eraforceOproepLink(lead, DOMEIN, '2026-10-07')).toBe(
      `https://${DOMEIN}/lightning/o/Task/new?recordTypeId=01224000000gEemAAE&defaultFieldValues=Subject=Uitgaande%20Oproep,Type=Uitgaande%20Oproep,Status=Gesloten,WhoId=00QTt00000F0DcbMAF,ActivityDate=2026-10-07`,
    );
  });
  it('inkomende oproep als de klant terugbelt; niet voor testdata of zonder domein', () => {
    expect(eraforceOproepLink(lead, DOMEIN, '2026-10-07', 'inkomend')).toContain('Type=Inkomende%20Oproep');
    expect(eraforceOproepLink({ bron: 'demo' as never, externId: 'FIC-C-001' }, DOMEIN, '2026-10-07')).toBeNull();
    expect(eraforceOproepLink(lead, undefined, '2026-10-07')).toBeNull();
    expect(eraforceRecordLink(lead, DOMEIN)).toBe(`https://${DOMEIN}/lightning/r/Lead/00QTt00000F0DcbMAF/view`);
  });
});
