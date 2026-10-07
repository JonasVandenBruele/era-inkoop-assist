// Te koop gezet (Jonas, 6/10/2026): de dag na de ontdekking een bericht met veel succes, met de hoogste urgentie.
import { describe, expect, it } from 'vitest';
import { genereerTestdata, RANDGEVAL } from '../../fixtures/testdata';
import { STANDAARD_INSTELLINGEN } from '../core/settings/schema';
import type { Belpoging, Marktsignaal } from './model';
import { berekenBellijst, type BellijstInvoer } from './prioriteit';
import { berichtDag, signaalTekst, succesbericht } from './marktsignaal';
import { berichtTekst } from './berichten';

const VANDAAG = '2026-10-13'; // dinsdag
const data = genereerTestdata({ testdatum: `${VANDAAG}T07:30` });
const maes = data.contacten.find((c) => c.externId === RANDGEVAL.koudNogNietAanDeBeurt)!;

const signaal = (extra: Partial<Marktsignaal> = {}): Marktsignaal => ({
  id: 's1',
  contactId: maes.id,
  bron: 'immoweb',
  externId: '21887397',
  verkoper: 'particulier',
  makelaar: null,
  vraagprijs: 395000,
  onlineSinds: '2026-10-10',
  url: 'https://www.immoweb.be/nl/zoekertje/huis/te-koop/x/3070/21887397',
  overeenkomst: 'adres',
  status: 'te_koop',
  eerstGezienOp: new Date('2026-10-12T19:05:00+02:00'), // maandagavond
  laatstGezienOp: new Date('2026-10-13T07:05:00+02:00'),
  afgehandeldOp: null,
  ...extra,
});

function lijst(extra: Partial<BellijstInvoer> = {}) {
  return berekenBellijst({
    contacten: data.contacten,
    activiteiten: data.activiteiten,
    belpogingen: data.belpogingen,
    afspraken: data.afspraken,
    contacthooks: data.contacthooks,
    instellingen: STANDAARD_INSTELLINGEN,
    vandaag: VANDAAG,
    ...extra,
  });
}

describe('te koop gezet', () => {
  it('zonder signaal is Mevr. Maes nog niet aan de beurt', () => {
    expect(lijst().uitgesloten.find((u) => u.contact.id === maes.id)?.reden).toBe('nog_niet_aan_de_beurt');
  });

  it('de dag na de ontdekking: groep S, op de lijst, meteen na de afspraken met uur', () => {
    const l = lijst({ marktsignalen: [signaal()] });
    const k = l.vandaag.find((x) => x.contact.id === maes.id)!;
    expect(k.groep).toBe('S');
    expect(signaalTekst(k.signaal!)).toContain('zelf te koop op Immoweb');
    expect(k.reden).toContain('veel succes');
    expect(['whatsapp', 'bericht', 'mail', 'brief', 'bellen']).toContain(k.advies.kanaal);
    const groepen = l.vandaag.map((x) => x.groep);
    expect(groepen.indexOf('S')).toBeLessThanOrEqual(groepen.filter((g) => g === 'A').length);
  });

  it('niet dezelfde dag als de ontdekking (het bericht vertrekt de dag erna)', () => {
    const s = signaal({ eerstGezienOp: new Date('2026-10-13T07:05:00+02:00') });
    expect(berichtDag(s)).toBe('2026-10-14');
    expect(lijst({ marktsignalen: [s] }).vandaag.some((x) => x.groep === 'S')).toBe(false);
  });

  it('vrijdagavond ontdekt → maandag', () => {
    expect(berichtDag({ eerstGezienOp: new Date('2026-10-16T19:00:00+02:00') })).toBe('2026-10-19');
  });

  it('ook via een andere makelaar; past altijd op de lijst, ook boven het maximum', () => {
    const inst = { ...STANDAARD_INSTELLINGEN, maxPerDag: 1 };
    const l = lijst({ instellingen: inst, marktsignalen: [signaal({ verkoper: 'makelaar', makelaar: 'We Invest Leuven' })] });
    const k = l.vandaag.find((x) => x.contact.id === maes.id)!;
    expect(k.groep).toBe('S');
    expect(signaalTekst(k.signaal!)).toContain('te koop via We Invest Leuven');
  });

  it('verdwijnt na een bericht of als je het afhandelt', () => {
    const bericht: Belpoging = {
      id: 'b1', contactId: maes.id, tijdstip: new Date('2026-10-13T09:00:00+02:00'), uitkomst: 'bericht_verstuurd', kanaal: 'whatsapp',
      isInhoudelijk: false, notitie: null, volgendeStap: null, ongedaanOp: null, isTestdata: true,
    };
    const opgevolgd = lijst({ marktsignalen: [signaal()], belpogingen: [...data.belpogingen, bericht] });
    expect(opgevolgd.vandaag.some((x) => x.contact.id === maes.id && x.groep === 'S')).toBe(false);
    const af = lijst({ marktsignalen: [signaal({ afgehandeldOp: new Date('2026-10-13T08:00:00+02:00') })] });
    expect(af.vandaag.some((x) => x.groep === 'S')).toBe(false);
  });

  it('een belverbod blijft gelden', () => {
    const verbod = { id: 'v1', contactId: maes.id, reden: null, aangemaaktOp: new Date('2026-10-01'), ingetrokkenOp: null, isTestdata: true };
    const l = lijst({ marktsignalen: [signaal()], belverboden: [verbod as never] });
    expect(l.uitgesloten.find((u) => u.contact.id === maes.id)?.reden).toBe('belverbod');
  });

  it('verkocht of weg: geen bericht meer', () => {
    expect(lijst({ marktsignalen: [signaal({ status: 'verkocht' })] }).vandaag.some((x) => x.groep === 'S')).toBe(false);
  });

  it('succesbericht in Jonas’ stijl; het berichtpaneel stelt het voor', () => {
    const tekst = succesbericht({ voornaam: 'Olivier', achternaam: 'X', aanhef: 'Dhr.', aanspreekvormBron: 'je' }, { verkoper: 'particulier' });
    expect(tekst).toMatch(/^Dag Olivier, ik zag dat jullie woning te koop staat\./);
    expect(tekst).toContain('veel succes met de verkoop');
    expect(tekst).toMatch(/Jonas van ERA$/);
    const u = succesbericht({ voornaam: null, achternaam: 'Peeters', aanhef: 'Mevr.', aanspreekvormBron: 'u' }, { verkoper: 'makelaar' });
    expect(u).toMatch(/^Goeiedag mevrouw Peeters, ik zag dat uw woning/);
    const fr = succesbericht({ voornaam: 'Claire', achternaam: 'D', aanhef: 'Mevr.', aanspreekvormBron: null, taal: 'fr', taalWhatsapp: null }, { verkoper: 'makelaar' });
    expect(fr).toMatch(/^Bonjour Claire, .*beaucoup de succès/);
    const k = lijst({ marktsignalen: [signaal()] }).vandaag.find((x) => x.contact.id === maes.id)!;
    expect(berichtTekst({ kandidaat: k, kanaal: 'whatsapp', voornaamGebruiker: 'Jonas', organisatie: 'ERA' }).tekst).toContain('veel succes');
  });
});
