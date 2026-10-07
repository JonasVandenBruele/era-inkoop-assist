// Dubbele prospects (Jonas, 6/10/2026): één lead mét adres en een taak in november, één zonder adres en zonder taak.
// De tweede mag niet "volgens ritme" op de lijst komen.
import { describe, expect, it } from 'vitest';
import { genereerTestdata, RANDGEVAL } from '../../fixtures/testdata';
import { STANDAARD_INSTELLINGEN } from '../core/settings/schema';
import type { Bronactiviteit, Contact } from './model';
import { berekenBellijst } from './prioriteit';
import { dubbelReden, normTelefoon, personen, samengevoegd } from './dubbels';

const VANDAAG = '2026-10-13';
const data = genereerTestdata({ testdatum: `${VANDAAG}T07:30` });
const basis = data.contacten.find((c) => c.externId === RANDGEVAL.warmOverRitme)!; // staat normaal op de lijst (groep D)

const metAdres: Contact = { ...basis, id: 'dubbel-a', externId: 'LEAD-A', straat: 'Voskapelstraat 156', postcode: '1933', gemeente: 'Sterrebeek', telefoons: [{ nummer: '+32 490 19 19 59', label: 'gsm' }], email: 'n@voorbeeld.test' };
const zonderAdres: Contact = { ...basis, id: 'dubbel-b', externId: 'LEAD-B', straat: null, postcode: '1933', gemeente: null, telefoons: [{ nummer: '0490/19.19.59', label: 'gsm' }], email: null };
const taakNovember: Bronactiviteit = {
  id: 't-nov', bron: 'eraforce_mirror', externId: 'T-NOV', gebeurdOp: new Date('2026-09-01T09:00:00Z'), gewijzigdInBronOp: null, geimporteerdOp: new Date('2026-10-13T05:00:00Z'), isTestdata: true,
  type: 'taak', contactId: metAdres.id, pandId: null, taakSoort: 'terugbellen', vervaltOp: '2026-11-19', vervaltUur: null, taakAfgerond: false, auteur: 'Jonas', tekst: 'wanneer verhuizen?', kanaal: 'bellen',
};

function lijst(contacten: Contact[], activiteiten = data.activiteiten) {
  return berekenBellijst({ ...data, contacten, activiteiten, instellingen: STANDAARD_INSTELLINGEN, vandaag: VANDAAG });
}
const plaats = (l: ReturnType<typeof lijst>, id: string) =>
  [...l.vandaag, ...l.nietOpLijst].some((k) => k.contact.id === id) ? 'op lijst' : l.uitgesloten.find((u) => u.contact.id === id);

describe('dubbele prospects', () => {
  it('telefoonnummers in elke schrijfwijze', () => {
    expect(normTelefoon('+32 490 19 19 59')).toBe('0490191959');
    expect(normTelefoon('0032490191959')).toBe('0490191959');
    expect(normTelefoon('0490/19.19.59')).toBe('0490191959');
    expect(normTelefoon('123')).toBe('');
  });

  it('zelfde gsm = zelfde persoon', () => {
    const p = personen([metAdres, zonderAdres, ...data.contacten]);
    expect(p.get(zonderAdres.id)!.map((c) => c.id).sort()).toEqual([metAdres.id, zonderAdres.id]);
    expect(dubbelReden(metAdres, zonderAdres)).toBe('telefoon');
  });

  it('de prospect zonder adres komt niet op de lijst als de andere een taak in november heeft', () => {
    const l = lijst([...data.contacten, metAdres, zonderAdres], [...data.activiteiten, taakNovember]);
    const u = plaats(l, zonderAdres.id);
    expect(u).toMatchObject({ reden: 'terugbel_later' });
    expect((u as { detail: string }).detail).toContain('Dubbele prospect: volgende stap op');
    expect((u as { detail: string }).detail).toContain('Voskapelstraat 156');
    expect(plaats(l, metAdres.id)).toMatchObject({ reden: 'terugbel_later' });
    expect(l.zonderTimeline.some((c) => c.id === zonderAdres.id)).toBe(false);
  });

  it('zonder taak: maar één van beide op de lijst', () => {
    const l = lijst([...data.contacten, metAdres, zonderAdres]);
    const op = [metAdres.id, zonderAdres.id].filter((id) => plaats(l, id) === 'op lijst');
    expect(op).toHaveLength(1);
  });

  it('een belverbod op de ene geldt voor de andere', () => {
    const l = lijst([...data.contacten, { ...metAdres, nietBellenBron: true }, zonderAdres]);
    expect(plaats(l, zonderAdres.id)).toMatchObject({ reden: 'belverbod' });
  });

  it('gegevens van beide samen: adres, e-mail en alle nummers', () => {
    const extra = { ...zonderAdres, telefoons: [...zonderAdres.telefoons, { nummer: '02 720 00 00', label: 'vast' as const }] };
    const s = samengevoegd(extra, [metAdres]);
    expect(s.id).toBe(zonderAdres.id);
    expect(s.straat).toBe('Voskapelstraat 156');
    expect(s.email).toBe('n@voorbeeld.test');
    expect(s.telefoons.map((t) => t.nummer)).toEqual(['0490/19.19.59', '02 720 00 00']);
  });

  it('op de bellijst: de kaart toont het samengevoegde contact en het laatste gesprek van de andere prospect', () => {
    const gesprek: Bronactiviteit = { ...taakNovember, id: 'g1', externId: 'G1', type: 'gesprek', taakSoort: null, vervaltOp: null, taakAfgerond: true, tekst: 'Wil verhuizen naar een appartement, eerst iets vinden.', gebeurdOp: new Date('2026-10-12T09:00:00Z') };
    const l = lijst([...data.contacten, metAdres, zonderAdres], [...data.activiteiten, gesprek]);
    // Gisteren gesproken (op de andere prospect): geen van beide is vandaag aan de beurt.
    expect(plaats(l, zonderAdres.id)).toMatchObject({ reden: 'nog_niet_aan_de_beurt' });
    const zonder = lijst([...data.contacten, metAdres, zonderAdres]);
    const k = [...zonder.vandaag, ...zonder.nietOpLijst].find((x) => x.contact.id === metAdres.id || x.contact.id === zonderAdres.id)!;
    expect(k.contact.straat).toBe('Voskapelstraat 156');
    expect(k.contact.email).toBe('n@voorbeeld.test');
  });
});

describe('afspraak gepland (Jonas, 7/10/2026)', () => {
  it('een afspraak later deze week: niet bellen, ook niet op de dubbele prospect', () => {
    const l = lijst(data.contacten);
    const pauwels = data.contacten.find((c) => c.externId === RANDGEVAL.afspraakLater)!;
    expect(plaats(l, pauwels.id)).toMatchObject({ reden: 'afspraak_gepland' });
    expect((plaats(l, pauwels.id) as { detail: string }).detail).toMatch(/^Afspraak gepland op .* om 09:30: Schatting app\. Pauwels\.$/);
    expect(l.zonderTimeline.some((c) => c.id === pauwels.id)).toBe(false);

    const afspraak = data.afspraken.find((a) => a.contactId === pauwels.id)!;
    const l2 = berekenBellijst({ ...data, contacten: [...data.contacten, metAdres, zonderAdres], afspraken: [...data.afspraken, { ...afspraak, id: 'x', contactId: metAdres.id }], instellingen: STANDAARD_INSTELLINGEN, vandaag: VANDAAG });
    expect(plaats(l2, zonderAdres.id)).toMatchObject({ reden: 'afspraak_gepland' });
  });
});
