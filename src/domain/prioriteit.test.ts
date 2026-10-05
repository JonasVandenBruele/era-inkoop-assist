// Acceptatietests fase 2: de voorbeelden uit PLAN.md §5.4 moeten exact zo uitkomen.
import { describe, expect, it } from 'vitest';
import { genereerTestdata, RANDGEVAL } from '../../fixtures/testdata';
import { STANDAARD_INSTELLINGEN, type Instellingen } from '../core/settings/schema';
import type { Belpoging, Bronactiviteit, Contact } from './model';
import { berekenBellijst, type BellijstInvoer, type Kandidaat, type Planningskeuze } from './prioriteit';
import { standaardOpeningszin } from './openingszin';

const VANDAAG = '2026-10-13';
const data = genereerTestdata({ testdatum: `${VANDAAG}T07:30` });
const contact = (ext: string) => data.contacten.find((c) => c.externId === ext)!;

function invoer(extra: Partial<BellijstInvoer> = {}): BellijstInvoer {
  return {
    contacten: data.contacten,
    activiteiten: data.activiteiten,
    belpogingen: data.belpogingen,
    afspraken: data.afspraken,
    instellingen: STANDAARD_INSTELLINGEN,
    vandaag: VANDAAG,
    ...extra,
  };
}
const lijst = berekenBellijst(invoer());
const alleKandidaten = [...lijst.vandaag, ...lijst.nietOpLijst];
const vind = (ext: string): Kandidaat | undefined =>
  [...alleKandidaten, ...lijst.nummerZoeken, ...lijst.handmatigBeoordelen].find((k) => k.contact.externId === ext);
const uitgesloten = (ext: string) => lijst.uitgesloten.find((u) => u.contact.externId === ext);

describe('voorbeelden uit PLAN.md §5.4', () => {
  it('Mevr. Peeters: gepland vandaag met uur → groep A, bovenaan', () => {
    const k = vind(RANDGEVAL.terugbellenVandaagMetUur)!;
    expect(k.groep).toBe('A');
    expect(k.reden).toBe('Terugbelafspraak vandaag om 10:30');
    expect(lijst.vandaag[0]!.contact.externId).toBe(RANDGEVAL.terugbellenVandaagMetUur);
  });

  it('Dhr. Claes: nieuwe lead van gisteren met 1× geen antwoord → groep B', () => {
    const k = vind(RANDGEVAL.nieuweLeadLokaalGeenAntwoord)!;
    expect(k.groep).toBe('B');
    expect(k.pogingenZonderAntwoord).toBe(1);
  });

  it('Fam. Janssens: terugbelafspraak van vrijdag → groep C, 2 werkdagen verstreken', () => {
    const k = vind(RANDGEVAL.terugbellenVerstreken)!;
    expect(k.groep).toBe('C');
    expect(k.reden).toBe('Terugbelafspraak was voor vr 9 okt — 2 werkdagen verstreken');
  });

  it('Dhr. Wouters: warm zonder opvolgtaak, 21 dagen, horizon kort → 60 + 15 + 40 = 115', () => {
    const k = vind(RANDGEVAL.warmOverRitme)!;
    expect(k.groep).toBe('D');
    expect(k.onderdelen.map((o) => o.punten)).toEqual([60, 15, 40]);
    expect(k.score).toBe(115);
    expect(k.reden).toContain('geen opvolgtaak');
  });

  it('Mevr. Maes: koud, 200 dagen (ritme 180) → 28', () => {
    expect(vind(RANDGEVAL.koudLangGeleden)!.score).toBe(28);
  });

  it('Dhr. Dubois: lauw, 50 dagen (ritme 60), horizon middel, Realo → 21 + 8 + 10 + 10 = 49', () => {
    const k = vind(RANDGEVAL.lauwOverRitme)!;
    expect(k.onderdelen.map((o) => o.punten)).toEqual([21, 8, 10, 10]);
    expect(k.score).toBe(49);
  });

  it('zonder hook gaat een lauwe prospect vóór een koude die lang niets hoorde', () => {
    const d = alleKandidaten.filter((k) => k.groep === 'D').map((k) => k.contact.externId);
    expect(d.indexOf(RANDGEVAL.lauwOverRitme)).toBeLessThan(d.indexOf(RANDGEVAL.koudLangGeleden));
  });

  it('met een hook (+20) komt de koude prospect (28 + 20 = 48) vóór een lauwe die net aan de beurt is (25 + 8 + 10 = 43)', () => {
    const maes = contact(RANDGEVAL.koudLangGeleden);
    const haak = { id: 'h', contactId: maes.id, pandId: null, straat: null, gemeente: null, soort: 'buurt' as const, onderwerp: 'Verkoop in de straat', detail: null, bron: null, geldigVanaf: VANDAAG, geldigTot: null, gevoelig: false, aangemaaktOp: new Date() };
    const k = berekenBellijst(invoer({ haken: [haak] })).vandaag.concat(berekenBellijst(invoer({ haken: [haak] })).nietOpLijst).find((x) => x.contact.id === maes.id)!;
    expect(k.score).toBe(48);
    expect(k.score).toBeGreaterThan(25 + 8 + 10);
  });

  it('een vergeten belofte (groep C) komt vóór een nieuwe lead (groep B)', () => {
    const groepen = lijst.vandaag.map((k) => k.groep);
    expect(groepen.indexOf('C')).toBeLessThan(groepen.indexOf('B'));
  });

  it('een nieuwe lead krijgt maar 3 dagen voorrang', () => {
    const later = berekenBellijst(invoer({ vandaag: '2026-10-17' })); // Claes kwam binnen op 12/10
    const k = [...later.vandaag, ...later.nietOpLijst, ...later.handmatigBeoordelen].find((x) => x.contact.externId === RANDGEVAL.nieuweLeadLokaalGeenAntwoord);
    expect(k?.groep).not.toBe('B');
  });

  it('prospects zonder geplande volgende stap worden enkel geteld (Jonas werkt ze af via zijn dashboard)', () => {
    expect(lijst.zonderTimeline.length).toBeGreaterThan(0);
    expect(lijst.zonderTimeline.some((x) => x.externId === RANDGEVAL.terugbellenNaMaanden)).toBe(false); // heeft een terugbelafspraak
    expect(lijst.zonderTimeline.some((x) => x.nietBellenBron)).toBe(false);
  });

  it('Mevr. Willems: koud, 60 dagen → nog niet aan de beurt', () => {
    expect(uitgesloten(RANDGEVAL.koudNogNietAanDeBeurt)?.reden).toBe('nog_niet_aan_de_beurt');
  });

  it('Dhr. Mertens: belverbod → uitgesloten, ook als hij vastgepind is', () => {
    const mertens = contact(RANDGEVAL.nietMeerBellen);
    const pin: Planningskeuze = { id: 'p', contactId: mertens.id, soort: 'vastpinnen', voorDag: VANDAAG, totDag: null, ongedaanOp: null };
    const l = berekenBellijst(invoer({ keuzes: [pin] }));
    expect(l.uitgesloten.find((u) => u.contact.id === mertens.id)?.reden).toBe('belverbod');
    expect(l.pinGeweigerd.map((p) => p.contact.id)).toEqual([mertens.id]);
    expect([...l.vandaag, ...l.nietOpLijst].some((k) => k.contact.id === mertens.id)).toBe(false);
  });

  it('Fam. Goossens: terugbellen na nieuwjaar → onzichtbaar tot die datum', () => {
    expect(uitgesloten(RANDGEVAL.terugbellenNaMaanden)?.reden).toBe('terugbel_later');
    const inJanuari = berekenBellijst(invoer({ vandaag: '2027-01-04' }));
    expect(inJanuari.uitgesloten.find((u) => u.contact.externId === RANDGEVAL.terugbellenNaMaanden)).toBeUndefined();
  });
});

describe('harde regels en aparte lijsten', () => {
  it('contact zonder telefoonnummer staat bij "Nummer zoeken", niet op de bellijst', () => {
    expect(lijst.nummerZoeken.map((k) => k.contact.externId)).toContain(RANDGEVAL.zonderTelefoon);
    expect(alleKandidaten.some((k) => k.contact.externId === RANDGEVAL.zonderTelefoon)).toBe(false);
  });

  it('nieuwe lead met 3× geen antwoord → "Handmatig beoordelen"', () => {
    expect(lijst.handmatigBeoordelen.map((k) => k.contact.externId)).toContain(RANDGEVAL.nieuweLeadDrieKeerGeenAntwoord);
  });

  it('contact met afspraak vandaag staat niet op de bellijst', () => {
    expect(uitgesloten(RANDGEVAL.afspraakVandaag)?.reden).toBe('afspraak_vandaag');
  });

  it('terugbelafspraak vandaag zonder uur → groep C', () => {
    expect(vind(RANDGEVAL.terugbellenVandaagZonderUur)?.groep).toBe('C');
  });

  it('geen enkel contact staat dubbel', () => {
    const ids = [...alleKandidaten, ...lijst.nummerZoeken, ...lijst.handmatigBeoordelen, ...lijst.uitgesloten].map((k) => k.contact.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(data.contacten.length);
  });

  it('vandaag overslaan geldt enkel vandaag; uitstellen tot de gekozen datum', () => {
    const wouters = contact(RANDGEVAL.warmOverRitme);
    const keuzes: Planningskeuze[] = [{ id: 'k', contactId: wouters.id, soort: 'vandaag_overslaan', voorDag: VANDAAG, totDag: null, ongedaanOp: null }];
    expect(berekenBellijst(invoer({ keuzes })).uitgesloten.find((u) => u.contact.id === wouters.id)?.reden).toBe('vandaag_overgeslagen');
    expect(berekenBellijst(invoer({ keuzes, vandaag: '2026-10-14' })).uitgesloten.find((u) => u.contact.id === wouters.id)).toBeUndefined();

    const uitstel: Planningskeuze[] = [{ id: 'u', contactId: wouters.id, soort: 'uitstellen', voorDag: null, totDag: '2026-10-20', ongedaanOp: null }];
    expect(berekenBellijst(invoer({ keuzes: uitstel, vandaag: '2026-10-19' })).uitgesloten.find((u) => u.contact.id === wouters.id)?.reden).toBe('uitgesteld');
    expect(berekenBellijst(invoer({ keuzes: uitstel, vandaag: '2026-10-20' })).uitgesloten.find((u) => u.contact.id === wouters.id)).toBeUndefined();
  });

  it('een ongedane keuze telt niet meer', () => {
    const wouters = contact(RANDGEVAL.warmOverRitme);
    const keuzes: Planningskeuze[] = [{ id: 'k', contactId: wouters.id, soort: 'vandaag_overslaan', voorDag: VANDAAG, totDag: null, ongedaanOp: new Date() }];
    expect(berekenBellijst(invoer({ keuzes })).uitgesloten.find((u) => u.contact.id === wouters.id)).toBeUndefined();
  });

  it('vastgepind contact dat nog niet aan de beurt is, komt toch op de lijst', () => {
    const willems = contact(RANDGEVAL.koudNogNietAanDeBeurt);
    const keuzes: Planningskeuze[] = [{ id: 'p', contactId: willems.id, soort: 'vastpinnen', voorDag: VANDAAG, totDag: null, ongedaanOp: null }];
    const l = berekenBellijst(invoer({ keuzes }));
    const k = l.vandaag.find((x) => x.contact.id === willems.id)!;
    expect(k.groep).toBe('pin');
    expect(l.vandaag.indexOf(k)).toBe(1); // direct na groep A
  });

  it('lokaal belverbod sluit uit, ook als de bron niets weet', () => {
    const wouters = contact(RANDGEVAL.warmOverRitme);
    const l = berekenBellijst(invoer({ belverboden: [{ contactId: wouters.id, ingetrokkenOp: null }] }));
    expect(l.uitgesloten.find((u) => u.contact.id === wouters.id)?.reden).toBe('belverbod');
  });
});

describe('herplanning na geen antwoord (startwaarden 1, 2, 4 werkdagen)', () => {
  const wouters = contact(RANDGEVAL.warmOverRitme);
  const poging = (dag: string, uur = '10:00'): Belpoging => ({
    id: `${dag}-${uur}`, contactId: wouters.id, tijdstip: new Date(`${dag}T${uur}:00+02:00`), uitkomst: 'geen_antwoord',
    isInhoudelijk: false, notitie: null, volgendeStap: null, ongedaanOp: null, isTestdata: true,
  });
  const status = (pogingen: Belpoging[], vandaag: string) => {
    const l = berekenBellijst(invoer({ belpogingen: [...data.belpogingen, ...pogingen], vandaag }));
    if ([...l.vandaag, ...l.nietOpLijst].some((k) => k.contact.id === wouters.id)) return 'op lijst';
    if (l.handmatigBeoordelen.some((k) => k.contact.id === wouters.id)) return 'handmatig';
    return l.uitgesloten.find((u) => u.contact.id === wouters.id)?.reden;
  };

  it('na 1× geen antwoord: niet meer vandaag, wel de volgende werkdag', () => {
    expect(status([poging('2026-10-13')], '2026-10-13')).toBe('wacht_na_geen_antwoord');
    expect(status([poging('2026-10-13')], '2026-10-14')).toBe('op lijst');
  });

  it('vrijdag geen antwoord → maandag opnieuw', () => {
    expect(status([poging('2026-10-16')], '2026-10-19')).toBe('op lijst');
  });

  it('na 2×: 2 werkdagen wachten', () => {
    // (Wouters heeft op 15/10 een afspraak in de testdata, daarom de week erna.)
    const p = [poging('2026-10-19'), poging('2026-10-20')];
    expect(status(p, '2026-10-21')).toBe('wacht_na_geen_antwoord');
    expect(status(p, '2026-10-22')).toBe('op lijst');
  });

  it('na 3× op rij: geen automatische poging meer, handmatig beoordelen', () => {
    expect(status([poging('2026-10-13'), poging('2026-10-14'), poging('2026-10-16')], '2026-10-26')).toBe('handmatig');
  });

  it('een inhoudelijk gesprek zet de teller terug op nul', () => {
    const gesprek: Belpoging = { ...poging('2026-10-15'), id: 'g', uitkomst: 'gesproken', isInhoudelijk: true };
    const p = [poging('2026-10-13'), poging('2026-10-14'), gesprek];
    const l = berekenBellijst(invoer({ belpogingen: [...data.belpogingen, ...p], vandaag: '2026-10-30' }));
    expect(l.handmatigBeoordelen.some((k) => k.contact.id === wouters.id)).toBe(false);
  });
});

describe('limiet van 15 zonder iets te verstoppen', () => {
  it('maximaal 15 op de lijst, de rest geteld in "niet op vandaag"', () => {
    expect(lijst.vandaag.length).toBe(15);
    expect(alleKandidaten.length).toBeGreaterThan(15);
    expect(lijst.nietOpLijst.length).toBe(alleKandidaten.length - 15);
  });

  it('groep A gaat altijd mee, ook boven het maximum, met waarschuwing', () => {
    const inst: Instellingen = { ...STANDAARD_INSTELLINGEN, maxPerDag: 1 };
    const extra: Contact = { ...contact(RANDGEVAL.warmOverRitme), id: 'extra', externId: 'X' };
    const taak = { ...data.activiteiten.find((a) => a.vervaltUur === '10:30')!, id: 't2', contactId: 'extra', vervaltUur: '11:00' };
    const l = berekenBellijst(invoer({ instellingen: inst, contacten: [...data.contacten, extra], activiteiten: [...data.activiteiten, taak] }));
    expect(l.vandaag.filter((k) => k.groep === 'A').length).toBe(2);
    expect(l.vandaag.length).toBe(2);
    expect(l.waarschuwingen.length).toBe(1);
  });

  it('ingestelde gewichten en ritmes worden gebruikt', () => {
    const inst: Instellingen = { ...STANDAARD_INSTELLINGEN, ritmeDagen: { warm: 7, lauw: 42, koud: 90 } };
    const k = [...berekenBellijst(invoer({ instellingen: inst })).vandaag].find((x) => x.contact.externId === RANDGEVAL.warmOverRitme);
    expect(k?.onderdelen[0]!.punten).toBe(60); // 21/7 = 3 → 75, begrensd op 60
  });
});

describe('standaard-openingszin', () => {
  const zin = (ext: string, uur = 9) =>
    standaardOpeningszin({ kandidaat: vind(ext)!, voornaamGebruiker: 'Jonas', organisatie: 'ERA', uur, vandaag: VANDAAG });

  it('verwijst naar de afspraak bij een terugbelafspraak', () => {
    expect(zin(RANDGEVAL.terugbellenVandaagMetUur)).toBe(
      'Goeiemorgen mevrouw Peeters, met Jonas van ERA. We hadden afgesproken dat ik u vandaag zou terugbellen. Past het even?',
    );
  });

  it('bij een verstreken terugbelafspraak zegt de zin niet "vandaag"', () => {
    expect(zin(RANDGEVAL.terugbellenVerstreken)).toBe(
      'Goeiemorgen familie Janssens, met Jonas van ERA. We hadden afgesproken dat ik u zou terugbellen. Past het even?',
    );
  });

  it('gebruikt de herkomst bij een nieuwe lead', () => {
    expect(zin(RANDGEVAL.nieuweLeadLokaalGeenAntwoord, 14)).toContain('Goeiemiddag meneer Claes');
    expect(zin(RANDGEVAL.nieuweLeadLokaalGeenAntwoord, 14)).toContain('schatting');
  });

  it('respecteert de aanspreekvorm je', () => {
    expect(zin(RANDGEVAL.warmOverRitme)).toBe('Goeiemorgen Pieter, met Jonas van ERA. Ik bel even om te horen hoe het met je verkoopplannen staat. Past het even?');
  });

  it('neemt nooit notitietekst over (geen gevoelige aanleiding)', () => {
    // De notitie van mevr. Peeters vermeldt een overlijden; dat mag nooit in de openingszin komen.
    expect(zin(RANDGEVAL.terugbellenVandaagMetUur)).not.toMatch(/overleden|man|dochter/i);
  });
});

describe('echte ERAForce-data (fase 8)', () => {
  const basis = contact(RANDGEVAL.koudLangGeleden);
  const taak = (contactId: string, extra: Partial<Bronactiviteit>): Bronactiviteit => ({
    id: `t-${contactId}`, bron: 'eraforce_mirror', externId: `00T-${contactId}`, gebeurdOp: new Date('2026-10-01T08:00:00Z'), gewijzigdInBronOp: null,
    geimporteerdOp: new Date(), isTestdata: false, type: 'taak', contactId, pandId: null, taakSoort: 'algemeen', vervaltOp: '2026-10-20', vervaltUur: null,
    taakAfgerond: false, auteur: null, tekst: 'Dossier vervolledigen', ...extra,
  });

  it('een beëindigde lead of relatie komt niet op de lijst en telt niet als "zonder timeline"', () => {
    for (const statusBron of ['beeindigd', 'relatie'] as const) {
      const c: Contact = { ...basis, id: `x-${statusBron}`, statusBron };
      const r = berekenBellijst(invoer({ contacten: [c] }));
      expect([...r.vandaag, ...r.nietOpLijst, ...r.nummerZoeken, ...r.handmatigBeoordelen]).toEqual([]);
      expect(r.zonderTimeline).toEqual([]);
    }
  });

  it('… behalve met een open terugbeltaak die vandaag of eerder vervalt', () => {
    const c: Contact = { ...basis, id: 'x-relatie', statusBron: 'relatie' };
    const r = berekenBellijst(invoer({ contacten: [c], activiteiten: [taak(c.id, { taakSoort: 'terugbellen', vervaltOp: VANDAAG, tekst: 'terugbellen' })] }));
    expect(r.vandaag.map((k) => k.groep)).toEqual(['C']);
  });

  it('een andere open taak in de toekomst is een geplande volgende stap', () => {
    const c: Contact = { ...basis, id: 'x-prospect' };
    const r = berekenBellijst(invoer({ contacten: [c], activiteiten: [taak(c.id, {})] }));
    expect(r.zonderTimeline).toEqual([]);
    expect(r.uitgesloten[0]).toMatchObject({ reden: 'terugbel_later', detail: 'Volgende stap in ERAForce op di 20 okt: Dossier vervolledigen.' });
  });
});

describe('achterstand in ERAForce', () => {
  const c = contact(RANDGEVAL.koudLangGeleden);
  const oud = (dag: string): Bronactiviteit => ({
    id: 'oud', bron: 'eraforce_mirror', externId: '00T-oud', gebeurdOp: new Date('2026-01-01T08:00:00Z'), gewijzigdInBronOp: null, geimporteerdOp: new Date(),
    isTestdata: false, type: 'taak', contactId: c.id, pandId: null, taakSoort: 'terugbellen', vervaltOp: dag, vervaltUur: null, taakAfgerond: false, auteur: null, tekst: 'Opvolgtaak',
  });

  it('een terugbeltaak die meer dan 10 werkdagen verlopen is, staat niet op de daglijst maar bij de achterstand', () => {
    const r = berekenBellijst(invoer({ contacten: [c], activiteiten: [oud('2026-09-01')] }));
    expect([...r.vandaag, ...r.nietOpLijst]).toEqual([]);
    expect(r.achterstand).toMatchObject([{ dag: '2026-09-01', tekst: 'Opvolgtaak' }]);
    expect(r.zonderTimeline).toEqual([]);
  });

  it('binnen 10 werkdagen blijft het groep C', () => {
    const r = berekenBellijst(invoer({ contacten: [c], activiteiten: [oud('2026-10-01')] }));
    expect(r.vandaag.map((k) => k.groep)).toEqual(['C']);
    expect(r.achterstand).toEqual([]);
  });
});
