import { describe, expect, it } from 'vitest';
import { genereerTestdata } from '../../fixtures/testdata';
import { opDagUur } from '../core/dates';
import { leegGegevens, type Gegevens } from '../core/db/store';
import { STANDAARD_INSTELLINGEN, type Instellingen } from '../core/settings/schema';
import { teVersturenMeldingen } from './meldingen';

const DAG = '2026-10-13';
const data: Gegevens = { ...leegGegevens(), ...genereerTestdata({ testdatum: `${DAG}T07:30` }) };
const inst: Instellingen = { ...STANDAARD_INSTELLINGEN, testdatum: `${DAG}T07:30` };
const om = (uur: string, i: Instellingen = inst) => teVersturenMeldingen(data, i, opDagUur(DAG, uur));

describe('pushmeldingen', () => {
  it('ochtendoverzicht vanaf het ingestelde uur, zonder klantnamen', () => {
    expect(om('07:50').some((m) => m.tag === 'ochtend')).toBe(false);
    const m = om('08:05').find((x) => x.tag === 'ochtend')!;
    expect(m.sleutel).toBe(`ochtend:${DAG}`);
    expect(m.tekst).toMatch(/Vandaag: \d+ te bellen/);
    expect(m.tekst).toContain('Eerste belmoment 08:30–09:40');
    for (const c of data.contacten) expect(m.tekst).not.toContain(c.achternaam);
  });

  it('melding bij de start van een vrij belmoment, binnen een venster van 20 minuten', () => {
    expect(om('11:25').find((m) => m.tag === 'belmoment')?.titel).toBe('Belmoment tot 12:30');
    expect(om('11:45').some((m) => m.tag === 'belmoment')).toBe(false);
  });

  it('herinnering vóór een terugbelafspraak met uur, standaard zonder naam', () => {
    // Mevr. Peeters om 10:30; 10 min vooraf.
    expect(om('10:15').some((m) => m.tag === 'terugbel-10:30')).toBe(false);
    const m = om('10:22').find((x) => x.tag === 'terugbel-10:30')!;
    expect(m.tekst).toBe('Open Oxpecker voor de details.');
    const metNaam = om('10:22', { ...inst, meldingen: { ...inst.meldingen, toonNamen: true } }).find((x) => x.tag === 'terugbel-10:30')!;
    expect(metNaam.tekst).toContain('Peeters');
  });

  it('dezelfde melding heeft telkens dezelfde sleutel (wordt maar één keer verstuurd)', () => {
    const a = om('11:21').find((m) => m.tag === 'belmoment')!;
    const b = om('11:31').find((m) => m.tag === 'belmoment')!;
    expect(a.sleutel).toBe(b.sleutel);
  });

  it('uitgeschakelde soorten worden niet verstuurd', () => {
    const uit: Instellingen = { ...inst, meldingen: { ...inst.meldingen, ochtend: false, belmoment: false, terugbel: false } };
    expect(om('08:35', uit)).toEqual([]);
  });

  it('geen meldingen op een weekend (zonder testdatum)', () => {
    const echt: Instellingen = { ...STANDAARD_INSTELLINGEN, testdatum: null };
    expect(teVersturenMeldingen(data, echt, opDagUur('2026-10-17', '08:30'))).toEqual([]);
  });
});
