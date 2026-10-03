import { describe, expect, it } from 'vitest';
import { afsprakenVanDag, heeftTelefoon, historiek, laatsteInhoudelijkContact } from './overzicht';
import { genereerTestdata, RANDGEVAL } from '../../fixtures/testdata';
import type { Belpoging } from './model';

const data = genereerTestdata({ testdatum: '2026-10-13T07:30' });
const c = (ext: string) => data.contacten.find((x) => x.externId === ext)!;

describe('afspraken van de dag', () => {
  const lijst = afsprakenVanDag(data.afspraken, '2026-10-13');

  it('toont enkel afspraken van die dag, op tijd gesorteerd', () => {
    expect(lijst.map((x) => x.afspraak.titel)).toEqual([
      'Plaatsbezoek app. Smets',
      'Teamoverleg kantoor',
      'Schatting woning Michiels',
      'Bezichtiging Kerkstraat 12, Aalst',
    ]);
  });

  it('markeert overlappende afspraken', () => {
    expect(lijst.filter((x) => x.overlapt).map((x) => x.afspraak.titel)).toEqual(['Plaatsbezoek app. Smets', 'Teamoverleg kantoor']);
  });

  it('zet hele-dag-afspraken bovenaan en niet als overlap', () => {
    const morgen = afsprakenVanDag(data.afspraken, '2026-10-14');
    expect(morgen[0]!.afspraak.heleDag).toBe(true);
    expect(morgen[0]!.overlapt).toBe(false);
  });
});

describe('laatste inhoudelijk contact', () => {
  it('een belpoging zonder antwoord telt niet', () => {
    const claes = c(RANDGEVAL.nieuweLeadLokaalGeenAntwoord);
    expect(laatsteInhoudelijkContact(claes.id, data.activiteiten, data.belpogingen)).toBeNull();
  });

  it('neemt het gesprek uit de bron', () => {
    const wouters = c(RANDGEVAL.warmOverRitme);
    const l = laatsteInhoudelijkContact(wouters.id, data.activiteiten, data.belpogingen)!;
    expect(l.herkomst).toBe('bron');
    expect(l.tijdstip.toISOString().slice(0, 10)).toBe('2026-09-22');
  });

  it('een recenter lokaal gesprek telt meteen mee, ook als de bron nog niets weet', () => {
    const wouters = c(RANDGEVAL.warmOverRitme);
    const lokaal: Belpoging = {
      id: 'x', contactId: wouters.id, tijdstip: new Date('2026-10-12T15:00:00Z'), uitkomst: 'gesproken',
      isInhoudelijk: true, notitie: 'Voorstel besproken', volgendeStap: null, ongedaanOp: null, isTestdata: true,
    };
    const l = laatsteInhoudelijkContact(wouters.id, data.activiteiten, [...data.belpogingen, lokaal])!;
    expect(l.herkomst).toBe('lokaal');
    expect(l.tekst).toBe('Voorstel besproken');
  });

  it('een ongedaan gemaakte belpoging telt niet', () => {
    const wouters = c(RANDGEVAL.warmOverRitme);
    const ongedaan: Belpoging = {
      id: 'y', contactId: wouters.id, tijdstip: new Date('2026-10-12T15:00:00Z'), uitkomst: 'gesproken',
      isInhoudelijk: true, notitie: null, volgendeStap: null, ongedaanOp: new Date('2026-10-12T15:05:00Z'), isTestdata: true,
    };
    expect(laatsteInhoudelijkContact(wouters.id, data.activiteiten, [ongedaan])!.herkomst).toBe('bron');
  });
});

describe('overige', () => {
  it('herkent een contact zonder telefoonnummer', () => {
    expect(heeftTelefoon(c(RANDGEVAL.zonderTelefoon))).toBe(false);
    expect(heeftTelefoon(c(RANDGEVAL.warmOverRitme))).toBe(true);
  });

  it('historiek combineert bron en lokale pogingen, nieuwste eerst', () => {
    const jacobs = c(RANDGEVAL.nieuweLeadDrieKeerGeenAntwoord);
    const h = historiek(jacobs.id, data.activiteiten, data.belpogingen);
    expect(h.map((x) => x.soort)).toEqual(['belpoging', 'belpoging', 'belpoging', 'activiteit']);
  });
});
