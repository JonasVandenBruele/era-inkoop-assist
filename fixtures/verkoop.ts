// Fictieve dataset voor de demo van de verkoopmodule. ALLE namen, nummers, adressen en panden zijn verzonnen.
// Datums zijn relatief aan "vandaag", zodat de demo nooit veroudert. Elk scenario uit de opdracht (§18) is aangeduid.
import { plusDagen, type DagKey } from '../src/core/dates';
import type { Contact } from '../src/domain/model';
import { interpreteerBezoek, interpreteer } from '../src/domain/verkoop/feedback';
import {
  SCORE_VERSIE,
  type Bezoek,
  type Bod,
  type Campagne,
  type Contactactie,
  type Contactmoment,
  type Criterium,
  type CriteriumSleutel,
  type CriteriumSoort,
  type CriteriumWaarden,
  type Inzicht,
  type Kandidaat,
  type Kenmerken,
  type Kwalificatie,
  type Medewerker,
  type Notitie,
  type PrijsRegistratie,
  type VerkoopBasis,
  type VerkoopPand,
  type Vrijgave,
  type Zoekopdracht,
} from '../src/domain/verkoop/model';

export const DEMO_KANTOOR = { id: 'kantoor-demo', naam: 'ERA demo-kantoor (fictief)' };

export const MEDEWERKERS: Medewerker[] = [
  { id: 'm-jonas', voornaam: 'Jonas', naam: 'Jonas (demo)', rol: 'inkoper', kantoorId: DEMO_KANTOOR.id },
  { id: 'm-nicolas', voornaam: 'Nicolas', naam: 'Nicolas (demo)', rol: 'verkoper', kantoorId: DEMO_KANTOOR.id },
  { id: 'm-sofie', voornaam: 'Sofie', naam: 'Sofie (fictieve collega)', rol: 'verkoper', kantoorId: DEMO_KANTOOR.id },
];

/** Vaste ID's van de scenario's, zodat tests en de demonstratieroute ernaar kunnen verwijzen. */
export const SCENARIO = {
  pandLancering: 'p-bertem', // 1: vóór lancering, koopklare kopers + actieve zoekers
  pandEnkelIntern: 'p-kortenberg', // 2: eerst enkel intern, daarna vrijgeven
  pandPrijsdaling: 'p-herent', // 3–5: prijsdaling
  pandKleineTuin: 'p-kessello', // 7: bezocht pand met te kleine tuin
  pandGroteTuin: 'p-heverlee', // 7: alternatief met meer bruikbare tuin
  pandOnvolledig: 'p-tervuren', // 10: ontbrekende pandinformatie
  pandVerkocht: 'p-wijgmaal', // 6: naast gegrepen na bod (context)
  pandEersteprijs: 'p-wilsele', // eerste prijsregistratie, geen daling
  pandIngetrokken: 'p-leuven',
  pieter: 'k-pieter', // 1, 12
  lies: 'k-lies',
  sarah: 'k-sarah', // 4: prijsbezwaar
  tom: 'k-tom', // 3: nu binnen budget
  marc: 'k-marc', // 5: locatiebezwaar
  elke: 'k-elke', // 6: naast gegrepen, terugbelafspraak
  bram: 'k-bram', // 7: tuinbezwaar
  katrien: 'k-katrien', // 8: verouderde koopbereidheid
  dirk: 'k-dirk', // 9: twee zoekscenario's
  nathalie: 'k-nathalie', // 11: gepauzeerd
  johan: 'k-johan', // 11: contactverbod
  lotte: 'k-lotte', // voorgestelde kandidaat (tweede bezoek)
  sanne: 'k-sanne', // voorgestelde kandidaat (bod)
  ruben: 'k-ruben',
  eva: 'k-eva',
  griet: 'k-griet', // 2: past bij het intern pand
  wim: 'k-wim',
  hilde: 'k-hilde', // "geen tuin nodig"
  koen: 'k-koen', // koopklaar, maar eerst eigen woning verkopen
} as const;

export function genereerVerkoopDemo(vandaag: DagKey, nu: Date): VerkoopBasis {
  const d = (n: number) => plusDagen(vandaag, n);
  const isoDag = (n: number, uur = '09:00') => new Date(`${d(n)}T${uur}:00+02:00`).toISOString();

  // ---------------------------------------------------------------- kandidaten
  let tel = 0;
  const contact = (id: string, voornaam: string, achternaam: string, gemeente: string, extra: Partial<Contact> = {}): Contact => ({
    id,
    bron: 'fictief',
    externId: `FIC-${id.toUpperCase()}`,
    gebeurdOp: null,
    gewijzigdInBronOp: null,
    geimporteerdOp: nu,
    isTestdata: true,
    voornaam,
    achternaam,
    aanhef: null,
    telefoons: [{ nummer: `0400 00 ${String(10 + ++tel).padStart(2, '0')} ${String(30 + tel).padStart(2, '0')}`, label: 'gsm' }],
    email: null,
    straat: null,
    postcode: null,
    gemeente,
    statusBron: 'relatie',
    statusLabelBron: 'Kandidaat-koper',
    faseBron: null,
    tijdshorizonBron: null,
    aanspreekvormBron: null,
    herkomstContact: 'Fictieve demo',
    nietBellenBron: false,
    aangemaaktInBronOp: null,
    isLokaalTijdelijk: false,
    ...extra,
  });
  const K = SCENARIO;
  const kand = (c: Contact, eigenaarId: string, huishoudenId: string | null = null): Kandidaat => ({ contact: c, eigenaarId, huishoudenId });
  const kandidaten: Kandidaat[] = [
    kand(contact(K.pieter, 'Pieter', 'Claes', 'Leuven'), 'm-nicolas', 'h-claes'),
    kand(contact(K.lies, 'Lies', 'Claes', 'Leuven'), 'm-nicolas', 'h-claes'),
    kand(contact(K.sarah, 'Sarah', 'Vermeulen', 'Herent'), 'm-nicolas'),
    kand(contact(K.tom, 'Tom', 'Desmet', 'Wijgmaal'), 'm-sofie'),
    kand(contact(K.marc, 'Marc', 'Peeters', 'Herent'), 'm-nicolas'),
    kand(contact(K.elke, 'Elke', 'Janssens', 'Kessel-Lo'), 'm-nicolas'),
    kand(contact(K.bram, 'Bram', 'Willems', 'Leuven'), 'm-nicolas'),
    kand(contact(K.katrien, 'Katrien', 'Maes', 'Kortenberg', { aanspreekvormBron: 'u' }), 'm-nicolas'),
    kand(contact(K.dirk, 'Dirk', 'Van Damme', 'Overijse'), 'm-nicolas'),
    kand(contact(K.nathalie, 'Nathalie', 'Goossens', 'Bertem'), 'm-nicolas'),
    kand(contact(K.johan, 'Johan', 'Mertens', 'Herent'), 'm-sofie'),
    kand(contact(K.lotte, 'Lotte', 'Hermans', 'Kessel-Lo'), 'm-sofie'),
    kand(contact(K.sanne, 'Sanne', 'Pauwels', 'Heverlee'), 'm-nicolas'),
    kand(contact(K.ruben, 'Ruben', 'Smets', 'Leefdaal'), 'm-sofie', 'h-smets'),
    kand(contact(K.eva, 'Eva', 'Smets', 'Leefdaal'), 'm-sofie', 'h-smets'),
    kand(contact(K.griet, 'Griet', 'Lambrecht', 'Erps-Kwerps'), 'm-nicolas'),
    kand(contact(K.wim, 'Wim', 'Aerts', 'Wilsele'), 'm-nicolas'),
    kand(contact(K.hilde, 'Hilde', 'Coppens', 'Leuven'), 'm-sofie'),
    kand(contact(K.koen, 'Koen', 'Dewulf', 'Tervuren'), 'm-nicolas'),
  ];
  const huishoudens = [
    { id: 'h-claes', naam: 'Pieter & Lies Claes', contactIds: [K.pieter, K.lies], bron: 'Partners, gekoppeld in ERAForce (fictief)' },
    { id: 'h-smets', naam: 'Ruben & Eva Smets', contactIds: [K.ruben, K.eva], bron: 'Partners, gekoppeld in ERAForce (fictief)' },
  ];

  // ---------------------------------------------------------------- zoekopdrachten
  let cn = 0;
  const crit = <S extends CriteriumSleutel>(sleutel: S, waarde: CriteriumWaarden[S], soort: CriteriumSoort = 'voorkeur', bronDag = -60, bron: Partial<Criterium['bron']> = {}): Criterium =>
    ({
      id: `cr-${++cn}`,
      sleutel,
      waarde,
      soort,
      status: 'actief',
      betrouwbaarheid: soort === 'vermoeden' ? 'laag' : 'hoog',
      bron: { soort: 'zoekopdracht', ref: null, citaat: null, dag: d(bronDag), door: null, ...bron },
    }) as Criterium;
  const zoek = (id: string, contactId: string, titel: string, criteria: Criterium[], aangemaakt = -60): Zoekopdracht => ({
    id,
    externId: `FIC-Z-${id}`,
    contactId,
    titel,
    status: 'actief',
    slotReden: null,
    criteria: criteria.map((c) => ({ ...c, bron: { ...c.bron, ref: c.bron.ref ?? id } }) as Criterium),
    aangemaaktOp: d(aangemaakt),
    bron: { soort: 'zoekopdracht', ref: id, citaat: null, dag: d(aangemaakt), door: null },
  });
  const zoekopdrachten: Zoekopdracht[] = [
    zoek('z-claes', K.pieter, 'Gezinswoning met tuin rond Bertem', [
      crit('regio', { gemeenten: ['Bertem', 'Leefdaal', 'Tervuren', 'Heverlee'] }),
      crit('budget', { min: 380000, max: 475000 }, 'hard'),
      crit('type', { types: ['woning'] }, 'hard'),
      crit('slaapkamers', { min: 3 }, 'hard'),
      crit('tuin', { nodig: true }),
      crit('parking', { nodig: true }),
      crit('renovatie', { maxWerk: 'op_te_frissen' }),
    ]),
    zoek('z-sarah', K.sarah, 'Woning met tuin, Herent en omgeving', [
      crit('regio', { gemeenten: ['Herent', 'Veltem-Beisem', 'Kessel-Lo'] }),
      crit('budget', { min: 320000, max: 395000 }, 'hard'),
      crit('type', { types: ['woning'] }, 'hard'),
      crit('slaapkamers', { min: 3 }),
      crit('tuin', { nodig: true }),
    ]),
    zoek('z-tom', K.tom, 'Woning Herent–Wijgmaal tot €400.000', [
      crit('regio', { gemeenten: ['Herent', 'Veltem-Beisem', 'Wijgmaal'] }),
      crit('budget', { min: 330000, max: 400000 }, 'hard'),
      crit('type', { types: ['woning'] }, 'hard'),
      crit('slaapkamers', { min: 3 }),
      crit('parking', { nodig: true }),
    ]),
    zoek('z-marc', K.marc, 'Woning Herent', [
      crit('regio', { gemeenten: ['Herent'] }),
      crit('budget', { min: 350000, max: 430000 }, 'hard'),
      crit('type', { types: ['woning'] }),
      crit('slaapkamers', { min: 3 }),
    ]),
    zoek('z-elke', K.elke, 'Woning Leuven-oost met tuin', [
      crit('regio', { gemeenten: ['Wijgmaal', 'Heverlee', 'Kessel-Lo', 'Leuven'] }),
      crit('budget', { min: 380000, max: 455000 }, 'hard'),
      crit('type', { types: ['woning'] }, 'hard'),
      crit('slaapkamers', { min: 3 }),
      crit('tuin', { nodig: true }),
    ]),
    zoek('z-bram', K.bram, 'Woning Kessel-Lo/Heverlee met tuin', [
      crit('regio', { gemeenten: ['Kessel-Lo', 'Heverlee', 'Leuven'] }),
      crit('budget', { min: 380000, max: 460000 }, 'hard'),
      crit('type', { types: ['woning'] }, 'hard'),
      crit('slaapkamers', { min: 3 }),
      crit('tuin', { nodig: true }),
    ]),
    zoek('z-katrien', K.katrien, 'Woning Bertem–Kortenberg', [
      crit('regio', { gemeenten: ['Bertem', 'Leefdaal', 'Kortenberg'] }),
      crit('budget', { min: 400000, max: 480000 }, 'hard'),
      crit('type', { types: ['woning'] }, 'hard'),
      crit('slaapkamers', { min: 3 }),
      crit('tuin', { nodig: true }),
    ], -120),
    // Scenario 9: twee afzonderlijke zoekscenario's voor dezelfde kandidaat.
    zoek('z-dirk-1', K.dirk, 'Instapklaar tot €450.000', [
      crit('regio', { gemeenten: ['Bertem', 'Heverlee', 'Tervuren'] }),
      crit('budget', { min: null, max: 450000 }, 'hard'),
      crit('type', { types: ['woning'] }, 'hard'),
      crit('slaapkamers', { min: 3 }),
      crit('renovatie', { maxWerk: 'instapklaar' }, 'hard'),
    ]),
    zoek('z-dirk-2', K.dirk, 'Te renoveren tot €350.000', [
      crit('regio', { gemeenten: ['Tervuren', 'Bertem', 'Overijse'] }),
      crit('budget', { min: null, max: 350000 }, 'hard'),
      crit('type', { types: ['woning'] }, 'hard'),
      crit('slaapkamers', { min: 3 }, 'hard'),
      crit('renovatie', { maxWerk: 'te_renoveren' }),
      crit('tuin', { nodig: true }),
    ]),
    zoek('z-nathalie', K.nathalie, 'Woning Bertem', [
      crit('regio', { gemeenten: ['Bertem', 'Leefdaal'] }),
      crit('budget', { min: null, max: 470000 }, 'hard'),
      crit('type', { types: ['woning'] }),
      crit('slaapkamers', { min: 3 }),
    ]),
    zoek('z-johan', K.johan, 'Woning Herent', [
      crit('regio', { gemeenten: ['Herent', 'Veltem-Beisem'] }),
      crit('budget', { min: null, max: 400000 }, 'hard'),
      crit('type', { types: ['woning'] }),
    ]),
    zoek('z-lotte', K.lotte, 'Woning Kessel-Lo', [
      crit('regio', { gemeenten: ['Kessel-Lo', 'Heverlee'] }),
      crit('budget', { min: null, max: 440000 }, 'hard'),
      crit('type', { types: ['woning'] }),
      crit('slaapkamers', { min: 3 }),
    ]),
    zoek('z-sanne', K.sanne, 'Woning Heverlee/Kessel-Lo', [
      crit('regio', { gemeenten: ['Heverlee', 'Kessel-Lo'] }),
      crit('budget', { min: null, max: 450000 }),
      crit('type', { types: ['woning'] }),
    ]),
    zoek('z-smets', K.ruben, 'Ruime gezinswoning Bertem–Kortenberg', [
      crit('regio', { gemeenten: ['Bertem', 'Leefdaal', 'Kortenberg'] }),
      crit('budget', { min: null, max: 500000 }, 'hard'),
      crit('type', { types: ['woning'] }, 'hard'),
      crit('slaapkamers', { min: 3 }),
      crit('tuin', { nodig: true }),
      crit('garage', { nodig: true }),
    ]),
    zoek('z-griet', K.griet, 'Appartement Kortenberg met lift', [
      crit('regio', { gemeenten: ['Kortenberg', 'Erps-Kwerps'] }),
      crit('budget', { min: null, max: 300000 }, 'hard'),
      crit('type', { types: ['appartement'] }, 'hard'),
      crit('slaapkamers', { min: 2 }),
      crit('terras', { nodig: true }),
      crit('toegankelijkheid', { gelijkvloers: true }, 'hard'),
    ]),
    zoek('z-wim', K.wim, 'Appartement Wilsele–Leuven', [
      crit('regio', { gemeenten: ['Wilsele', 'Leuven', 'Kessel-Lo'] }),
      crit('budget', { min: null, max: 280000 }, 'hard'),
      crit('type', { types: ['appartement'] }, 'hard'),
      crit('slaapkamers', { min: 2 }),
    ]),
    zoek('z-hilde', K.hilde, 'Appartement Leuven/Kortenberg', [
      crit('regio', { gemeenten: ['Kortenberg', 'Leuven'] }),
      crit('budget', { min: null, max: 310000 }, 'hard'),
      crit('type', { types: ['appartement'] }, 'hard'),
      crit('slaapkamers', { min: 2 }),
      // Afgeleid uit een websiteformulier (vinkje): een vermoeden, geen bevestigde wens.
      crit('tuin', { nodig: true }, 'vermoeden', -60, { soort: 'voorstel', citaat: 'Vinkje "tuin" op het zoekformulier van de website' }),
    ]),
    zoek('z-koen', K.koen, 'Woning Tervuren–Bertem', [
      crit('regio', { gemeenten: ['Tervuren', 'Bertem', 'Leefdaal'] }),
      crit('budget', { min: null, max: 470000 }, 'hard'),
      crit('type', { types: ['woning'] }, 'hard'),
      crit('slaapkamers', { min: 3 }),
      crit('tuin', { nodig: true }),
    ]),
  ];

  // ---------------------------------------------------------------- panden
  const leeg: Kenmerken = {
    slaapkamers: null,
    bewoonbareOpp: null,
    perceelOpp: null,
    tuin: null,
    terras: null,
    privacy: null,
    orientatie: null,
    parking: null,
    garage: null,
    staat: null,
    epc: null,
    gelijkvloersWonen: null,
    ligging: null,
    indeling: null,
  };
  const herkomst = (k: Partial<Kenmerken>, bron = 'Pandfiche ERAForce (fictief)', dag = -14) =>
    Object.fromEntries(Object.keys(k).map((s) => [s, { bron, door: null, op: d(dag) }]));
  const pand = (p: Omit<VerkoopPand, 'kantoorId' | 'kenmerken' | 'herkomst'> & { k: Partial<Kenmerken> }): VerkoopPand => ({
    ...p,
    kantoorId: DEMO_KANTOOR.id,
    kenmerken: { ...leeg, ...p.k },
    herkomst: herkomst(p.k),
  });
  const panden: VerkoopPand[] = [
    pand({
      id: K.pandLancering, externId: 'FIC-OBJ-101', straat: 'Fictieve Lindedreef 12', postcode: '3060', gemeente: 'Bertem', type: 'woning', fase: 'in_voorbereiding',
      k: { slaapkamers: 3, bewoonbareOpp: 165, perceelOpp: 640, tuin: { aanwezig: true, bruikbareOpp: 180, omschrijving: 'Tuin op het zuidwesten' }, terras: true, privacy: 'goed', orientatie: 'ZW', parking: true, garage: true, staat: 'instapklaar', epc: 'B', gelijkvloersWonen: false, ligging: 'Rustige woonstraat', indeling: 'Open leefruimte, bureau op het gelijkvloers' },
      richtprijsIntern: 465000, inkoperId: 'm-jonas', verkoperId: 'm-nicolas', omschrijving: 'Instapklare gezinswoning met tuin (fictief).', publicatieGepland: d(9),
    }),
    pand({
      id: K.pandEnkelIntern, externId: 'FIC-OBJ-102', straat: 'Fictieve Stationsstraat 4 bus 3', postcode: '3070', gemeente: 'Kortenberg', type: 'appartement', fase: 'in_voorbereiding',
      k: { slaapkamers: 2, bewoonbareOpp: 92, terras: true, parking: true, garage: false, staat: 'instapklaar', epc: 'A', gelijkvloersWonen: true, ligging: 'Vlak bij het station', tuin: { aanwezig: false, bruikbareOpp: null, omschrijving: null } },
      richtprijsIntern: 289000, inkoperId: 'm-jonas', verkoperId: 'm-nicolas', omschrijving: 'Recent appartement met lift en terras (fictief).', publicatieGepland: null,
    }),
    pand({
      id: K.pandPrijsdaling, externId: 'FIC-OBJ-103', straat: 'Fictieve Steenweg 210', postcode: '3020', gemeente: 'Herent', type: 'woning', fase: 'gepubliceerd',
      k: { slaapkamers: 3, bewoonbareOpp: 150, perceelOpp: 520, tuin: { aanwezig: true, bruikbareOpp: 120, omschrijving: null }, parking: true, garage: false, staat: 'op_te_frissen', epc: 'C', ligging: 'Langs een drukke steenweg', indeling: 'Klassieke indeling' },
      richtprijsIntern: null, inkoperId: 'm-jonas', verkoperId: 'm-nicolas', omschrijving: 'Op te frissen woning met tuin (fictief).', publicatieGepland: null,
    }),
    pand({
      id: K.pandKleineTuin, externId: 'FIC-OBJ-104', straat: 'Fictieve Tiensesteenweg 55', postcode: '3010', gemeente: 'Kessel-Lo', type: 'woning', fase: 'gepubliceerd',
      k: { slaapkamers: 3, bewoonbareOpp: 140, perceelOpp: 260, tuin: { aanwezig: true, bruikbareOpp: 45, omschrijving: 'Stadstuintje' }, parking: false, staat: 'instapklaar', epc: 'B', ligging: 'Rustige straat dicht bij het centrum' },
      richtprijsIntern: null, inkoperId: 'm-sofie', verkoperId: 'm-sofie', omschrijving: 'Instapklare rijwoning (fictief).', publicatieGepland: null,
    }),
    pand({
      id: K.pandGroteTuin, externId: 'FIC-OBJ-105', straat: 'Fictieve Kastanjelaan 8', postcode: '3001', gemeente: 'Heverlee', type: 'woning', fase: 'in_voorbereiding',
      k: { slaapkamers: 3, bewoonbareOpp: 155, perceelOpp: 590, tuin: { aanwezig: true, bruikbareOpp: 210, omschrijving: 'Ruime, vlakke tuin' }, terras: true, parking: true, garage: false, staat: 'instapklaar', epc: 'B', ligging: 'Rustige wijk' },
      richtprijsIntern: 452000, inkoperId: 'm-jonas', verkoperId: 'm-nicolas', omschrijving: 'Gezinswoning met ruime tuin (fictief).', publicatieGepland: d(16),
    }),
    pand({
      id: K.pandOnvolledig, externId: 'FIC-OBJ-106', straat: 'Fictieve Bosweg 3', postcode: '3080', gemeente: 'Tervuren', type: 'woning', fase: 'in_voorbereiding',
      // Scenario 10: slaapkamers, oppervlakte en bruikbare tuin nog niet gekend; een groot perceel is geen tuinmaat.
      k: { perceelOpp: 1200, tuin: { aanwezig: true, bruikbareOpp: null, omschrijving: 'Groot perceel, deels bebost' }, staat: 'te_renoveren' },
      richtprijsIntern: 345000, inkoperId: 'm-jonas', verkoperId: null, omschrijving: 'Te renoveren woning op groot perceel (fictief).', publicatieGepland: null,
    }),
    pand({
      id: K.pandVerkocht, externId: 'FIC-OBJ-107', straat: 'Fictieve Molenstraat 19', postcode: '3018', gemeente: 'Wijgmaal', type: 'woning', fase: 'verkocht',
      k: { slaapkamers: 3, bewoonbareOpp: 145, tuin: { aanwezig: true, bruikbareOpp: 100, omschrijving: null }, staat: 'instapklaar' },
      richtprijsIntern: null, inkoperId: 'm-sofie', verkoperId: 'm-sofie', omschrijving: 'Verkocht (fictief): enkel context.', publicatieGepland: null,
    }),
    pand({
      id: K.pandEersteprijs, externId: 'FIC-OBJ-108', straat: 'Fictieve Aarschotsesteenweg 140 bus 2', postcode: '3012', gemeente: 'Wilsele', type: 'appartement', fase: 'gepubliceerd',
      k: { slaapkamers: 2, bewoonbareOpp: 85, terras: true, parking: true, staat: 'instapklaar', epc: 'B', gelijkvloersWonen: true },
      richtprijsIntern: null, inkoperId: 'm-jonas', verkoperId: 'm-nicolas', omschrijving: 'Appartement met terras (fictief).', publicatieGepland: null,
    }),
    pand({
      id: K.pandIngetrokken, externId: 'FIC-OBJ-109', straat: 'Fictieve Naamsestraat 77', postcode: '3000', gemeente: 'Leuven', type: 'woning', fase: 'ingetrokken',
      k: { slaapkamers: 4, bewoonbareOpp: 190, staat: 'op_te_frissen' },
      richtprijsIntern: null, inkoperId: 'm-sofie', verkoperId: 'm-sofie', omschrijving: 'Opdracht ingetrokken (fictief): enkel context.', publicatieGepland: null,
    }),
  ];

  const prijs = (id: string, pandId: string, bedrag: number, dag: number): PrijsRegistratie => ({ id, pandId, soort: 'vraagprijs', bedrag, valuta: 'EUR', dag: d(dag), bron: 'eraforce', door: null });
  const prijzen: PrijsRegistratie[] = [
    // Scenario 3–5: prijsdaling in de prijshistoriek (automatisch herkend).
    prijs('pr-herent-1', K.pandPrijsdaling, 425000, -75),
    prijs('pr-herent-2', K.pandPrijsdaling, 389000, -2),
    prijs('pr-kessello-1', K.pandKleineTuin, 435000, -50),
    prijs('pr-wijgmaal-1', K.pandVerkocht, 410000, -40),
    // Eerste prijsregistratie: géén prijsdaling.
    prijs('pr-wilsele-1', K.pandEersteprijs, 265000, -30),
    prijs('pr-leuven-1', K.pandIngetrokken, 520000, -200),
  ];

  const toestemming = (dag: number, bron: string, door = 'm-jonas') => ({ door, op: d(dag), bron });
  const alles = { gemeente: true, adres: true, vraagprijs: true, kenmerken: true };
  const vrijgaven: Vrijgave[] = [
    {
      pandId: K.pandLancering,
      internMatchen: toestemming(-3, 'Opdracht ondertekend (fictief)'),
      contacteren: toestemming(-3, 'Akkoord eigenaar (gesprek, fictief): vóór publicatie kandidaten contacteren; adres pas bij een bezoek'),
      bezoeken: toestemming(-3, 'Akkoord eigenaar: bezoeken op zaterdag'),
      deelbaar: { gemeente: true, adres: false, vraagprijs: true, kenmerken: true },
      vraagprijs: 459000,
      instructies: 'Adres pas delen bij een bevestigd bezoek. Eigenaar woont er nog: bezoeken enkel op zaterdag.',
    },
    // Scenario 2: enkel intern matchen; contact en bezoeken nog niet vrijgegeven.
    { pandId: K.pandEnkelIntern, internMatchen: toestemming(-1, 'Eigenaar akkoord voor interne bespreking (fictief)'), contacteren: null, bezoeken: null, deelbaar: { gemeente: false, adres: false, vraagprijs: false, kenmerken: false }, vraagprijs: null, instructies: 'Nog geen contact met kandidaten tot de opdracht getekend is.' },
    { pandId: K.pandPrijsdaling, internMatchen: toestemming(-80, 'Opdracht ondertekend'), contacteren: toestemming(-80, 'Gepubliceerd'), bezoeken: toestemming(-80, 'Gepubliceerd'), deelbaar: alles, vraagprijs: null, instructies: null },
    { pandId: K.pandKleineTuin, internMatchen: toestemming(-55, 'Opdracht ondertekend', 'm-sofie'), contacteren: toestemming(-55, 'Gepubliceerd', 'm-sofie'), bezoeken: toestemming(-55, 'Gepubliceerd', 'm-sofie'), deelbaar: alles, vraagprijs: null, instructies: null },
    {
      pandId: K.pandGroteTuin,
      internMatchen: toestemming(-4, 'Opdracht ondertekend (fictief)'),
      contacteren: toestemming(-4, 'Akkoord eigenaar (mail, fictief)'),
      bezoeken: toestemming(-4, 'Akkoord eigenaar (mail, fictief)'),
      deelbaar: { gemeente: true, adres: false, vraagprijs: true, kenmerken: true },
      vraagprijs: 449000,
      instructies: null,
    },
    { pandId: K.pandOnvolledig, internMatchen: toestemming(-2, 'Schattingsbezoek, eigenaar akkoord voor interne bespreking (fictief)'), contacteren: null, bezoeken: null, deelbaar: { gemeente: false, adres: false, vraagprijs: false, kenmerken: false }, vraagprijs: null, instructies: 'Opdracht nog niet getekend.' },
    { pandId: K.pandEersteprijs, internMatchen: toestemming(-32, 'Opdracht ondertekend'), contacteren: toestemming(-32, 'Gepubliceerd'), bezoeken: toestemming(-32, 'Gepubliceerd'), deelbaar: alles, vraagprijs: null, instructies: null },
  ];

  // ---------------------------------------------------------------- historiek
  const bezoeken: Bezoek[] = [
    { id: 'b-sarah-herent', contactId: K.sarah, pandId: K.pandPrijsdaling, dag: d(-40), volgnummer: 1, evaluatie: 'Mooie woning en goede indeling, maar te duur voor ons. Interessant als de prijs zakt.', door: 'm-nicolas' },
    { id: 'b-marc-herent', contactId: K.marc, pandId: K.pandPrijsdaling, dag: d(-35), volgnummer: 1, evaluatie: 'De ligging langs de steenweg is te druk, dat gaat niet met de kinderen.', door: 'm-nicolas' },
    { id: 'b-bram-kessello', contactId: K.bram, pandId: K.pandKleineTuin, dag: d(-20), volgnummer: 1, evaluatie: 'Goede locatie en indeling, maar de tuin was te klein.', door: 'm-sofie' },
    { id: 'b-lotte-kessello-1', contactId: K.lotte, pandId: K.pandKleineTuin, dag: d(-25), volgnummer: 1, evaluatie: 'Positief, wil graag nog eens komen met haar partner.', door: 'm-sofie' },
    { id: 'b-lotte-kessello-2', contactId: K.lotte, pandId: K.pandKleineTuin, dag: d(-6), volgnummer: 2, evaluatie: 'Tweede bezoek met partner. Twijfelen nog over de parking.', door: 'm-sofie' },
    { id: 'b-elke-wijgmaal', contactId: K.elke, pandId: K.pandVerkocht, dag: d(-16), volgnummer: 2, evaluatie: 'Tweede bezoek, wil een bod doen.', door: 'm-sofie' },
    { id: 'b-sanne-kessello', contactId: K.sanne, pandId: K.pandKleineTuin, dag: d(-14), volgnummer: 1, evaluatie: null, door: 'm-sofie' },
  ];
  const biedingen: Bod[] = [
    // Scenario 6: recent naast een pand gegrepen na een bod.
    { id: 'bod-elke-wijgmaal', contactId: K.elke, pandId: K.pandVerkocht, bedrag: 405000, dag: d(-12), status: 'overboden' },
    { id: 'bod-sanne-kessello', contactId: K.sanne, pandId: K.pandKleineTuin, bedrag: 400000, dag: d(-9), status: 'geweigerd' },
  ];
  const notities: Notitie[] = [
    { id: 'n-elke-1', contactId: K.elke, pandId: null, dag: d(-11), tekst: 'Spijtig van Wijgmaal. We willen echt kopen voor het einde van het jaar.', door: 'm-nicolas', bron: 'gesprek' },
    { id: 'n-bram-1', contactId: K.bram, pandId: null, dag: d(-19), tekst: 'Zijn broer zoekt ook iets in Herent, misschien later interessant.', door: 'm-nicolas', bron: 'gesprek' },
    { id: 'n-hilde-1', contactId: K.hilde, pandId: null, dag: d(-9), tekst: 'Geen tuin nodig, een terras volstaat.', door: 'm-sofie', bron: 'gesprek' },
    { id: 'n-sanne-1', contactId: K.sanne, pandId: K.pandKleineTuin, dag: d(-9), tekst: 'Bod geweigerd door de eigenaar. Ze willen snel beslissen bij een volgend pand.', door: 'm-sofie', bron: 'gesprek' },
  ];
  // Eerder geïnterpreteerd en bevestigd (zodat onveranderde historiek niet opnieuw geanalyseerd wordt).
  // Hilde's uitspraak blijft een voorstel, zodat de demo de bevestigknoppen toont.
  const inzichten: Inzicht[] = [
    ...bezoeken.flatMap((b) => interpreteerBezoek(b)),
    ...notities.flatMap((n) => interpreteer(n)),
  ].map((i) => (i.contactId === K.hilde ? i : { ...i, status: 'bevestigd' as const }));

  // ---------------------------------------------------------------- kwalificaties (koperspool)
  const kw = (contactId: string, verantwoordelijkeId: string, k: Partial<Kwalificatie>): Kwalificatie => ({
    contactId,
    poolStatus: 'actief',
    budget: null,
    financiering: { status: 'onbekend', bron: null, op: null },
    afhankelijkVanVerkoop: { status: 'onbekend', toelichting: null },
    termijn: null,
    snelBezoeken: 'onbekend',
    interesseVoorPublicatie: 'onbekend',
    contactvoorkeur: null,
    verantwoordelijkeId,
    laatsteBevestiging: null,
    koopklaar: null,
    pauze: null,
    toegevoegd: { door: verantwoordelijkeId, op: d(-90), wijze: 'zelf' },
    ...k,
  });
  const bevestiging = (dag: number, door: string, bron = 'Telefoongesprek (fictief)') => ({ op: d(dag), door, bron });
  const kwalificaties: Kwalificatie[] = [
    kw(K.pieter, 'm-nicolas', {
      poolStatus: 'koopklaar',
      budget: { bedrag: 475000, bevestigdOp: d(-10), bron: 'Gesprek met Pieter en Lies (fictief)' },
      financiering: { status: 'bevestigd', bron: 'Pieter: principieel akkoord van de bank, mondeling (fictief)', op: d(-10) },
      afhankelijkVanVerkoop: { status: 'nee', toelichting: 'Huren nu' },
      termijn: 'Vóór de zomer',
      snelBezoeken: 'ja',
      interesseVoorPublicatie: 'ja',
      contactvoorkeur: 'Bellen na 17 uur',
      laatsteBevestiging: bevestiging(-10, 'm-nicolas'),
      koopklaar: { door: 'm-nicolas', op: d(-10) },
    }),
    kw(K.sarah, 'm-nicolas', {
      budget: { bedrag: 395000, bevestigdOp: d(-18), bron: 'Gesprek (fictief)' },
      financiering: { status: 'besproken_kredietverstrekker', bron: 'Sarah, telefonisch (fictief)', op: d(-18) },
      afhankelijkVanVerkoop: { status: 'nee', toelichting: null },
      termijn: 'Dit jaar',
      laatsteBevestiging: bevestiging(-18, 'm-nicolas'),
    }),
    kw(K.tom, 'm-sofie', { laatsteBevestiging: bevestiging(-12, 'm-sofie'), financiering: { status: 'te_onderzoeken', bron: null, op: null } }),
    kw(K.marc, 'm-nicolas', { laatsteBevestiging: bevestiging(-20, 'm-nicolas') }),
    kw(K.elke, 'm-nicolas', {
      poolStatus: 'koopklaar',
      budget: { bedrag: 455000, bevestigdOp: d(-11), bron: 'Bod op Wijgmaal en gesprek nadien (fictief)' },
      financiering: { status: 'bevestigd', bron: 'Financieringsattest getoond bij bod (fictief)', op: d(-12) },
      afhankelijkVanVerkoop: { status: 'nee', toelichting: null },
      termijn: 'Vóór het einde van het jaar',
      snelBezoeken: 'ja',
      interesseVoorPublicatie: 'ja',
      laatsteBevestiging: bevestiging(-11, 'm-nicolas'),
      koopklaar: { door: 'm-nicolas', op: d(-11) },
    }),
    kw(K.bram, 'm-nicolas', { laatsteBevestiging: bevestiging(-19, 'm-nicolas'), financiering: { status: 'besproken_kredietverstrekker', bron: 'Bram (fictief)', op: d(-19) } }),
    // Scenario 8: koopklaar, maar de bevestiging is 75 dagen oud.
    kw(K.katrien, 'm-nicolas', {
      poolStatus: 'koopklaar',
      budget: { bedrag: 480000, bevestigdOp: d(-75), bron: 'Gesprek (fictief)' },
      financiering: { status: 'bevestigd', bron: 'Katrien, telefonisch (fictief)', op: d(-75) },
      laatsteBevestiging: bevestiging(-75, 'm-nicolas'),
      koopklaar: { door: 'm-nicolas', op: d(-75) },
      interesseVoorPublicatie: 'ja',
    }),
    kw(K.dirk, 'm-nicolas', { laatsteBevestiging: bevestiging(-8, 'm-nicolas'), termijn: 'Geen haast; liefst binnen het jaar' }),
    // Scenario 11: gepauzeerd.
    kw(K.nathalie, 'm-nicolas', { poolStatus: 'gepauzeerd', pauze: { tot: d(60), reden: 'Verbouwing van de huidige woning loopt uit' }, laatsteBevestiging: bevestiging(-30, 'm-nicolas') }),
    kw(K.johan, 'm-sofie', { laatsteBevestiging: bevestiging(-50, 'm-sofie') }),
    kw(K.ruben, 'm-sofie', { laatsteBevestiging: bevestiging(-15, 'm-sofie'), financiering: { status: 'besproken_kredietverstrekker', bron: 'Ruben (fictief)', op: d(-15) } }),
    kw(K.griet, 'm-nicolas', { laatsteBevestiging: bevestiging(-5, 'm-nicolas'), contactvoorkeur: 'Liefst WhatsApp' }),
    kw(K.wim, 'm-nicolas', { poolStatus: 'te_kwalificeren', laatsteBevestiging: bevestiging(-25, 'm-nicolas') }),
    kw(K.hilde, 'm-sofie', { laatsteBevestiging: bevestiging(-9, 'm-sofie') }),
    kw(K.koen, 'm-nicolas', {
      poolStatus: 'koopklaar',
      budget: { bedrag: 470000, bevestigdOp: d(-6), bron: 'Gesprek (fictief)' },
      financiering: { status: 'besproken_kredietverstrekker', bron: 'Koen (fictief)', op: d(-6) },
      afhankelijkVanVerkoop: { status: 'ja', toelichting: 'Huidige woning in Tervuren moet eerst verkocht zijn' },
      termijn: 'Na verkoop eigen woning',
      laatsteBevestiging: bevestiging(-6, 'm-nicolas'),
      koopklaar: { door: 'm-nicolas', op: d(-6) },
    }),
  ];

  // ---------------------------------------------------------------- startcampagne en acties (scenario 1 en 12)
  const lancering: Campagne = {
    id: `c:lancering:${K.pandLancering}`,
    pandId: K.pandLancering,
    soort: 'lancering',
    sleutel: `lancering:${K.pandLancering}`,
    prijs: null,
    aangemaaktDoor: 'm-jonas',
    aangemaaktOp: isoDag(-2, '16:10'),
    scoreVersie: SCORE_VERSIE,
  };
  const actie = (id: string, contactId: string, uitvoerderId: string, a: Partial<Contactactie>): Contactactie => ({
    id,
    kantoorId: DEMO_KANTOOR.id,
    contactId,
    pandId: K.pandLancering,
    soort: 'pand',
    aanleidingen: [{ campagneId: lancering.id, soort: 'lancering', uitleg: 'Past bij de zoekopdracht.', op: isoDag(-2, '16:15'), door: 'm-jonas' }],
    voortgang: 'nog_contacteren',
    interesse: 'onbekend',
    uitvoerderId,
    toegewezenDoor: 'm-jonas',
    verzoek: null,
    claim: null,
    terugbellen: null,
    bezoek: null,
    volgendePoging: null,
    volgendeStap: null,
    geenInteresseReden: null,
    laatsteContactOp: null,
    historiek: [{ op: isoDag(-2, '16:15'), door: 'm-jonas', tekst: `Toegewezen aan ${MEDEWERKERS.find((m) => m.id === uitvoerderId)!.voornaam}` }],
    aangemaaktOp: isoDag(-2, '16:15'),
    aangemaaktDoor: 'm-jonas',
    scoreVersie: SCORE_VERSIE,
    ...a,
  });
  const acties: Contactactie[] = [
    actie(`a:${lancering.id}:h-claes`, K.pieter, 'm-nicolas', {
      verzoek: 'Sterke match: 3 slaapkamers, tuin op het ZW, binnen hun bevestigd budget. Kan jij bellen vóór publicatie?',
      aanleidingen: [{ campagneId: lancering.id, soort: 'lancering', uitleg: 'Koopklaar en sterke match: vraagprijs binnen bevestigd maximum, 3 slaapkamers, tuin.', op: isoDag(-2, '16:15'), door: 'm-jonas' }],
      volgendeStap: 'Bellen vóór publicatie en bezoek voorstellen',
    }),
    actie(`a:${lancering.id}:${K.katrien}`, K.katrien, 'm-nicolas', {
      aanleidingen: [{ campagneId: lancering.id, soort: 'lancering', uitleg: 'Koopklaar, maar bevestiging is verouderd: eerst nagaan of ze nog zoekt.', op: isoDag(-2, '16:16'), door: 'm-jonas' }],
      volgendeStap: 'Bellen en eerst bevestigen of ze nog zoeken (koopbereidheid verouderd)',
    }),
    actie(`a:${lancering.id}:h-smets`, K.ruben, 'm-sofie', {
      voortgang: 'geen_antwoord',
      volgendePoging: d(0),
      volgendeStap: 'Opnieuw proberen',
      historiek: [
        { op: isoDag(-2, '16:17'), door: 'm-jonas', tekst: 'Toegewezen aan Sofie' },
        { op: isoDag(-1, '11:05'), door: 'm-sofie', tekst: 'Geen antwoord (demo: gesimuleerd)' },
      ],
    }),
    // Scenario 6 + afgesproken terugbelmoment zonder pand: eigen voorrang.
    {
      ...actie(`a:opvolging:${K.elke}`, K.elke, 'm-nicolas', {}),
      pandId: null,
      soort: 'opvolging',
      aanleidingen: [{ campagneId: null, soort: 'opvolging', uitleg: 'Elke vroeg om vandaag terug te bellen: ze greep naast Wijgmaal en wil nieuw aanbod horen.', op: isoDag(-1, '17:30'), door: 'm-nicolas' }],
      voortgang: 'terugbellen',
      terugbellen: { dag: d(0), uur: '14:00' },
      volgendePoging: d(0),
      volgendeStap: 'Terugbellen om 14:00 en nieuw aanbod overlopen',
      toegewezenDoor: 'm-nicolas',
      aangemaaktDoor: 'm-nicolas',
      historiek: [{ op: isoDag(-1, '17:30'), door: 'm-nicolas', tekst: 'Terugbellen op datum (demo: gesimuleerd)' }],
    },
  ];
  const contactmomenten: Contactmoment[] = [
    { id: 'cm-smets-1', contactId: K.ruben, actieIds: [`a:${lancering.id}:h-smets`], door: 'm-sofie', op: isoDag(-1, '11:05'), kanaal: 'telefoon', uitkomst: 'geen_antwoord', reden: null, notitie: null, terugbellen: null, bezoek: null, gesimuleerd: true },
    { id: 'cm-elke-1', contactId: K.elke, actieIds: [`a:opvolging:${K.elke}`], door: 'm-nicolas', op: isoDag(-1, '17:30'), kanaal: 'telefoon', uitkomst: 'terugbellen', reden: null, notitie: null, terugbellen: { dag: d(0), uur: '14:00' }, bezoek: null, gesimuleerd: true },
  ];

  return {
    kantoor: DEMO_KANTOOR,
    medewerkers: MEDEWERKERS,
    kandidaten,
    huishoudens,
    kwalificaties,
    zoekopdrachten,
    panden,
    prijzen,
    vrijgaven,
    bezoeken,
    biedingen,
    notities,
    inzichten,
    contactverboden: [{ contactId: K.johan, door: 'm-sofie', op: d(-50), reden: 'Wil niet meer gecontacteerd worden (fictief)' }],
    campagnes: [lancering],
    acties,
    contactmomenten,
    afwijzingen: [],
    laatsteSync: new Date(nu.getTime() - 3 * 3600_000).toISOString(),
    bronNaam: 'Fictieve demo-bron',
  };
}
