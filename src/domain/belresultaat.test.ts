import { describe, expect, it } from 'vitest';
import { genereerTestdata, RANDGEVAL } from '../../fixtures/testdata';
import { STANDAARD_INSTELLINGEN } from '../core/settings/schema';
import { verwerkBelresultaat, OngeldigBelresultaat, referentieCode, type Belresultaat, type BelresultaatInvoer } from './belresultaat';
import { berekenBellijst, type BellijstInvoer } from './prioriteit';
import { dagWeergave } from './dagplan';
import { maakDonnaConcept } from './donna';
import type { Belpoging } from './model';

const VANDAAG = '2026-10-13';
const NU = new Date('2026-10-13T09:15:00+02:00');
const data = genereerTestdata({ testdatum: `${VANDAAG}T07:30` });
const c = (ext: string) => data.contacten.find((x) => x.externId === ext)!;
let teller = 0;
const maakId = () => `00000000-0000-4000-a000-${String(++teller).padStart(12, '0')}`;

const resultaat = (ext: string, extra: Partial<BelresultaatInvoer>) =>
  verwerkBelresultaat({ contact: c(ext), uitkomst: 'gesproken', tijdstip: NU, maakId, ...extra });

/** Bellijst na het toepassen van belresultaten (zoals de app ze bewaart). */
function lijstNa(resultaten: Belresultaat[], vandaag = VANDAAG, extra: Partial<BellijstInvoer> = {}) {
  return berekenBellijst({
    contacten: data.contacten,
    activiteiten: data.activiteiten,
    belpogingen: [...data.belpogingen, ...resultaten.map((r) => r.belpoging)],
    afspraken: [...data.afspraken, ...resultaten.flatMap((r) => r.afspraken)],
    opvolgacties: resultaten.flatMap((r) => r.opvolgacties),
    belverboden: resultaten.flatMap((r) => r.belverboden),
    instellingen: STANDAARD_INSTELLINGEN,
    vandaag,
    ...extra,
  });
}
const plaats = (l: ReturnType<typeof berekenBellijst>, ext: string) => {
  if ([...l.vandaag, ...l.nietOpLijst].some((k) => k.contact.externId === ext)) return 'op lijst';
  if (l.handmatigBeoordelen.some((k) => k.contact.externId === ext)) return 'handmatig';
  return l.uitgesloten.find((u) => u.contact.externId === ext)?.reden ?? 'onbekend';
};

describe('belresultaten', () => {
  it('"gesproken" telt als inhoudelijk contact en haalt het contact van de lijst', () => {
    const r = resultaat(RANDGEVAL.warmOverRitme, { notitie: 'Voorstel besproken', volgendeStap: 'Referenties mailen' });
    expect(r.belpoging.isInhoudelijk).toBe(true);
    expect(plaats(lijstNa([r]), RANDGEVAL.warmOverRitme)).toBe('nog_niet_aan_de_beurt');
  });

  it('"geen antwoord" is geen inhoudelijk contact; nieuwe poging volgende werkdag', () => {
    const r = resultaat(RANDGEVAL.warmOverRitme, { uitkomst: 'geen_antwoord' });
    expect(r.belpoging.isInhoudelijk).toBe(false);
    expect(plaats(lijstNa([r]), RANDGEVAL.warmOverRitme)).toBe('wacht_na_geen_antwoord');
    expect(plaats(lijstNa([r], '2026-10-14'), RANDGEVAL.warmOverRitme)).toBe('op lijst');
  });

  it('nieuwe lead met 1× geen antwoord vandaag mag later vandaag nog eens', () => {
    const r = resultaat(RANDGEVAL.nieuweLeadVandaag, { uitkomst: 'geen_antwoord' });
    expect(plaats(lijstNa([r]), RANDGEVAL.nieuweLeadVandaag)).toBe('op lijst');
    const r2 = resultaat(RANDGEVAL.nieuweLeadVandaag, { uitkomst: 'geen_antwoord', tijdstip: new Date('2026-10-13T16:00:00+02:00') });
    expect(plaats(lijstNa([r, r2]), RANDGEVAL.nieuweLeadVandaag)).toBe('wacht_na_geen_antwoord');
  });

  it('"terugbellen op datum" maakt een lokale terugbelafspraak die meteen meetelt', () => {
    const r = resultaat(RANDGEVAL.warmOverRitme, { uitkomst: 'terugbellen', terugbelDag: '2026-10-20', terugbelUur: '14:00' });
    expect(r.opvolgacties).toHaveLength(1);
    const l = lijstNa([r]);
    expect(plaats(l, RANDGEVAL.warmOverRitme)).toBe('terugbel_later');
    const op20 = lijstNa([r], '2026-10-20');
    expect(op20.vandaag.find((k) => k.contact.externId === RANDGEVAL.warmOverRitme)?.groep).toBe('A');
  });

  it('een nieuwe lokale terugbelafspraak vervangt een oudere uit de bron', () => {
    // Mevr. Peeters had een terugbelafspraak vandaag 10:30; ze vraagt nu om volgende week.
    const r = resultaat(RANDGEVAL.terugbellenVandaagMetUur, { uitkomst: 'terugbellen', terugbelDag: '2026-10-19' });
    expect(plaats(lijstNa([r]), RANDGEVAL.terugbellenVandaagMetUur)).toBe('terugbel_later');
  });

  it('"afspraak gemaakt" bewaart een lokale afspraak, gekoppeld aan het contact', () => {
    const r = resultaat(RANDGEVAL.lauwOverRitme, { uitkomst: 'afspraak', afspraak: { dag: '2026-10-15', start: '10:00', duurMinuten: 60 } });
    expect(r.afspraken).toHaveLength(1);
    expect(r.afspraken[0]!.bron).toBe('lokaal');
    expect(r.afspraken[0]!.contactId).toBe(c(RANDGEVAL.lauwOverRitme).id);
    expect(plaats(lijstNa([r], '2026-10-15'), RANDGEVAL.lauwOverRitme)).toBe('afspraak_vandaag');
  });

  it('"niet meer bellen" sluit het contact blijvend uit', () => {
    const r = resultaat(RANDGEVAL.lauwOverRitme, { uitkomst: 'niet_meer_bellen', reden: 'Verkocht via notaris' });
    expect(plaats(lijstNa([r], '2027-06-01'), RANDGEVAL.lauwOverRitme)).toBe('belverbod');
  });

  it('weigert onmogelijke invoer met een begrijpelijke melding', () => {
    expect(() => resultaat(RANDGEVAL.warmOverRitme, { uitkomst: 'terugbellen' })).toThrow(OngeldigBelresultaat);
    expect(() => resultaat(RANDGEVAL.warmOverRitme, { uitkomst: 'terugbellen', terugbelDag: '2026-10-01' })).toThrow('verleden');
    expect(() => resultaat(RANDGEVAL.warmOverRitme, { uitkomst: 'afspraak' })).toThrow('dag en uur');
  });

  it('ongedaan maken: zonder de belpoging en gekoppelde records staat alles weer zoals voordien', () => {
    const r = resultaat(RANDGEVAL.warmOverRitme, { uitkomst: 'niet_meer_bellen' });
    const ongedaan: Belresultaat = {
      belpoging: { ...r.belpoging, ongedaanOp: NU },
      opvolgacties: r.opvolgacties.map((o) => ({ ...o, status: 'vervallen' as const })),
      afspraken: [],
      belverboden: r.belverboden.map((b) => ({ ...b, ingetrokkenOp: NU })),
    };
    expect(plaats(lijstNa([ongedaan]), RANDGEVAL.warmOverRitme)).toBe('op lijst');
  });

  it('referentiecode is kort en stabiel', () => {
    expect(referentieCode('7f3k0000-0000-4000-a000-000000000001')).toBe('DP-7F3K');
  });
});

describe('dagplan: lijst blijft stabiel tijdens de dag', () => {
  const basis = lijstNa([]);
  const eerste = dagWeergave(basis, null, data.belpogingen, data.contacten, VANDAAG);

  it('legt bij de eerste opening de lijst vast', () => {
    expect(eerste.nieuwPlan).toEqual(basis.vandaag.map((k) => k.contact.id));
    expect(eerste.actief.map((k) => k.contact.id)).toEqual(eerste.nieuwPlan);
  });

  it('wie gesproken is, verdwijnt naar "gebeld vandaag" en de lijst wordt niet aangevuld', () => {
    const plan = { contactIds: eerste.nieuwPlan! };
    const d = basis.vandaag.find((k) => k.groep === 'D')!;
    const r = resultaat(d.contact.externId!, {});
    const na = dagWeergave(lijstNa([r]), plan, [...data.belpogingen, r.belpoging], data.contacten, VANDAAG);
    expect(na.actief.length).toBe(eerste.actief.length - 1);
    expect(na.actief.some((k) => k.contact.id === d.contact.id)).toBe(false);
    expect(na.gebeld.map((g) => g.contact.id)).toEqual([d.contact.id]);
    expect(na.nieuwPlan).toBeNull();
  });

  it('volgorde blijft gelijk, ook als scores intussen veranderen', () => {
    const plan = { contactIds: [...eerste.nieuwPlan!].reverse() };
    const na = dagWeergave(basis, plan, data.belpogingen, data.contacten, VANDAAG);
    const zonderTop = na.actief.filter((k) => k.groep !== 'A' && k.groep !== 'pin').map((k) => k.contact.id);
    expect(zonderTop).toEqual(plan.contactIds.filter((id) => zonderTop.includes(id)));
  });
});

describe('Donna-overzicht', () => {
  it('bundelt de resultaten van de dag, met referentie en testdata-waarschuwing', () => {
    const r1 = resultaat(RANDGEVAL.warmOverRitme, { notitie: 'Voorstel ok', volgendeStap: 'Referenties sturen' });
    const r2 = resultaat(RANDGEVAL.lauwOverRitme, { uitkomst: 'terugbellen', terugbelDag: '2026-10-20', terugbelUur: '10:00' });
    const r3 = resultaat(RANDGEVAL.nieuweLeadVandaag, { uitkomst: 'geen_antwoord' });
    const alle = [r1, r2, r3];
    const ongedaan: Belpoging = { ...resultaat(RANDGEVAL.koudLangGeleden, {}).belpoging, ongedaanOp: NU };
    const concept = maakDonnaConcept({
      dag: VANDAAG,
      belpogingen: [...alle.map((r) => r.belpoging), ongedaan],
      contacten: data.contacten,
      opvolgacties: alle.flatMap((r) => r.opvolgacties),
      afspraken: [],
      belverboden: [],
      voornaam: 'Jonas',
      metReferentie: true,
    });
    expect(concept.aantalInhoudelijk).toBe(2);
    expect(concept.aantalGeenAntwoord).toBe(1);
    expect(concept.tekst).toContain('TESTDATA');
    expect(concept.tekst).toContain('Pieter Wouters — FIC-C-004');
    expect(concept.tekst).toContain('Volgende stap: Referenties sturen');
    expect(concept.tekst).toContain('Terugbellen op di 20 okt om 10:00.');
    expect(concept.tekst).toContain(referentieCode(r1.belpoging.id));
    expect(concept.tekst).toContain('Geen antwoord:');
    expect(concept.tekst).not.toContain('Maes'); // ongedaan gemaakt
  });
});
