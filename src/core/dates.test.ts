import { describe, expect, it } from 'vitest';
import { dagVan, dagenTussen, opDagUur, plusDagen, uurVan, vanBrusselsLokaal, relatief } from './dates';
import { testKlok, maakKlok } from './clock';

describe('Brusselse datums', () => {
  it('zet lokale tijd correct om in zomertijd (UTC+2)', () => {
    expect(vanBrusselsLokaal('2026-07-01T09:00').toISOString()).toBe('2026-07-01T07:00:00.000Z');
  });

  it('zet lokale tijd correct om in wintertijd (UTC+1)', () => {
    expect(vanBrusselsLokaal('2026-12-01T09:00').toISOString()).toBe('2026-12-01T08:00:00.000Z');
  });

  it('kent de juiste dag toe net na middernacht (UTC is dan nog gisteren)', () => {
    const t = new Date('2026-10-12T22:30:00Z'); // 00:30 op 13/10 in Brussel
    expect(dagVan(t)).toBe('2026-10-13');
    expect(uurVan(t)).toBe('00:30');
  });

  it('telt kalenderdagen correct over de zomertijdwissel (25/10/2026)', () => {
    expect(plusDagen('2026-10-24', 1)).toBe('2026-10-25');
    expect(plusDagen('2026-10-24', 2)).toBe('2026-10-26');
    expect(dagenTussen('2026-10-24', '2026-10-26')).toBe(2);
    expect(dagenTussen('2026-03-28', '2026-03-30')).toBe(2);
  });

  it('dag + uur over de wissel blijft hetzelfde lokale uur', () => {
    expect(uurVan(opDagUur('2026-10-24', '09:00'))).toBe('09:00');
    expect(uurVan(opDagUur('2026-10-26', '09:00'))).toBe('09:00');
  });

  it('geeft begrijpelijke relatieve omschrijvingen', () => {
    expect(relatief('2026-10-13', '2026-10-13')).toBe('vandaag');
    expect(relatief('2026-10-12', '2026-10-13')).toBe('gisteren');
    expect(relatief('2026-10-03', '2026-10-13')).toBe('10 dagen geleden');
  });
});

describe('klok', () => {
  it('testklok staat op de ingestelde Brusselse datum', () => {
    const k = testKlok('2026-10-13T07:30', false);
    expect(k.vandaag()).toBe('2026-10-13');
    expect(uurVan(k.nu())).toBe('07:30');
    expect(k.isTestklok).toBe(true);
  });

  it('zonder testdatum loopt de echte klok', () => {
    const k = maakKlok(null);
    expect(k.isTestklok).toBe(false);
    expect(Math.abs(k.nu().getTime() - Date.now())).toBeLessThan(1000);
  });
});
