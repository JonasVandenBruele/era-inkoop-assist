// Wie niet opnam, verdwijnt niet maar zakt naar "Wacht op antwoord" (Jonas, 6/10/2026).
import { describe, expect, it } from 'vitest';
import { genereerTestdata, RANDGEVAL } from '../../fixtures/testdata';
import { STANDAARD_INSTELLINGEN } from '../core/settings/schema';
import type { Belpoging } from './model';
import { berekenBellijst } from './prioriteit';
import { wachtOpAntwoord } from './dagplan';

const VANDAAG = '2026-10-13';
const data = genereerTestdata({ testdatum: `${VANDAAG}T07:30` });
const wouters = data.contacten.find((c) => c.externId === RANDGEVAL.warmOverRitme)!;
const poging = (dag: string, uur: string, uitkomst: Belpoging['uitkomst'] = 'geen_antwoord'): Belpoging => ({
  id: `${dag}-${uur}`, contactId: wouters.id, tijdstip: new Date(`${dag}T${uur}:00+02:00`), uitkomst, kanaal: 'telefoon',
  isInhoudelijk: false, notitie: null, volgendeStap: null, ongedaanOp: null, isTestdata: true,
});

function wacht(pogingen: Belpoging[], vandaag = VANDAAG) {
  const belpogingen = [...data.belpogingen, ...pogingen];
  const lijst = berekenBellijst({ ...data, belpogingen, instellingen: STANDAARD_INSTELLINGEN, vandaag });
  return { lijst, wacht: wachtOpAntwoord(lijst, belpogingen, vandaag) };
}

describe('wacht op antwoord', () => {
  it('geen antwoord vandaag: niet meer op de bellijst, wel onderaan bij "wacht op antwoord"', () => {
    const { lijst, wacht: w } = wacht([poging(VANDAAG, '10:42')]);
    expect(lijst.vandaag.some((k) => k.contact.id === wouters.id)).toBe(false);
    const x = w.find((y) => y.contact.id === wouters.id)!;
    expect(x.pogingen[0]!.uitkomst).toBe('geen_antwoord');
    expect(x.detail).toContain('volgende poging');
  });

  it('nieuwste poging eerst', () => {
    const { wacht: w } = wacht([poging(VANDAAG, '10:42')]);
    const tijden = w.map((x) => x.pogingen[0]!.tijdstip.getTime());
    expect([...tijden].sort((a, b) => b - a)).toEqual(tijden);
  });

  it('na een gesprek (bv. de klant belde terug) staat hij er niet meer', () => {
    const { wacht: w } = wacht([poging(VANDAAG, '10:42'), { ...poging(VANDAAG, '11:40', 'gesproken'), isInhoudelijk: true }]);
    expect(w.some((x) => x.contact.id === wouters.id)).toBe(false);
  });

  it('enkel wie vandaag niet opnam; de dag erna geldt de gewone herplanning', () => {
    expect(wacht([poging('2026-10-12', '10:00')]).wacht.some((x) => x.contact.id === wouters.id)).toBe(false);
    // De volgende werkdag staat hij gewoon weer op de bellijst (bestaande logica).
    expect(wacht([poging('2026-10-12', '10:00')]).lijst.vandaag.some((k) => k.contact.id === wouters.id)).toBe(true);
    const twee = wacht([poging(VANDAAG, '09:00'), poging(VANDAAG, '14:00')]).wacht.find((x) => x.contact.id === wouters.id)!;
    expect(twee.pogingen.length).toBe(2);
  });

  it('ook wie vandaag voor de derde keer niet opnam (morgen: handmatig beoordelen)', () => {
    const p = [poging('2026-10-08', '10:00'), poging('2026-10-12', '10:00'), poging(VANDAAG, '10:00')];
    const { lijst, wacht: w } = wacht(p);
    expect(lijst.handmatigBeoordelen.some((k) => k.contact.id === wouters.id)).toBe(true);
    expect(w.some((x) => x.contact.id === wouters.id)).toBe(true);
  });
});
