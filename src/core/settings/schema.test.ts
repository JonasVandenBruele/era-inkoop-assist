import { describe, expect, it } from 'vitest';
import { leesInstellingen, STANDAARD_INSTELLINGEN } from './schema';

describe('instellingen', () => {
  it('heeft de afgesproken startwaarden', () => {
    expect(STANDAARD_INSTELLINGEN.ritmeDagen).toEqual({ warm: 14, lauw: 42, koud: 90 });
    expect(STANDAARD_INSTELLINGEN.maxPerDag).toBe(15);
    expect(STANDAARD_INSTELLINGEN.ai.budgetEurPerMaand).toBe(10);
    expect(STANDAARD_INSTELLINGEN.ai.ingeschakeld).toBe(false);
  });

  it('vult ontbrekende velden aan met standaardwaarden', () => {
    const i = leesInstellingen({ maxPerDag: 20 });
    expect(i.maxPerDag).toBe(20);
    expect(i.ritmeDagen.warm).toBe(14);
  });

  it('vervangt enkel ongeldige velden en behoudt de rest', () => {
    const i = leesInstellingen({ maxPerDag: -5, testdatum: '2027-01-05T08:00' });
    expect(i.maxPerDag).toBe(15);
    expect(i.testdatum).toBe('2027-01-05T08:00');
  });

  it('kan met lege of rare invoer om', () => {
    expect(leesInstellingen(null)).toEqual(STANDAARD_INSTELLINGEN);
    expect(leesInstellingen('onzin')).toEqual(STANDAARD_INSTELLINGEN);
  });
});
