import { describe, expect, it } from 'vitest';
import { openKlantberichten, type WaBericht } from './whatsapp';

const b = (uur: number, vanMij: boolean, tekst: string): WaBericht => ({ tijd: new Date(`2026-10-07T${String(uur).padStart(2, '0')}:00:00Z`), vanMij, tekst });
const NU = new Date('2026-10-07T15:00:00Z');

describe('te beantwoorden', () => {
  it('open als de klant het laatst schreef: zijn berichten sinds jouw laatste', () => {
    const r = openKlantberichten([b(8, false, 'oud'), b(9, true, 'Dag Piet'), b(10, false, 'Dag Jonas'), b(11, false, 'wanneer kan je langskomen?')], NU)!;
    expect(r.map((x) => x.tekst)).toEqual(['Dag Jonas', 'wanneer kan je langskomen?']);
  });
  it('niet open als jij het laatst schreef of als het te oud is', () => {
    expect(openKlantberichten([b(10, false, 'vraag'), b(11, true, 'antwoord')], NU)).toBeNull();
    expect(openKlantberichten([b(10, false, 'vraag')], new Date('2026-10-30T12:00:00Z'))).toBeNull();
    expect(openKlantberichten([], NU)).toBeNull();
  });
  it('maximaal 3 klantberichten', () => {
    expect(openKlantberichten([1, 2, 3, 4, 5].map((u) => b(u, false, `m${u}`)), NU)!.map((x) => x.tekst)).toEqual(['m3', 'm4', 'm5']);
  });
});
