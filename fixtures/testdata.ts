// Fictieve, reproduceerbare testdata. ALLE namen, nummers en adressen zijn verzonnen.
// Datums zijn relatief aan de testdatum, zodat de data nooit veroudert.
import { dagVan, opDagUur, plusDagen, vanBrusselsLokaal, type DagKey } from '../src/core/dates';
import type {
  Afspraak,
  Belpoging,
  Bronactiviteit,
  Bronstatus,
  Contact,
  ContactPand,
  ContactStatus,
  Contactvoorkeur,
  Fase,
  Pand,
  PandRol,
  Waardehaak,
} from '../src/domain/model';
import { maakPrng, stabieleUuid, type Prng } from './prng';

export const TESTDATA_SEED = 20261013;

export interface Testdataset {
  contacten: Contact[];
  panden: Pand[];
  contactPanden: ContactPand[];
  activiteiten: Bronactiviteit[];
  afspraken: Afspraak[];
  belpogingen: Belpoging[];
  bronnen: Bronstatus[];
  haken: Waardehaak[];
  voorkeuren: Contactvoorkeur[];
}

export interface TestdataOpties {
  /** Brusselse lokale tijd, bv. "2026-10-13T07:30". */
  testdatum: string;
  /** Maakt ID's uniek per gebruiker (bv. de gebruikers-ID). */
  idPrefix?: string;
  seed?: number;
}

/** Vaste extern-ID's van randgevallen, zodat tests en documentatie ernaar kunnen verwijzen. */
export const RANDGEVAL = {
  terugbellenVandaagMetUur: 'FIC-C-001',
  nieuweLeadLokaalGeenAntwoord: 'FIC-C-002',
  terugbellenVerstreken: 'FIC-C-003',
  warmOverRitme: 'FIC-C-004',
  koudLangGeleden: 'FIC-C-005',
  lauwOverRitme: 'FIC-C-006',
  koudNogNietAanDeBeurt: 'FIC-C-007',
  nietMeerBellen: 'FIC-C-008',
  terugbellenNaMaanden: 'FIC-C-009',
  erfgenaamA: 'FIC-C-010',
  erfgenaamB: 'FIC-C-011',
  erfgenaamC: 'FIC-C-012',
  meerderePanden: 'FIC-C-013',
  zonderTelefoon: 'FIC-C-014',
  tegenstrijdig: 'FIC-C-015',
  terugbellenVandaagZonderUur: 'FIC-C-016',
  nieuweLeadDrieKeerGeenAntwoord: 'FIC-C-017',
  nieuweLeadVandaag: 'FIC-C-018',
  afspraakVandaag: 'FIC-C-019',
  afspraakOverlap: 'FIC-C-020',
  afspraakZonderContact: 'FIC-A-ZONDER-CONTACT',
  pandErfenis: 'FIC-P-010',
  // Contactstrategie (fase 3b)
  tweeKeerGeenAntwoord: 'FIC-C-010',
  voorkeurMail: 'FIC-C-006',
  voorkeurBericht: 'FIC-C-005',
  persoonlijkeHaak: 'FIC-C-016',
  huurcontractLooptAf: 'FIC-C-013',
} as const;

// ---------- Bouwstenen ----------

const VOORNAMEN_M = ['Jan', 'Luc', 'Marc', 'Dirk', 'Koen', 'Bart', 'Pieter', 'Filip', 'Kurt', 'Geert', 'Wim', 'Patrick', 'Stefaan', 'Johan', 'Tom', 'Kristof', 'Hendrik', 'Frank', 'Erik', 'Wouter'] as const;
const VOORNAMEN_V = ['Annick', 'Rita', 'Els', 'Sofie', 'Lien', 'Hilde', 'Nadia', 'Katrien', 'Veerle', 'Inge', 'Greet', 'An', 'Lieve', 'Martine', 'Ann', 'Sarah', 'Caroline', 'Nathalie', 'Marleen', 'Evelien'] as const;
const ACHTERNAMEN = ['Vermeulen', 'Van Damme', 'De Clercq', 'Verhoeven', 'Lemmens', 'Coppens', 'Martens', 'Leclercq', 'Vandenberghe', 'Dewilde', 'De Backer', 'Segers', 'Cools', 'Van Acker', 'Bauwens', 'Lenaerts', 'Thys', 'Van Hecke', 'Vervoort', 'Baert', 'Wuyts', 'Verbruggen', 'De Vos', 'Stevens', 'Schepers', 'Geerts', 'Van de Velde', 'Hendrickx', 'Pauwels', 'De Meyer', 'Bogaert', 'Van Laere', 'Claeys', 'De Wolf', 'Mortier', 'Vanhove', 'De Paepe', 'Rogiers', 'Van Wesemael', 'Callens'] as const;
const GEMEENTEN = [
  ['9000', 'Gent'], ['9820', 'Merelbeke'], ['9070', 'Destelbergen'], ['9080', 'Lochristi'], ['9300', 'Aalst'],
  ['9200', 'Dendermonde'], ['9230', 'Wetteren'], ['9160', 'Lokeren'], ['9830', 'Sint-Martens-Latem'], ['9800', 'Deinze'],
  ['9620', 'Zottegem'], ['9400', 'Ninove'], ['9700', 'Oudenaarde'], ['9090', 'Melle'], ['9940', 'Evergem'],
] as const;
const STRATEN = ['Kerkstraat', 'Stationsstraat', 'Molenstraat', 'Dorpsstraat', 'Nieuwstraat', 'Schoolstraat', 'Kapelstraat', 'Veldstraat', 'Beekstraat', 'Lindenlaan', 'Kastanjelaan', 'Gentsesteenweg', 'Heirweg', 'Hoogstraat', 'Meersstraat', 'Populierenlaan', 'Kouterstraat', 'Bosstraat'] as const;
const PAND_TYPES = ['woning', 'woning', 'woning', 'appartement', 'appartement', 'bouwgrond', 'handelspand'] as const;
const HERKOMSTEN = ['website schattingsaanvraag', 'Realo.be – Sellerlead', 'doorverwezen door notaris', 'via buurman (klant)', 'belde zelf naar kantoor', 'open huis', 'bord aan de gevel', 'Bouwbeurs Gent'] as const;
const HORIZON = {
  kort: ['binnen 3 mnd', 'asap', 'tegen eind dit jaar'],
  middel: ['tegen de zomer', 'volgend voorjaar', 'ergens volgend jaar'],
  lang: ['na pensioen (2028)', 'pas als nieuwe woning klaar is', 'nog geen idee, mss over 2 jaar'],
} as const;
const MOTIVATIES = ['kinderen het huis uit, te groot', 'wil kleiner wonen', 'verhuist naar serviceflat', 'erfenis, wil verdelen', 'investeerder wil uitstappen', 'werk in Antwerpen, wil dichterbij', 'renovatie te duur', 'wil iets met tuin'] as const;
const BEZWAREN = ['vindt commissie te hoog', 'werkt al met andere makelaar', 'wil eerst zelf proberen via Immoweb', 'twijfelt ivm rentes', 'schrik voor te lage prijs'] as const;
const STAPPEN = ['schatting inplannen', 'verkoopsvoorwaarden mailen', 'referenties sturen', 'opnieuw bellen na zomer', 'EPC laten opmaken'] as const;

/** Verzonnen gsm-nummer. De app laat testdata nooit echt bellen. */
function telefoon(r: Prng): string {
  return `+32 4${r.tussen(70, 99)} ${r.tussen(10, 99)} ${r.tussen(10, 99)} ${r.tussen(10, 99)}`;
}

// ---------- Generator ----------

export function genereerTestdata(opties: TestdataOpties): Testdataset {
  const r = maakPrng(opties.seed ?? TESTDATA_SEED);
  const prefix = opties.idPrefix ?? 'lokaal';
  const id = (sleutel: string) => stabieleUuid(`${prefix}:${sleutel}`);
  const nu = vanBrusselsLokaal(opties.testdatum);
  const vandaag: DagKey = dagVan(nu);
  const dag = (n: number) => plusDagen(vandaag, n);
  const tijd = (n: number, uur: string) => opDagUur(dag(n), uur);
  const willekeurigUur = () => `${String(r.tussen(8, 19)).padStart(2, '0')}:${r.kies(['00', '10', '15', '25', '30', '40', '45', '55'])}`;
  /** Donna verwerkt meestal dezelfde of de volgende dag; nooit na "nu". */
  const verwerktOp = (gebeurd: Date) => {
    const t = new Date(gebeurd.getTime() + r.tussen(0, 36) * 3600_000);
    return t > nu ? nu : t;
  };
  const geimporteerdOp = new Date(nu.getTime() - 2 * 3600_000);
  const basis = { isTestdata: true, geimporteerdOp } as const;

  const contacten: Contact[] = [];
  const panden: Pand[] = [];
  const contactPanden: ContactPand[] = [];
  const activiteiten: Bronactiviteit[] = [];
  const afspraken: Afspraak[] = [];
  const belpogingen: Belpoging[] = [];

  // --- helpers om records toe te voegen ---
  type ContactInvoer = {
    ext: string;
    aanhef: string | null;
    voornaam: string | null;
    achternaam: string;
    status: ContactStatus;
    fase: Fase | null;
    horizon?: string | null;
    aanspreek?: 'u' | 'je' | null;
    herkomst?: string | null;
    nietBellen?: boolean;
    geenTelefoon?: boolean;
    aangemaaktDagGeleden: number;
    gemeente?: readonly [string, string];
  };
  const voegContactToe = (c: ContactInvoer): Contact => {
    const [postcode, gemeente] = c.gemeente ?? r.kies(GEMEENTEN);
    const aangemaakt = tijd(-c.aangemaaktDagGeleden, willekeurigUur());
    const contact: Contact = {
      ...basis,
      id: id(c.ext),
      bron: 'fictief',
      externId: c.ext,
      gebeurdOp: aangemaakt,
      gewijzigdInBronOp: aangemaakt,
      voornaam: c.voornaam,
      achternaam: c.achternaam,
      aanhef: c.aanhef,
      telefoons: c.geenTelefoon ? [] : [{ nummer: telefoon(r), label: 'gsm' }],
      email: r.kans(0.6) || c.geenTelefoon ? `${(c.voornaam ?? 'info').toLowerCase()}.${c.achternaam.toLowerCase().replace(/[^a-z]/g, '')}@voorbeeld.test` : null,
      straat: `${r.kies(STRATEN)} ${r.tussen(1, 180)}`,
      postcode,
      gemeente,
      statusBron: c.status,
      faseBron: c.fase,
      tijdshorizonBron: c.horizon ?? null,
      aanspreekvormBron: c.aanspreek ?? null,
      herkomstContact: c.herkomst ?? r.kies(HERKOMSTEN),
      nietBellenBron: c.nietBellen ?? false,
      aangemaaktInBronOp: aangemaakt,
      isLokaalTijdelijk: false,
    };
    contacten.push(contact);
    return contact;
  };
  const voegPandToe = (ext: string, contact: Contact | null, rol: PandRol = 'eigenaar', extra?: Partial<Pand>): Pand => {
    const [postcode, gemeente] = contact?.postcode ? [contact.postcode, contact.gemeente ?? ''] : r.kies(GEMEENTEN);
    const pand: Pand = {
      ...basis,
      id: id(ext),
      bron: 'fictief',
      externId: ext,
      gebeurdOp: null,
      gewijzigdInBronOp: geimporteerdOp,
      straat: contact?.straat ?? `${r.kies(STRATEN)} ${r.tussen(1, 180)}`,
      postcode,
      gemeente,
      type: r.kies(PAND_TYPES),
      omschrijving: null,
      ...extra,
    };
    panden.push(pand);
    if (contact) koppel(contact, pand, rol);
    return pand;
  };
  const koppel = (contact: Contact, pand: Pand, rol: PandRol) => {
    contactPanden.push({ id: id(`cp:${contact.externId}:${pand.externId}`), contactId: contact.id, pandId: pand.id, rol, isTestdata: true });
  };
  let actTeller = 0;
  const activiteit = (
    contact: Contact | null,
    type: Bronactiviteit['type'],
    dagenGeleden: number,
    tekst: string,
    extra: Partial<Bronactiviteit> = {},
  ): Bronactiviteit => {
    actTeller++;
    const gebeurd = tijd(-dagenGeleden, willekeurigUur());
    const gebeurdOp = gebeurd > nu ? nu : gebeurd;
    const a: Bronactiviteit = {
      ...basis,
      id: id(`act:${actTeller}`),
      bron: 'fictief',
      externId: `FIC-ACT-${String(actTeller).padStart(4, '0')}`,
      gebeurdOp,
      gewijzigdInBronOp: verwerktOp(gebeurdOp),
      type,
      contactId: contact?.id ?? null,
      pandId: null,
      taakSoort: null,
      vervaltOp: null,
      vervaltUur: null,
      taakAfgerond: false,
      auteur: type === 'evaluatie' ? 'Donna' : 'JV',
      tekst,
      ...extra,
    };
    activiteiten.push(a);
    return a;
  };
  const terugbeltaak = (contact: Contact, aangemaaktDagenGeleden: number, vervalt: DagKey, uur: string | null, tekst: string, afgerond = false) =>
    activiteit(contact, 'taak', aangemaaktDagenGeleden, tekst, { taakSoort: 'terugbellen', vervaltOp: vervalt, vervaltUur: uur, taakAfgerond: afgerond, auteur: 'Donna' });
  let pogingTeller = 0;
  const lokalePoging = (contact: Contact, dagenGeleden: number, uur: string, uitkomst: Belpoging['uitkomst'], notitie: string | null = null) => {
    pogingTeller++;
    belpogingen.push({
      id: id(`poging:${pogingTeller}`),
      contactId: contact.id,
      tijdstip: tijd(-dagenGeleden, uur),
      uitkomst,
      kanaal: 'telefoon',
      isInhoudelijk: uitkomst !== 'geen_antwoord',
      notitie,
      volgendeStap: null,
      ongedaanOp: null,
      isTestdata: true,
    });
  };
  let afspraakTeller = 0;
  const afspraak = (dagOffset: number, van: string, tot: string, titel: string, contact: Contact | null, extra: Partial<Afspraak> = {}) => {
    afspraakTeller++;
    const ext = extra.externId ?? `FIC-A-${String(afspraakTeller).padStart(3, '0')}`;
    afspraken.push({
      ...basis,
      id: id(ext),
      bron: 'fictief',
      externId: ext,
      gebeurdOp: tijd(dagOffset, van),
      gewijzigdInBronOp: geimporteerdOp,
      titel,
      start: tijd(dagOffset, van),
      einde: tijd(dagOffset, tot),
      heleDag: false,
      locatie: contact?.straat ? `${contact.straat}, ${contact.gemeente}` : null,
      contactId: contact?.id ?? null,
      koppelStatus: contact ? 'bevestigd' : 'geen',
      omschrijving: null,
      belpogingId: null,
      ...extra,
    });
  };

  // ================= Randgevallen (vaste contacten) =================

  const peeters = voegContactToe({ ext: RANDGEVAL.terugbellenVandaagMetUur, aanhef: 'Mevr.', voornaam: 'Annick', achternaam: 'Peeters', status: 'prospect', fase: 'lauw', horizon: 'tegen de zomer', aanspreek: 'u', aangemaaktDagGeleden: 140 });
  voegPandToe('FIC-P-001', peeters);
  activiteit(peeters, 'gesprek', 35, 'Tel. gehad m. mevr. Peeters. Huis te groot sinds man overleden, twijfelt nog. Wil eerst met dochter praten.');
  activiteit(peeters, 'evaluatie', 34, 'Eval: lauw. Motivatie: huis te groot. Prijsverw. ± €420k (vlgs mij te hoog, eerder 380). Beslist samen met dochter Ann.');
  activiteit(peeters, 'gesprek', 6, 'Kort tel., dochter was er nog nt bij. Vraagt tb dinsdag om half 11.');
  terugbeltaak(peeters, 6, vandaag, '10:30', 'TB mevr. Peeters di 10u30 — dochter zou er dan bij zijn');

  const claes = voegContactToe({ ext: RANDGEVAL.nieuweLeadLokaalGeenAntwoord, aanhef: 'Dhr.', voornaam: 'Bart', achternaam: 'Claes', status: 'nieuwe_lead', fase: null, herkomst: 'website schattingsaanvraag', aangemaaktDagGeleden: 1 });
  voegPandToe('FIC-P-002', claes, 'eigenaar', { type: 'woning', omschrijving: 'HOB, 3 slpk, tuin' });
  activiteit(claes, 'notitie', 1, 'Nieuwe aanvraag via site: schatting woning, "liefst snel". Geen verdere info.', { auteur: 'website' });
  // Lokaal resultaat dat nog NIET in de CRM-bron staat:
  lokalePoging(claes, 1, '17:40', 'geen_antwoord');

  const janssens = voegContactToe({ ext: RANDGEVAL.terugbellenVerstreken, aanhef: 'Fam.', voornaam: 'Marc & Sofie', achternaam: 'Janssens', status: 'prospect', fase: 'lauw', horizon: 'volgend voorjaar', aanspreek: 'u', aangemaaktDagGeleden: 95 });
  voegPandToe('FIC-P-003', janssens, 'eigenaar', { type: 'woning' });
  activiteit(janssens, 'gesprek', 25, 'Gesprek m. Sofie J. Bouwen nieuw in Lochristi, verkoop pas als nieuwbouw klaar. Marc wil eerst aannemer zien.');
  activiteit(janssens, 'evaluatie', 24, 'Eval: lauw→warm? Afh. van planning aannemer. Bezwaar: commissie. TB vrijdag ivm planning.');
  terugbeltaak(janssens, 24, dag(-4), null, 'TB fam. Janssens vr — planning aannemer?');

  const wouters = voegContactToe({ ext: RANDGEVAL.warmOverRitme, aanhef: 'Dhr.', voornaam: 'Pieter', achternaam: 'Wouters', status: 'prospect', fase: 'warm', horizon: 'binnen 3 mnd', aanspreek: 'je', aangemaaktDagGeleden: 60 });
  voegPandToe('FIC-P-004', wouters, 'eigenaar', { type: 'appartement' });
  activiteit(wouters, 'gesprek', 21, 'Pieter (zegt "je" mag) wil app. verkopen, verhuist voor werk naar Antwerpen. Wil eerst offerte van ons en van Immo X.');
  activiteit(wouters, 'evaluatie', 20, 'Eval: warm. Horizon < 3 mnd. Prijsverw. 265k. Vergelijkt met concurrent. Volgende stap: voorstel + referenties.');

  const maes = voegContactToe({ ext: RANDGEVAL.koudLangGeleden, aanhef: 'Mevr.', voornaam: 'Rita', achternaam: 'Maes', status: 'langetermijn', fase: 'koud', horizon: 'na pensioen (2028)', aanspreek: 'u', aangemaaktDagGeleden: 420 });
  voegPandToe('FIC-P-005', maes, 'eigenaar', { type: 'woning' });
  activiteit(maes, 'gesprek', 200, 'Mevr. Maes: "pas als ik met pensioen ben", wil wel een schatting ter info. Vriendelijk, geen haast.');

  const dubois = voegContactToe({ ext: RANDGEVAL.lauwOverRitme, aanhef: 'Dhr.', voornaam: 'Luc', achternaam: 'Dubois', status: 'prospect', fase: 'lauw', horizon: 'ergens volgend jaar', aanspreek: 'u', aangemaaktDagGeleden: 180 });
  voegPandToe('FIC-P-006', dubois, 'eigenaar', { type: 'woning' });
  dubois.email = 'luc.dubois@voorbeeld.test';
  activiteit(dubois, 'gesprek', 50, 'Dhr. Dubois wil kleiner wonen, ergens volgend jaar. Vrouw nog nt overtuigd.');

  const willems = voegContactToe({ ext: RANDGEVAL.koudNogNietAanDeBeurt, aanhef: 'Mevr.', voornaam: 'Els', achternaam: 'Willems', status: 'langetermijn', fase: 'koud', horizon: 'nog geen idee, mss over 2 jaar', aanspreek: 'u', aangemaaktDagGeleden: 300 });
  voegPandToe('FIC-P-007', willems);
  activiteit(willems, 'gesprek', 60, 'Kort gesprek, nog niks concreets. Mag over een paar maanden nog eens bellen.');

  const mertens = voegContactToe({ ext: RANDGEVAL.nietMeerBellen, aanhef: 'Dhr.', voornaam: 'Jan', achternaam: 'Mertens', status: 'prospect', fase: 'warm', aanspreek: 'u', nietBellen: true, aangemaaktDagGeleden: 200 });
  voegPandToe('FIC-P-008', mertens);
  activiteit(mertens, 'gesprek', 30, 'Dhr. Mertens WIL NIET MEER GEBELD WORDEN. Verkoopt via andere makelaar. Uit lijst halen aub.');
  activiteit(mertens, 'evaluatie', 29, 'Eval: niet meer contacteren op vraag van klant. (Donna)');

  const goossens = voegContactToe({ ext: RANDGEVAL.terugbellenNaMaanden, aanhef: 'Fam.', voornaam: null, achternaam: 'Goossens', status: 'langetermijn', fase: 'lauw', horizon: 'volgend voorjaar', aanspreek: 'u', aangemaaktDagGeleden: 150 });
  voegPandToe('FIC-P-009', goossens, 'eigenaar', { type: 'woning' });
  activiteit(goossens, 'gesprek', 12, 'Fam. Goossens: eerst bdk verbouwen + feestdagen. Expliciet gevraagd: bel terug na nieuwjaar, nt eerder!');
  terugbeltaak(goossens, 12, dag(83), null, 'TB fam. Goossens na nieuwjaar (op vraag klant, niet eerder bellen)');

  // Meerdere eigenaars/beslissers voor één pand (erfenis)
  const vdbKoen = voegContactToe({ ext: RANDGEVAL.erfgenaamA, aanhef: 'Dhr.', voornaam: 'Koen', achternaam: 'Van den Broeck', status: 'prospect', fase: 'warm', horizon: 'tegen eind dit jaar', aanspreek: 'u', aangemaaktDagGeleden: 40, gemeente: ['9820', 'Merelbeke'] });
  const vdbLien = voegContactToe({ ext: RANDGEVAL.erfgenaamB, aanhef: 'Mevr.', voornaam: 'Lien', achternaam: 'Van den Broeck', status: 'prospect', fase: 'lauw', aanspreek: 'je', aangemaaktDagGeleden: 40, gemeente: ['9000', 'Gent'] });
  const vdbDirk = voegContactToe({ ext: RANDGEVAL.erfgenaamC, aanhef: 'Dhr.', voornaam: 'Dirk', achternaam: 'Van den Broeck', status: 'prospect', fase: null, aangemaaktDagGeleden: 38, gemeente: ['9230', 'Wetteren'] });
  const erfpand = voegPandToe(RANDGEVAL.pandErfenis, null, 'eigenaar', { straat: 'Lindenlaan 14', postcode: '9090', gemeente: 'Melle', type: 'woning', omschrijving: 'ouderlijke woning, erfenis 3 kinderen' });
  koppel(vdbKoen, erfpand, 'beslisser');
  koppel(vdbLien, erfpand, 'mede_eigenaar');
  koppel(vdbDirk, erfpand, 'erfgenaam');
  activiteit(vdbKoen, 'gesprek', 18, 'Koen VdB: ouderlijk huis Melle, 3 erfgenamen. Koen trekt de kar, Lien akkoord, Dirk "moet nog nadenken".');
  activiteit(vdbKoen, 'evaluatie', 17, 'Eval: warm bij Koen, maar beslissing pas als alle 3 akkoord. Notaris: Mr. De Wolf. Volgende stap: gesprek met de 3 samen.');
  activiteit(vdbLien, 'notitie', 15, 'Lien VdB belde zelf: "van mij mag het, maar Dirk wil een hogere prijs". tutoyeert.');
  lokalePoging(vdbKoen, 6, '10:20', 'geen_antwoord');
  lokalePoging(vdbKoen, 4, '16:45', 'geen_antwoord');

  // Eén contact met meerdere panden
  const verstraete = voegContactToe({ ext: RANDGEVAL.meerderePanden, aanhef: 'Dhr.', voornaam: 'Filip', achternaam: 'Verstraete', status: 'prospect', fase: 'lauw', horizon: 'volgend voorjaar', aanspreek: 'u', herkomst: 'doorverwezen door notaris', aangemaaktDagGeleden: 70 });
  voegPandToe('FIC-P-013A', verstraete, 'eigenaar', { type: 'appartement', straat: 'Kouterstraat 5 bus 2', omschrijving: 'verhuurd tot 03/2027' });
  voegPandToe('FIC-P-013B', verstraete, 'eigenaar', { type: 'appartement', straat: 'Kouterstraat 5 bus 4', omschrijving: 'leeg' });
  voegPandToe('FIC-P-013C', verstraete, 'eigenaar', { type: 'opbrengsteigendom', straat: 'Stationsstraat 88', gemeente: 'Wetteren', postcode: '9230', omschrijving: '4 studio\'s' });
  activiteit(verstraete, 'gesprek', 33, 'Dhr. Verstraete, investeerder, wil uitstappen. Eerst bus 4 (leeg), later rest. Huurcontract bus 2 loopt tot 03/27.');

  // Contact zonder telefoonnummer
  const lambert = voegContactToe({ ext: RANDGEVAL.zonderTelefoon, aanhef: 'Mevr.', voornaam: 'Nadia', achternaam: 'Lambert', status: 'nieuwe_lead', fase: null, herkomst: 'open huis', geenTelefoon: true, aangemaaktDagGeleden: 3 });
  activiteit(lambert, 'notitie', 3, 'Mevr. Lambert op open huis, wil eigen woning laten schatten. Enkel e-mail achtergelaten, gsm vergeten noteren.');

  // Tegenstrijdige notities
  const desmet = voegContactToe({ ext: RANDGEVAL.tegenstrijdig, aanhef: 'Dhr.', voornaam: 'Kurt', achternaam: 'Desmet', status: 'prospect', fase: 'warm', horizon: 'asap', aanspreek: 'u', aangemaaktDagGeleden: 55 });
  voegPandToe('FIC-P-015', desmet, 'eigenaar', { type: 'woning' });
  activiteit(desmet, 'evaluatie', 28, 'Eval: WARM. Wil asap verkopen, verhuist naar Spanje. Prijsverw. 510k.');
  activiteit(desmet, 'gesprek', 9, 'Dhr. Desmet toch twijfels, vrouw wil blijven tot pensioen (2028?). Spanje "mss later". Eerder lauw nu.');

  const hermans = voegContactToe({ ext: RANDGEVAL.terugbellenVandaagZonderUur, aanhef: 'Mevr.', voornaam: 'Katrien', achternaam: 'Hermans', status: 'prospect', fase: 'warm', horizon: 'tegen eind dit jaar', aanspreek: 'u', aangemaaktDagGeleden: 45 });
  voegPandToe('FIC-P-016', hermans);
  activiteit(hermans, 'gesprek', 7, 'Mevr. Hermans: EPC is binnen, wil volgende week beslissen. TB volgende di.');
  terugbeltaak(hermans, 7, vandaag, null, 'TB mevr. Hermans — beslissing na EPC');

  const jacobs = voegContactToe({ ext: RANDGEVAL.nieuweLeadDrieKeerGeenAntwoord, aanhef: 'Dhr.', voornaam: 'Tom', achternaam: 'Jacobs', status: 'nieuwe_lead', fase: null, herkomst: 'flyer bus', aangemaaktDagGeleden: 8 });
  activiteit(jacobs, 'notitie', 8, 'Reactie op flyer: "bel me eens over schatting". Geen tijdstip vermeld.', { auteur: 'Donna' });
  lokalePoging(jacobs, 7, '09:15', 'geen_antwoord');
  lokalePoging(jacobs, 5, '17:50', 'geen_antwoord');
  lokalePoging(jacobs, 1, '12:05', 'geen_antwoord');

  const aerts = voegContactToe({ ext: RANDGEVAL.nieuweLeadVandaag, aanhef: 'Mevr.', voornaam: 'Veerle', achternaam: 'Aerts', status: 'nieuwe_lead', fase: null, herkomst: 'website schattingsaanvraag', aangemaaktDagGeleden: 0 });
  activiteit(aerts, 'notitie', 0, 'Webaanvraag vannacht: app. 2 slpk, wil weten wat het waard is. "Bereikbaar na 17u".', { auteur: 'website' });

  const michiels = voegContactToe({ ext: RANDGEVAL.afspraakVandaag, aanhef: 'Dhr.', voornaam: 'Geert', achternaam: 'Michiels', status: 'prospect', fase: 'warm', horizon: 'binnen 3 mnd', aanspreek: 'u', aangemaaktDagGeleden: 20 });
  voegPandToe('FIC-P-019', michiels, 'eigenaar', { type: 'woning' });
  activiteit(michiels, 'gesprek', 5, 'Dhr. Michiels: afspraak schatting vastgelegd. Wil weten wat haalbaar is voor ze iets nieuws kopen.');
  afspraak(0, '14:00', '15:00', 'Schatting woning Michiels', michiels);

  const smets = voegContactToe({ ext: RANDGEVAL.afspraakOverlap, aanhef: 'Mevr.', voornaam: 'Inge', achternaam: 'Smets', status: 'prospect', fase: 'lauw', horizon: 'tegen de zomer', aanspreek: 'u', aangemaaktDagGeleden: 30 });
  voegPandToe('FIC-P-020', smets, 'eigenaar', { type: 'appartement' });
  activiteit(smets, 'gesprek', 10, 'Mevr. Smets: plaatsbezoek gevraagd, broer komt mee (mede-eigenaar?).');
  afspraak(0, '10:00', '11:00', 'Plaatsbezoek app. Smets', smets);
  afspraak(0, '10:30', '11:00', 'Teamoverleg kantoor', null, { locatie: 'Kantoor ERA', koppelStatus: 'geen' });
  afspraak(0, '16:30', '17:15', 'Bezichtiging Kerkstraat 12, Aalst', null, {
    externId: RANDGEVAL.afspraakZonderContact,
    locatie: 'Kerkstraat 12, 9300 Aalst',
    koppelStatus: 'geen',
    omschrijving: 'Via Donna. Naam eigenaar nt genoteerd — "dhr. Van H...?"',
  });

  // Andere dagen in de testagenda
  afspraak(1, '00:00', '23:59', 'ERA opleiding (hele dag)', null, { heleDag: true, locatie: 'Gent', koppelStatus: 'geen' });
  afspraak(2, '09:30', '10:30', 'Schatting app. Wouters', wouters);
  afspraak(3, '15:00', '16:00', 'Gesprek erfgenamen Van den Broeck', vdbKoen);
  afspraak(-1, '11:00', '12:00', 'Schatting Hermans', hermans);

  // ================= Overige contacten (gegenereerd) =================
  // Verdeling zo dat het totaal op ±60 komt: ±12 nieuwe leads, ±25 prospects, ±23 langetermijn.
  const verdeling: ContactStatus[] = [
    ...Array<ContactStatus>(7).fill('nieuwe_lead'),
    ...Array<ContactStatus>(12).fill('prospect'),
    ...Array<ContactStatus>(20).fill('langetermijn'),
  ];
  const gebruikteNamen = new Set(contacten.map((c) => c.achternaam));
  verdeling.forEach((status, i) => {
    const ext = `FIC-C-${String(21 + i).padStart(3, '0')}`;
    const vrouw = r.kans(0.5);
    let achternaam = r.kies(ACHTERNAMEN);
    while (gebruikteNamen.has(achternaam)) achternaam = r.kies(ACHTERNAMEN);
    gebruikteNamen.add(achternaam);
    const fase: Fase | null =
      status === 'nieuwe_lead' ? null : status === 'prospect' ? r.kies<Fase>(['warm', 'lauw', 'lauw']) : r.kies<Fase>(['koud', 'koud', 'koud', 'lauw']);
    const horizonGroep = fase === 'warm' ? 'kort' : fase === 'lauw' ? r.kies(['kort', 'middel', 'middel'] as const) : r.kies(['middel', 'lang', 'lang'] as const);
    const horizon = status === 'nieuwe_lead' || r.kans(0.2) ? null : r.kies(HORIZON[horizonGroep]);
    const aangemaaktDagGeleden = status === 'nieuwe_lead' ? r.tussen(0, 20) : r.tussen(60, 700);
    const contact = voegContactToe({
      ext,
      aanhef: vrouw ? 'Mevr.' : 'Dhr.',
      voornaam: vrouw ? r.kies(VOORNAMEN_V) : r.kies(VOORNAMEN_M),
      achternaam,
      status,
      fase,
      horizon,
      aanspreek: status === 'nieuwe_lead' ? null : r.kans(0.15) ? 'je' : 'u',
      aangemaaktDagGeleden,
    });
    voegPandToe(`FIC-P-${String(21 + i).padStart(3, '0')}`, contact);

    if (status === 'nieuwe_lead') {
      activiteit(contact, 'notitie', aangemaaktDagGeleden, r.kies([
        'Webaanvraag schatting. Geen extra info.',
        'Belde naar kantoor, wil "eens horen wat het huis waard is". TB gevraagd.',
        'Reactie op bord buurwoning. Interesse in verkoop, timing onbekend.',
        'Lead via notaris, erfenis. Contact opnemen.',
      ]), { auteur: r.kies(['Donna', 'website']) });
      if (aangemaaktDagGeleden >= 2 && r.kans(0.3)) lokalePoging(contact, r.tussen(1, aangemaaktDagGeleden - 1), willekeurigUur(), 'geen_antwoord');
      return;
    }

    // Laatste inhoudelijk contact afhankelijk van fase
    const laatste = fase === 'warm' ? r.tussen(3, 30) : fase === 'lauw' ? r.tussen(10, 80) : r.tussen(20, 320);
    const motivatie = r.kies(MOTIVATIES);
    const eerste = laatste + r.tussen(20, 200);
    activiteit(contact, 'gesprek', eerste, `Eerste contact. ${motivatie}. ${r.kans(0.5) ? 'Wil info over werkwijze.' : 'Nog geen beslissing.'}`);
    if (r.kans(0.6)) {
      activiteit(contact, 'evaluatie', eerste - 1, `Eval: ${fase}. Motivatie: ${motivatie}. Prijsverw. ± €${r.tussen(28, 65) * 10}k. ${r.kans(0.5) ? `Bezwaar: ${r.kies(BEZWAREN)}.` : ''} Volgende stap: ${r.kies(STAPPEN)}.`);
    }
    activiteit(contact, 'gesprek', laatste, r.kies([
      `Tel. gehad, ${horizon ? `denkt aan ${horizon}` : 'timing nog onduidelijk'}. ${r.kans(0.4) ? `Partner twijfelt nog.` : ''}`,
      `Kort gesprek, ${r.kies(BEZWAREN)}. Blijft wel geïnteresseerd.`,
      `Gesprek ok. ${r.kies(STAPPEN)} afgesproken. Evt. later nog bellen.`,
      `Mevr/dhr nt veel tijd, "bel later eens terug". ${horizon ?? ''}`,
    ]));
    if (r.kans(0.25)) {
      // Afgeronde of toekomstige terugbeltaak
      const toekomst = r.kans(0.5);
      terugbeltaak(contact, laatste, toekomst ? dag(r.tussen(5, 60)) : dag(-laatste + 7), null, `TB ${contact.aanhef ?? ''} ${achternaam}`.trim(), !toekomst);
    }
    if (r.kans(0.15)) {
      activiteit(contact, 'taak', laatste, 'Schattingsverslag opsturen', { taakSoort: 'algemeen', vervaltOp: dag(-laatste + 3), taakAfgerond: true, auteur: 'Donna' });
    }
  });

  // ---------- Contactstrategie: fictieve haken en voorkeuren ----------
  const haak = (sleutel: string, h: Omit<Waardehaak, 'id' | 'aangemaaktOp' | 'isTestdata' | 'detail' | 'bron' | 'gevoelig'> & Partial<Waardehaak>): Waardehaak => ({
    id: id(`haak:${sleutel}`),
    detail: null,
    bron: 'fictief voorbeeld',
    gevoelig: false,
    aangemaaktOp: geimporteerdOp,
    isTestdata: true,
    ...h,
  });
  const haken: Waardehaak[] = [
    haak('buurt-melle', {
      contactId: null, pandId: null, straat: 'Lindenlaan', gemeente: 'Melle', soort: 'buurt',
      onderwerp: 'Woning in de Lindenlaan verkocht na 3 weken', detail: 'Fictief voorbeeld van een buurtsignaal (later uit de Marktradar).',
      geldigVanaf: dag(-5), geldigTot: dag(25),
    }),
    haak('algemeen-premie', {
      contactId: null, pandId: null, straat: null, gemeente: null, soort: 'algemeen',
      onderwerp: 'Nieuwe regels rond EPC bij verkoop (fictief voorbeeld)', detail: 'Altijd de echte bron vermelden vóór gebruik.',
      geldigVanaf: dag(-10), geldigTot: dag(50),
    }),
    haak('persoonlijk-hermans', {
      contactId: id(RANDGEVAL.persoonlijkeHaak), pandId: null, straat: null, gemeente: null, soort: 'persoonlijk',
      onderwerp: 'Verjaardag op ' + dag(1).slice(8, 10) + '/' + dag(1).slice(5, 7), detail: 'Zelf ingegeven (fictief).',
      geldigVanaf: dag(-1), geldigTot: dag(1),
    }),
    haak('gevoelig-peeters', {
      contactId: id(RANDGEVAL.terugbellenVandaagMetUur), pandId: null, straat: null, gemeente: null, soort: 'persoonlijk',
      onderwerp: 'Man overleden vorig jaar', gevoelig: true,
      geldigVanaf: dag(-30), geldigTot: null,
    }),
    haak('verlopen-wouters', {
      contactId: id(RANDGEVAL.warmOverRitme), pandId: null, straat: null, gemeente: null, soort: 'dossier',
      onderwerp: 'Opendeurdag nieuwbouwproject (voorbij)',
      geldigVanaf: dag(-40), geldigTot: dag(-10),
    }),
  ];
  const voorkeuren: Contactvoorkeur[] = [
    { contactId: id(RANDGEVAL.voorkeurMail), kanaal: 'mail', nietVoor: null, nietNa: null, notitie: 'Liefst per mail (fictief)', isTestdata: true },
    { contactId: id(RANDGEVAL.voorkeurBericht), kanaal: 'bericht', nietVoor: null, nietNa: null, notitie: 'Stuurt liever een sms (fictief)', isTestdata: true },
    { contactId: id(RANDGEVAL.erfgenaamB), kanaal: 'geen', nietVoor: '17:00', nietNa: null, notitie: 'Werkt overdag, bellen na 17u', isTestdata: true },
  ];

  const bronnen: Bronstatus[] = [
    { id: id('bron:crm'), soort: 'crm', adapter: 'fictief', naam: 'CRM (fictief)', isTestdata: true, laatstSuccesvolOp: geimporteerdOp, laatsteFout: null },
    { id: id('bron:agenda'), soort: 'agenda', adapter: 'fictief', naam: 'Agenda (fictief)', isTestdata: true, laatstSuccesvolOp: new Date(nu.getTime() - 30 * 60_000), laatsteFout: null },
    { id: id('bron:gesprekken'), soort: 'gesprekken', adapter: 'handmatig', naam: 'Gesprekssamenvattingen', isTestdata: true, laatstSuccesvolOp: null, laatsteFout: null },
  ];

  return { contacten, panden, contactPanden, activiteiten, afspraken, belpogingen, bronnen, haken, voorkeuren };
}
