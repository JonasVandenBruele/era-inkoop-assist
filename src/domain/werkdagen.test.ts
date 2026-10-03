import { describe, expect, it } from 'vitest';
import { belgischeFeestdagen, isWerkdag, plusWerkdagen, werkdagenTussen } from './werkdagen';

describe('werkdagen', () => {
  it('kent de Belgische feestdagen van 2027 (Pasen 28 maart)', () => {
    expect([...belgischeFeestdagen(2027)].sort()).toEqual([
      '2027-01-01', '2027-03-29', '2027-05-01', '2027-05-06', '2027-05-17',
      '2027-07-21', '2027-08-15', '2027-11-01', '2027-11-11', '2027-12-25',
    ]);
  });

  it('weekend en feestdag zijn geen werkdag', () => {
    expect(isWerkdag('2026-10-13')).toBe(true); // dinsdag
    expect(isWerkdag('2026-10-17')).toBe(false); // zaterdag
    expect(isWerkdag('2026-11-11')).toBe(false); // Wapenstilstand (woensdag)
  });

  it('volgende werkdag slaat weekend en feestdagen over', () => {
    expect(plusWerkdagen('2026-10-16', 1)).toBe('2026-10-19'); // vr → ma
    expect(plusWerkdagen('2026-11-10', 1)).toBe('2026-11-12'); // over 11 november
    expect(plusWerkdagen('2026-12-24', 1)).toBe('2026-12-28'); // over Kerstmis + weekend
    expect(plusWerkdagen('2026-10-17', 0)).toBe('2026-10-19');
  });

  it('telt verstreken werkdagen', () => {
    expect(werkdagenTussen('2026-10-09', '2026-10-13')).toBe(2); // vr → di: ma + di
    expect(werkdagenTussen('2026-10-13', '2026-10-13')).toBe(0);
  });
});
