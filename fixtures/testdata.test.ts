import { describe, expect, it } from 'vitest';
import { genereerTestdata, RANDGEVAL } from './testdata';
import { dagVan } from '../src/core/dates';

const TESTDATUM = '2026-10-13T07:30';

describe('fictieve testdata', () => {
  const data = genereerTestdata({ testdatum: TESTDATUM });
  const perExt = new Map(data.contacten.map((c) => [c.externId, c]));
  const contact = (ext: string) => {
    const c = perExt.get(ext);
    if (!c) throw new Error(`Randgeval ontbreekt: ${ext}`);
    return c;
  };

  it('is reproduceerbaar: twee keer genereren geeft exact hetzelfde', () => {
    expect(genereerTestdata({ testdatum: TESTDATUM })).toEqual(data);
  });

  it('verschilt per gebruiker enkel in ID\'s', () => {
    const ander = genereerTestdata({ testdatum: TESTDATUM, idPrefix: 'gebruiker-b' });
    expect(ander.contacten[0]!.id).not.toBe(data.contacten[0]!.id);
    expect(ander.contacten.map((c) => c.achternaam)).toEqual(data.contacten.map((c) => c.achternaam));
  });

  it('bevat ongeveer 60 contacten met een realistische mix', () => {
    expect(data.contacten.length).toBeGreaterThanOrEqual(55);
    expect(data.contacten.length).toBeLessThanOrEqual(65);
    const tel = (s: string) => data.contacten.filter((c) => c.statusBron === s).length;
    expect(tel('nieuwe_lead')).toBeGreaterThanOrEqual(8);
    expect(tel('prospect')).toBeGreaterThanOrEqual(20);
    expect(tel('langetermijn')).toBeGreaterThanOrEqual(15);
  });

  it('heeft unieke ID\'s en extern-ID\'s', () => {
    const ids = [...data.contacten, ...data.panden, ...data.activiteiten, ...data.afspraken].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    const ext = data.contacten.map((c) => c.externId);
    expect(new Set(ext).size).toBe(ext.length);
  });

  it('is volledig als testdata gemarkeerd met herkomstvelden', () => {
    for (const c of data.contacten) {
      expect(c.isTestdata).toBe(true);
      expect(c.bron).toBe('fictief');
      expect(c.externId).toBeTruthy();
      expect(c.geimporteerdOp).toBeInstanceOf(Date);
    }
  });

  it('verschuift mee met de testdatum', () => {
    const later = genereerTestdata({ testdatum: '2027-02-02T07:30' });
    const vandaag = (d: typeof data) => d.afspraken.filter((a) => dagVan(a.start) === dagVan(d.bronnen[0]!.laatstSuccesvolOp!)).length;
    expect(vandaag(later)).toBe(vandaag(data));
  });

  it('geen activiteit of belpoging ligt na "nu"', () => {
    const nu = new Date('2026-10-13T05:30:00Z');
    for (const a of data.activiteiten) expect(a.gebeurdOp!.getTime()).toBeLessThanOrEqual(nu.getTime());
    for (const p of data.belpogingen) expect(p.tijdstip.getTime()).toBeLessThanOrEqual(nu.getTime());
  });

  describe('randgevallen', () => {
    it('pand met meerdere eigenaars/beslissers', () => {
      const pand = data.panden.find((p) => p.externId === RANDGEVAL.pandErfenis)!;
      const rollen = data.contactPanden.filter((cp) => cp.pandId === pand.id).map((cp) => cp.rol);
      expect(rollen).toEqual(expect.arrayContaining(['beslisser', 'mede_eigenaar', 'erfgenaam']));
    });

    it('contact met meerdere panden', () => {
      const c = contact(RANDGEVAL.meerderePanden);
      expect(data.contactPanden.filter((cp) => cp.contactId === c.id).length).toBe(3);
    });

    it('contact zonder telefoonnummer', () => {
      expect(contact(RANDGEVAL.zonderTelefoon).telefoons).toEqual([]);
    });

    it('afspraak zonder gekoppeld contact', () => {
      const a = data.afspraken.find((x) => x.externId === RANDGEVAL.afspraakZonderContact)!;
      expect(a.contactId).toBeNull();
      expect(a.koppelStatus).toBe('geen');
    });

    it('prospect die niet meer gebeld wil worden', () => {
      expect(contact(RANDGEVAL.nietMeerBellen).nietBellenBron).toBe(true);
    });

    it('expliciete terugbelafspraak over enkele maanden', () => {
      const c = contact(RANDGEVAL.terugbellenNaMaanden);
      const taak = data.activiteiten.find((a) => a.contactId === c.id && a.taakSoort === 'terugbellen')!;
      expect(taak.vervaltOp! > '2026-12-31').toBe(true);
    });

    it('lokaal belresultaat dat nog niet in de CRM-bron staat', () => {
      const c = contact(RANDGEVAL.nieuweLeadLokaalGeenAntwoord);
      expect(data.belpogingen.some((p) => p.contactId === c.id)).toBe(true);
      expect(data.activiteiten.some((a) => a.contactId === c.id && a.type === 'gesprek')).toBe(false);
    });

    it('tegenstrijdige notities en Donna-evaluaties', () => {
      const c = contact(RANDGEVAL.tegenstrijdig);
      const soorten = data.activiteiten.filter((a) => a.contactId === c.id).map((a) => a.type);
      expect(soorten).toContain('evaluatie');
      expect(data.activiteiten.filter((a) => a.type === 'evaluatie' && a.auteur === 'Donna').length).toBeGreaterThan(10);
    });

    it('overlappende afspraken en een hele-dag-afspraak', () => {
      const vandaag = data.afspraken.filter((a) => dagVan(a.start) === '2026-10-13').sort((a, b) => +a.start - +b.start);
      const overlap = vandaag.some((a, i) => vandaag[i + 1] && vandaag[i + 1]!.start < a.einde);
      expect(overlap).toBe(true);
      expect(data.afspraken.some((a) => a.heleDag)).toBe(true);
    });
  });
});
