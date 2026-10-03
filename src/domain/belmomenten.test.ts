import { describe, expect, it } from 'vitest';
import { genereerTestdata, RANDGEVAL } from '../../fixtures/testdata';
import { opDagUur } from '../core/dates';
import { STANDAARD_INSTELLINGEN, type Instellingen } from '../core/settings/schema';
import { berekenBelmomenten, blokTekst } from './belmomenten';
import { berekenBellijst } from './prioriteit';
import type { Afspraak } from './model';

const DAG = '2026-10-13';
const data = genereerTestdata({ testdatum: `${DAG}T07:30` });
const lijst = berekenBellijst({ ...data, instellingen: STANDAARD_INSTELLINGEN, vandaag: DAG, uur: '07:30' }).vandaag;
const afspraak = (van: string, tot: string, extra: Partial<Afspraak> = {}): Afspraak => ({
  id: van, bron: 'lokaal', externId: null, gebeurdOp: null, gewijzigdInBronOp: null, geimporteerdOp: new Date(), isTestdata: true,
  titel: 'Test', start: opDagUur(DAG, van), einde: opDagUur(DAG, tot), heleDag: false, locatie: 'Kerkstraat 1, Gent', contactId: null,
  koppelStatus: 'geen', omschrijving: null, ...extra,
});

describe('belmomenten', () => {
  // Testdag: afspraken 10:00–11:00 (op locatie) en 10:30–11:00 (kantoor, overlapt), 14:00–15:00, 16:30–17:15.
  // Werkdag 08:30–18:00, pauze 12:30–13:15, reisbuffer 20 min, belduur 6 min.
  const r = berekenBelmomenten(data.afspraken, lijst, DAG, STANDAARD_INSTELLINGEN, null);

  it('vindt de vrije blokken tussen afspraken, met reisbuffer en zonder pauze', () => {
    expect(r.momenten.map(blokTekst)).toEqual(['08:30–09:40', '11:20–12:30', '13:15–13:40', '15:20–16:10', '17:35–18:00']);
  });

  it('rekent de capaciteit uit volgens de belduur', () => {
    expect(r.momenten.map((m) => m.capaciteit)).toEqual([11, 11, 4, 8, 4]);
    expect(r.capaciteit).toBe(38);
  });

  it('verdeelt de lijst over de blokken en plaatst een terugbelafspraak met uur in het juiste blok', () => {
    const geplaatst = r.momenten.flatMap((m) => m.kandidaten.map((k) => k.contact.id));
    expect(new Set(geplaatst).size).toBe(geplaatst.length);
    expect(geplaatst.length + r.pastNiet.length).toBe(lijst.length);
    // Mevr. Peeters (10:30) valt tijdens een afspraak → zo vroeg mogelijk, dus in het eerste blok.
    expect(r.momenten[0]!.kandidaten[0]!.contact.externId).toBe(RANDGEVAL.terugbellenVandaagMetUur);
  });

  it('een terugbelafspraak met uur in een vrij blok komt vooraan in dat blok', () => {
    const k = { ...lijst[0]!, terugbel: { ...lijst[0]!.terugbel!, uur: '11:45' } };
    const r2 = berekenBelmomenten(data.afspraken, [k, ...lijst.slice(1)], DAG, STANDAARD_INSTELLINGEN, null);
    expect(r2.momenten[1]!.kandidaten[0]!.contact.id).toBe(k.contact.id);
  });

  it('toont wat niet meer past als de dag vol zit', () => {
    const vol = berekenBelmomenten([afspraak('08:30', '17:50')], lijst, DAG, STANDAARD_INSTELLINGEN, null);
    expect(vol.capaciteit).toBe(0);
    expect(vol.pastNiet.length).toBe(lijst.length);
  });

  it('vandaag telt enkel de tijd vanaf nu', () => {
    const r3 = berekenBelmomenten(data.afspraken, lijst, DAG, STANDAARD_INSTELLINGEN, opDagUur(DAG, '11:50'));
    expect(r3.momenten.map(blokTekst)[0]).toBe('11:50–12:30');
  });

  it('een hele-dag-afspraak blokkeert de dag', () => {
    const r4 = berekenBelmomenten([afspraak('00:00', '23:59', { heleDag: true, titel: 'Opleiding' })], lijst, DAG, STANDAARD_INSTELLINGEN, null);
    expect(r4.heleDag?.titel).toBe('Opleiding');
    expect(r4.momenten).toEqual([]);
  });

  it('overlappende afspraken en instelbare werkuren', () => {
    const inst: Instellingen = { ...STANDAARD_INSTELLINGEN, werkdag: { ...STANDAARD_INSTELLINGEN.werkdag, start: '09:00', einde: '12:00', pauzes: [], reisbufferMinuten: 0 } };
    const r5 = berekenBelmomenten([afspraak('09:30', '10:30'), afspraak('10:00', '11:00')], lijst, DAG, inst, null);
    expect(r5.momenten.map(blokTekst)).toEqual(['09:00–09:30', '11:00–12:00']);
  });

  it('klopt rond de zomertijdwissel (25/10/2026)', () => {
    const dag = '2026-10-26';
    const inst: Instellingen = { ...STANDAARD_INSTELLINGEN, werkdag: { ...STANDAARD_INSTELLINGEN.werkdag, pauzes: [], reisbufferMinuten: 0 } };
    const a: Afspraak = { ...afspraak('10:00', '11:00'), start: opDagUur(dag, '10:00'), einde: opDagUur(dag, '11:00') };
    const r6 = berekenBelmomenten([a], [], dag, inst, null);
    expect(r6.momenten.map(blokTekst)).toEqual(['08:30–10:00', '11:00–18:00']);
  });
});
