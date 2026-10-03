import { describe, expect, it } from 'vitest';
import { eraforceLink } from './eraforce';

const DOMEIN = 'voorbeeld.lightning.force.com';

describe('ERAForce-link', () => {
  it('opent een prospect (Lead) in ERAForce', () => {
    expect(eraforceLink({ bron: 'eraforce_mirror', externId: '00QAA00000AbCdEFGH' }, DOMEIN)).toBe(
      'https://voorbeeld.lightning.force.com/lightning/r/Lead/00QAA00000AbCdEFGH/view',
    );
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
    expect(eraforceLink({ bron: 'eraforce_mirror', externId: '00QAA00000AbCdE' }, `https://${DOMEIN}/lightning/page/home`)).toBe(
      'https://voorbeeld.lightning.force.com/lightning/r/Lead/00QAA00000AbCdE/view',
    );
  });
});
