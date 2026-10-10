// Controles uit de opdracht (§21) op de fictieve demodataset.
import { describe, expect, it } from 'vitest';
import { genereerVerkoopDemo, SCENARIO as S } from '../../../fixtures/verkoop';
import { maakGeheugenOpslag, pasToe } from '../../core/verkoop/opslag';
import { claim, herbevestigingsActie, neemOp, registreerResultaat, startCampagne, wijsToe } from './acties';
import { bouwBellijst } from './bellijst';
import { interpreteerTekst } from './feedback';
import { actualiteit, berekenIntentie, koopbereidheidTekst } from './intentie';
import { bouwKandidatenlijst, openPrijsdalingen } from './kandidatenlijst';
import { berekenMatch } from './matching';
import type { Contactactie, PrijsRegistratie } from './model';
import { maakZinnen, VERBODEN_DRUK } from './openingszin';
import { matchesVanKandidaat, voorgesteldeKandidaten } from './pool';
import { prijsWijzigingen } from './prijs';
import { bouwStaat, type OpgeslagenRecord, type VerkoopStaat, type Wijziging } from './staat';

const VANDAAG = '2026-10-13';
const NU = new Date(`${VANDAAG}T08:30:00+02:00`);
const basis = genereerVerkoopDemo(VANDAAG, NU);

/** Een sessie zoals in de app: records + toestand, met bewaren via de versiecontrole. */
function sessie(records: OpgeslagenRecord[] = [], nu = NU) {
  let r = records;
  const s = {
    get staat(): VerkoopStaat {
      return bouwStaat(basis, r, nu);
    },
    get records() {
      return r;
    },
    bewaar(w: Wijziging[], door = 'm-jonas') {
      const uit = pasToe(r, w, door, nu);
      r = uit.records;
      return uit.resultaat;
    },
  };
  return s;
}

const zoek = (st: VerkoopStaat, id: string) => st.zoekopdrachten.find((z) => z.id === id)!;
let n = 0;
const maakId = () => `id-${++n}`;

function prijsdalingCampagne(s: ReturnType<typeof sessie>) {
  const daling = openPrijsdalingen(s.staat, S.pandPrijsdaling)[0]!;
  const c = startCampagne(s.staat, { pandId: S.pandPrijsdaling, soort: 'prijsdaling', door: 'm-jonas', nu: NU, daling });
  s.bewaar(c.wijzigingen);
  return c.campagne;
}

describe('matching', () => {
  it('een actieve zoekopdracht zonder bezoekhistoriek krijgt passende matches', () => {
    const st = sessie().staat;
    expect(st.bezoeken.some((b) => b.contactId === S.pieter)).toBe(false);
    const m = berekenMatch(st, zoek(st, 'z-claes'), S.pandLancering);
    expect(m.klasse).toBe('sterk');
    expect(m.redenen.join(' ')).toMatch(/binnen het bevestigd maximum/);
  });

  it('meerdere zoekscenario’s van dezelfde kandidaat blijven afzonderlijk', () => {
    const st = sessie().staat;
    const lijst = matchesVanKandidaat(st, S.dirk);
    expect(lijst.map((x) => x.zoekopdrachtId)).toEqual(['z-dirk-1', 'z-dirk-2']);
    const heverlee1 = berekenMatch(st, zoek(st, 'z-dirk-1'), S.pandGroteTuin);
    const heverlee2 = berekenMatch(st, zoek(st, 'z-dirk-2'), S.pandGroteTuin);
    expect(heverlee1.klasse).toBe('sterk');
    expect(heverlee2.klasse).toBe('uitgesloten'); // boven €350.000
    // Te renoveren pand: past enkel (onzeker) bij het tweede scenario.
    expect(berekenMatch(st, zoek(st, 'z-dirk-1'), S.pandOnvolledig).klasse).toBe('uitgesloten');
    expect(berekenMatch(st, zoek(st, 'z-dirk-2'), S.pandOnvolledig).klasse).not.toBe('uitgesloten');
  });

  it('een harde budgetgrens wordt gerespecteerd', () => {
    const st = sessie().staat;
    const m = berekenMatch(st, zoek(st, 'z-lotte'), S.pandGroteTuin); // €449.000 > €440.000
    expect(m.klasse).toBe('uitgesloten');
    expect(m.schendingen[0]).toMatch(/boven het budget/);
    const lijst = bouwKandidatenlijst(st, S.pandGroteTuin);
    expect(lijst.rijen.some((r) => r.contactId === S.lotte)).toBe(false);
  });

  it('een recent bod verhoogt de intentie zonder de pandmatch te verhogen', () => {
    const st = sessie().staat;
    const zonderBod = { ...st, biedingen: st.biedingen.filter((b) => b.contactId !== S.sanne) };
    expect(berekenIntentie(st, S.sanne).score).toBeGreaterThan(berekenIntentie(zonderBod, S.sanne).score ?? 0);
    expect(berekenMatch(st, zoek(st, 'z-sanne'), S.pandGroteTuin).score).toBe(berekenMatch(zonderBod, zoek(st, 'z-sanne'), S.pandGroteTuin).score);
  });

  it('dezelfde activiteit telt niet dubbel in de intentie', () => {
    const st = sessie().staat;
    const dubbel = { ...st, biedingen: [...st.biedingen, { ...st.biedingen.find((b) => b.contactId === S.elke)!, id: 'kopie' }] };
    expect(berekenIntentie(dubbel, S.elke).score).toBe(berekenIntentie(st, S.elke).score);
  });

  it('geen signalen = intentie onbekend, niet nul', () => {
    expect(berekenIntentie(sessie().staat, S.ruben).score).toBeNull();
  });

  it('onvolledige pandgegevens geven geen stellige (sterke) match en tonen de onzekerheid', () => {
    const st = sessie().staat;
    const m = berekenMatch(st, zoek(st, 'z-koen'), S.pandOnvolledig);
    expect(m.klasse).not.toBe('sterk');
    expect(m.onbekend.join(' ')).toMatch(/slaapkamers/i);
  });
});

describe('feedback uit gesprekken en bezoeken', () => {
  const tekst = (t: string) => interpreteerTekst({ id: 'n', contactId: 'k', pandId: 'p', dag: VANDAAG, tekst: t });

  it('"goede locatie en indeling, maar de tuin was te klein" → positief behouden + tuinbezwaar aan het pand', () => {
    const i = tekst('Goede locatie en indeling, maar de tuin was te klein.');
    expect(i.map((x) => `${x.soort}:${x.kenmerk}`).sort()).toEqual(['bezwaar:tuin', 'positief:indeling', 'positief:locatie']);
    expect(i.find((x) => x.kenmerk === 'tuin')!.pandId).toBe('p');
    expect(JSON.stringify(i)).not.toMatch(/m²|\d+ ?m2/); // geen verzonnen tuinmaat
  });

  it('"te duur voor wat het is" is prijs-kwaliteit, geen budgetverlaging', () => {
    expect(tekst('Te duur voor wat het is.').map((x) => x.kenmerk)).toEqual(['prijs_kwaliteit']);
  });

  it('"geen tuin nodig" maakt geen tuinvereiste', () => {
    expect(tekst('Geen tuin nodig, een terras volstaat.').map((x) => x.soort)).toEqual(['geen_eis']);
  });

  it('uitspraken over iemand anders worden niet aan de kandidaat toegeschreven', () => {
    const i = tekst('Zijn broer zoekt ook iets in Herent en vindt de prijs te hoog.');
    expect(i.map((x) => x.soort)).toEqual(['over_ander']);
  });

  it('nieuwe expliciete info gaat voor op een oud vermoeden', () => {
    const st = sessie().staat;
    const tuin = zoek(st, 'z-hilde').criteria.find((c) => c.sleutel === 'tuin')!;
    expect(tuin.status).toBe('verworpen');
    expect(st.opzijGezet.get(tuin.id)).toMatch(/Geen tuin nodig/);
  });

  it('tuinbezwaar: alternatief met aantoonbaar meer bruikbare tuin, zonder verzonnen maten', () => {
    const st = sessie().staat;
    const groot = berekenMatch(st, zoek(st, 'z-bram'), S.pandGroteTuin);
    expect(groot.bezwaarOpgelost[0]).toMatch(/±210 m² tegenover ±45 m²/);
    // Groter perceel maar onbekende bruikbare tuin: niet als oplossing gerekend.
    const perceel = berekenMatch(st, zoek(st, 'z-bram'), S.pandOnvolledig);
    expect(perceel.bezwaarOpgelost).toEqual([]);
    expect(perceel.onbekend.join(' ')).toMatch(/Groter perceel.*niet gerekend/);
    // Het zoekprofiel kreeg er geen minimale tuinoppervlakte bij.
    expect(zoek(st, 'z-bram').criteria.filter((c) => c.sleutel === 'tuin').map((c) => c.waarde)).toEqual([{ nodig: true }]);
  });
});

describe('koopbereidheid', () => {
  it('verouderde koopbereidheid vraagt herbevestiging, zonder de kandidaat te verwijderen', () => {
    const st = sessie().staat;
    const kw = st.kwalificaties.get(S.katrien)!;
    expect(actualiteit(kw, st.vandaag, 30).verouderd).toBe(true);
    expect(koopbereidheidTekst(st, S.katrien).label).toBe('Koopklaar (bevestiging verouderd)');
    expect(bouwKandidatenlijst(st, S.pandLancering).rijen.find((r) => r.contactId === S.katrien)?.aanbevolenStap).toMatch(/bevestigen of ze nog zoeken/);
  });

  it('zonder open pandactie verschijnt "opnieuw bevestigen" als opvolgactie in Vandaag bellen', () => {
    const s = sessie();
    const actie = s.staat.acties.find((a) => a.contactId === S.katrien)!;
    s.bewaar([{ soort: 'actie', id: actie.id, data: { ...actie, voortgang: 'afgerond' }, verwachteVersie: null }]);
    const kaart = bouwBellijst(s.staat, 'm-nicolas').kaarten.find((k) => k.contactId === S.katrien)!;
    expect(kaart.onderdelen[0]!.actie.soort).toBe('herbevestiging');
    expect(kaart.onderdelen[0]!.virtueel).toBe(true);
  });

  it('voorgestelde kandidaten steunen op recente signalen en zijn nog niet koopklaar', () => {
    const v = voorgesteldeKandidaten(sessie().staat);
    expect(v.map((x) => x.contactId).sort()).toEqual([S.lotte, S.sanne]);
    expect(sessie().staat.kwalificaties.has(S.sanne)).toBe(false);
  });
});

describe('vrijgave en berichten', () => {
  it('zonder contactvrijgave: interne match zichtbaar, aanbevolen stap = vrijgave vragen, geen pandgegevens in berichten', () => {
    const st = sessie().staat;
    const lijst = bouwKandidatenlijst(st, S.pandEnkelIntern);
    const griet = lijst.rijen.find((r) => r.contactId === S.griet)!;
    expect(griet.mag.contacteren).toBe(false);
    expect(griet.aanbevolenStap).toMatch(/Vrijgave/);
    const actie = { ...herbevestigingsActie(st, S.griet), soort: 'pand', pandId: S.pandEnkelIntern } as Contactactie;
    const z = maakZinnen(st, actie, griet, null);
    expect(z.openingszin).toBeNull();
    // Enkel een algemene vraag over de eigen zoektocht: geen adres, prijs of verwijzing naar het pand.
    expect(z.bericht).not.toMatch(/Stationsstraat|289|in voorbereiding|vraagprijs|appartement in/);
  });

  it('berichten bevatten geen niet-vrijgegeven adres of interne richtprijs en geen verzonnen druk', () => {
    const st = sessie().staat;
    const lijst = bouwKandidatenlijst(st, S.pandLancering, st.campagnes[0]!);
    for (const rij of lijst.rijen) {
      const actie = st.acties.find((a) => a.contactId === rij.contactId) ?? ({ ...herbevestigingsActie(st, S.pieter), contactId: rij.contactId, soort: 'pand', pandId: S.pandLancering } as Contactactie);
      const z = maakZinnen(st, actie, rij, st.campagnes[0]!);
      const alles = `${z.openingszin} ${z.bericht}`;
      expect(alles).not.toMatch(/Lindedreef|465\.000/);
      for (const v of VERBODEN_DRUK) expect(alles).not.toMatch(v);
    }
  });

  it('openingszin vóór publicatie volgt het voorbeeld', () => {
    const st = sessie().staat;
    const rij = bouwKandidatenlijst(st, S.pandLancering).rijen.find((r) => r.contactId === S.pieter)!;
    const z = maakZinnen(st, st.acties.find((a) => a.contactId === S.pieter)!, rij, st.campagnes[0]!);
    expect(z.openingszin).toBe(
      'Dag Pieter, je gaf aan dat je nog zoekt naar een woning met drie slaapkamers en een tuin rond Bertem. We hebben een woning in voorbereiding in Bertem die daarbij lijkt aan te sluiten. Zoeken jullie nog steeds in die richting?',
    );
  });
});

describe('prijsdaling', () => {
  const reg = (id: string, bedrag: number, dag: string): PrijsRegistratie => ({ id, pandId: 'p', soort: 'vraagprijs', bedrag, valuta: 'EUR', dag, bron: 'eraforce', door: null });

  it('een eerste prijsregistratie is geen prijsdaling', () => {
    expect(prijsWijzigingen([reg('a', 300000, '2026-09-01')], new Map())).toEqual([]);
    expect(openPrijsdalingen(sessie().staat, S.pandEersteprijs)).toEqual([]);
  });

  it('twijfelgevallen (grote sprong of snelle correctie) moeten bevestigd worden', () => {
    expect(prijsWijzigingen([reg('a', 400000, '2026-09-01'), reg('b', 250000, '2026-09-20')], new Map())[0]!.status).toBe('twijfel');
    expect(prijsWijzigingen([reg('a', 400000, '2026-09-01'), reg('b', 390000, '2026-09-02')], new Map())[0]!.status).toBe('twijfel');
    expect(prijsWijzigingen([reg('a', 400000, '2026-09-01'), reg('b', 390000, '2026-09-02')], new Map([['b', 'prijsdaling']]))[0]!.status).toBe('bevestigd');
  });

  it('activeert relevante kandidaten met concrete uitleg en respecteert onveranderde bezwaren', () => {
    const s = sessie();
    const c = prijsdalingCampagne(s);
    const lijst = bouwKandidatenlijst(s.staat, S.pandPrijsdaling, c);
    const sarah = lijst.rijen.find((r) => r.contactId === S.sarah)!;
    const tom = lijst.rijen.find((r) => r.contactId === S.tom)!;
    expect(sarah.redenen).toContain('Eerder afgehaakt vanwege de prijs; nieuwe vraagprijs sluit aan op het besproken bereik.');
    expect(tom.redenen).toContain('Nieuwe vraagprijs valt binnen het opgegeven budget.');
    expect(lijst.rijen.some((r) => r.contactId === S.marc)).toBe(false);
    expect(lijst.uitgesloten.find((u) => u.contactId === S.marc)!.reden).toMatch(/ligging.*prijsdaling verandert dat niet/i);
  });

  it('herhaalde verwerking maakt geen dubbele campagne of actie', () => {
    const s = sessie();
    const c = prijsdalingCampagne(s);
    const daling = prijsWijzigingen(s.staat.prijzen, s.staat.prijsoordelen, S.pandPrijsdaling)[0]!;
    expect(startCampagne(s.staat, { pandId: S.pandPrijsdaling, soort: 'prijsdaling', door: 'm-sofie', nu: NU, daling }).wijzigingen).toEqual([]);
    const rij = bouwKandidatenlijst(s.staat, S.pandPrijsdaling, c).rijen.find((r) => r.contactId === S.sarah)!;
    const eerste = neemOp(s.staat, { rij, campagne: c, uitvoerderId: 'm-nicolas', door: 'm-jonas', nu: NU });
    expect(eerste.resultaat).toBe('nieuw');
    expect(s.bewaar(eerste.wijzigingen).ok).toBe(true);
    const tweede = neemOp(s.staat, { rij, campagne: c, uitvoerderId: 'm-nicolas', door: 'm-jonas', nu: NU });
    expect(tweede.resultaat).toBe('bestaat');
    expect(s.staat.acties.filter((a) => a.contactId === S.sarah)).toHaveLength(1);
  });

  it('een afgewezen pand komt pas terug als het werkelijke (prijs)bezwaar verandert; elke nieuwe daling is een nieuwe aanleiding', () => {
    const s = sessie();
    const eerste = prijsdalingCampagne(s);
    const pandActie = (contactId: string) => ({ ...herbevestigingsActie(s.staat, contactId), id: `a-${contactId}`, soort: 'pand', pandId: S.pandPrijsdaling }) as Contactactie;
    // Tom wijst af om de ligging, Sarah (opnieuw) om de prijs.
    s.bewaar(registreerResultaat(s.staat, { contactId: S.tom, acties: [pandActie(S.tom)], uitkomst: 'geen_interesse', reden: 'ligging', door: 'm-sofie', nu: NU, maakId, gesimuleerd: true }).wijzigingen);
    s.bewaar(registreerResultaat(s.staat, { contactId: S.sarah, acties: [pandActie(S.sarah)], uitkomst: 'geen_interesse', reden: 'prijs', door: 'm-nicolas', nu: NU, maakId, gesimuleerd: true }).wijzigingen);
    expect(bouwKandidatenlijst(s.staat, S.pandPrijsdaling, eerste).rijen.map((r) => r.contactId)).not.toContain(S.tom);
    // Nieuwe, handmatig geregistreerde prijsdaling.
    s.bewaar([{ soort: 'prijs', id: 'pr-handmatig', data: { id: 'pr-handmatig', pandId: S.pandPrijsdaling, soort: 'vraagprijs', bedrag: 375000, valuta: 'EUR', dag: VANDAAG, bron: 'handmatig', door: 'm-jonas' }, verwachteVersie: null }]);
    const daling = openPrijsdalingen(s.staat, S.pandPrijsdaling)[0]!;
    expect(daling).toMatchObject({ registratieId: 'pr-handmatig', van: 389000, naar: 375000, status: 'zeker' });
    const tweede = startCampagne(s.staat, { pandId: S.pandPrijsdaling, soort: 'prijsdaling', door: 'm-jonas', nu: NU, daling });
    expect(tweede.campagne.id).not.toBe(eerste.id);
    s.bewaar(tweede.wijzigingen);
    const lijst = bouwKandidatenlijst(s.staat, S.pandPrijsdaling, tweede.campagne);
    expect(lijst.uitgesloten.find((u) => u.contactId === S.tom)!.reden).toMatch(/Wees dit pand af.*ligging/);
    expect(lijst.rijen.find((r) => r.contactId === S.sarah)!.categorieen).toContain('prijsbezwaar');
  });
});

describe('gedeelde acties, toewijzing en claims', () => {
  it('de kantoorlijst en de persoonlijke bellijst delen hetzelfde record', () => {
    const s = sessie();
    const c = prijsdalingCampagne(s);
    const rij = bouwKandidatenlijst(s.staat, S.pandPrijsdaling, c).rijen.find((r) => r.contactId === S.sarah)!;
    s.bewaar(neemOp(s.staat, { rij, campagne: c, uitvoerderId: 'm-nicolas', door: 'm-jonas', nu: NU }).wijzigingen);
    const kaart = bouwBellijst(s.staat, 'm-nicolas').kaarten.find((k) => k.contactId === S.sarah)!;
    const actie = kaart.onderdelen[0]!.actie;
    // Resultaat registreren vanuit Vandaag bellen …
    s.bewaar(registreerResultaat(s.staat, { contactId: S.sarah, acties: [actie], uitkomst: 'bezoek', bezoek: { dag: '2026-10-17', uur: '10:00' }, door: 'm-nicolas', nu: NU, maakId, gesimuleerd: true }).wijzigingen, 'm-nicolas');
    // … is meteen zichtbaar bij het pand.
    const bijPand = bouwKandidatenlijst(s.staat, S.pandPrijsdaling, c).rijen.find((r) => r.contactId === S.sarah)!;
    expect(bijPand.actie!.id).toBe(actie.id);
    expect(bijPand.actie!.voortgang).toBe('bezoek_gepland');
    expect(bijPand.actie!.bezoek).toMatchObject({ dag: '2026-10-17', uur: '10:00' });
    expect(s.staat.kwalificaties.get(S.sarah)!.laatsteBevestiging!.op).toBe(VANDAAG);
  });

  it('een toewijzing door Jonas verschijnt in de sessie van Nicolas (gedeelde opslag)', async () => {
    const gedeeld = { records: [] as OpgeslagenRecord[] };
    const jonas = maakGeheugenOpslag(gedeeld);
    const nicolas = maakGeheugenOpslag(gedeeld);
    const stJ = bouwStaat(basis, await jonas.laad(), NU);
    const rij = bouwKandidatenlijst(stJ, S.pandGroteTuin).rijen.find((r) => r.contactId === S.bram)!;
    const c = startCampagne(stJ, { pandId: S.pandGroteTuin, soort: 'lancering', door: 'm-jonas', nu: NU });
    await jonas.bewaar(c.wijzigingen, 'm-jonas');
    const stJ2 = bouwStaat(basis, await jonas.laad(), NU);
    await jonas.bewaar(neemOp(stJ2, { rij, campagne: c.campagne, uitvoerderId: 'm-nicolas', door: 'm-jonas', nu: NU, verzoek: 'Lost zijn tuinbezwaar op' }).wijzigingen, 'm-jonas');
    const stN = bouwStaat(basis, await nicolas.laad(), NU);
    const kaart = bouwBellijst(stN, 'm-nicolas').kaarten.find((k) => k.contactId === S.bram)!;
    expect(kaart.verzoek).toBe('Lost zijn tuinbezwaar op');
    expect(kaart.onderdelen[0]!.waarom.join(' ')).toMatch(/tuinbezwaar/);
  });

  it('gelijktijdige claims: een geldige claim van een collega blokkeert, een vergeten claim vervalt', () => {
    const s = sessie();
    const actie = s.staat.acties.find((a) => a.contactId === S.pieter)!;
    const n1 = claim(s.staat, actie, 'm-nicolas', NU);
    expect(n1.ok).toBe(true);
    if (n1.ok) s.bewaar([n1.wijziging], 'm-nicolas');
    const geclaimd = s.staat.acties.find((a) => a.id === actie.id)!;
    expect(claim(s.staat, geclaimd, 'm-sofie', NU)).toMatchObject({ ok: false, door: 'm-nicolas' });
    const later = new Date(NU.getTime() + 25 * 60_000);
    expect(claim(bouwStaat(basis, s.records, later), geclaimd, 'm-sofie', later).ok).toBe(true);
    // Twee gelijktijdige claims op dezelfde versie: de tweede wordt geweigerd.
    const st = s.staat;
    const a = claim(st, geclaimd, 'm-nicolas', later);
    const b = claim(st, geclaimd, 'm-sofie', later);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(s.bewaar([a.wijziging]).ok).toBe(true);
      expect(s.bewaar([b.wijziging]).ok).toBe(false);
    }
  });

  it('overnemen is zichtbaar in de historiek; relatie-eigenaar en uitvoerder blijven gescheiden', () => {
    const s = sessie();
    const smets = s.staat.acties.find((a) => a.contactId === S.ruben)!;
    s.bewaar([wijsToe(s.staat, smets, { uitvoerderId: 'm-nicolas', door: 'm-nicolas', nu: NU })], 'm-nicolas');
    const na = s.staat.acties.find((a) => a.id === smets.id)!;
    expect(na.uitvoerderId).toBe('m-nicolas');
    expect(na.historiek.at(-1)!.tekst).toBe('Overgenomen van Sofie');
    expect(s.staat.kwalificaties.get(S.ruben)!.verantwoordelijkeId).toBe('m-sofie');
  });

  it('opnieuw genereren behoudt resultaten en toewijzingen', () => {
    const s = sessie();
    const pieter = s.staat.acties.find((a) => a.contactId === S.pieter)!;
    s.bewaar(registreerResultaat(s.staat, { contactId: S.pieter, acties: [pieter], uitkomst: 'interesse', door: 'm-nicolas', nu: NU, maakId, gesimuleerd: true }).wijzigingen);
    const voor = s.staat.acties.find((a) => a.id === pieter.id)!;
    const c = s.staat.campagnes[0]!;
    expect(startCampagne(s.staat, { pandId: S.pandLancering, soort: 'lancering', door: 'm-jonas', nu: NU }).wijzigingen).toEqual([]);
    const rij = bouwKandidatenlijst(s.staat, S.pandLancering, c).rijen.find((r) => r.contactId === S.pieter)!;
    expect(neemOp(s.staat, { rij, campagne: c, uitvoerderId: 'm-sofie', door: 'm-jonas', nu: NU }).resultaat).toBe('bestaat');
    expect(rij.actie).toEqual(voor);
    expect(voor).toMatchObject({ voortgang: 'interesse', interesse: 'ja', uitvoerderId: 'm-nicolas' });
  });

  it('"geen antwoord" zegt niets over interesse', () => {
    const s = sessie();
    const pieter = s.staat.acties.find((a) => a.contactId === S.pieter)!;
    s.bewaar(registreerResultaat(s.staat, { contactId: S.pieter, acties: [pieter], uitkomst: 'geen_antwoord', door: 'm-nicolas', nu: NU, maakId, gesimuleerd: true }).wijzigingen);
    expect(s.staat.acties.find((a) => a.id === pieter.id)).toMatchObject({ voortgang: 'geen_antwoord', interesse: 'onbekend', laatsteContactOp: null });
    expect(s.staat.kwalificaties.get(S.pieter)!.laatsteBevestiging!.op).not.toBe(VANDAAG);
  });
});

describe('contactregels', () => {
  it('pauzes en contactverboden blijven gelden, ook bij een nieuwe match', () => {
    const s = sessie();
    expect(bouwKandidatenlijst(s.staat, S.pandLancering).uitgesloten.find((u) => u.contactId === S.nathalie)!.reden).toMatch(/gepauzeerd/i);
    const c = prijsdalingCampagne(s);
    expect(bouwKandidatenlijst(s.staat, S.pandPrijsdaling, c).uitgesloten.find((u) => u.contactId === S.johan)!.reden).toMatch(/Niet meer contacteren/);
  });

  it('"niet meer contacteren" sluit alle open acties en houdt de kandidaat uit nieuwe lijsten en de bellijst', () => {
    const s = sessie();
    const pieter = s.staat.acties.find((a) => a.contactId === S.pieter)!;
    s.bewaar(registreerResultaat(s.staat, { contactId: S.pieter, acties: [pieter], uitkomst: 'niet_meer_contacteren', door: 'm-nicolas', nu: NU, maakId, gesimuleerd: true }).wijzigingen);
    expect(s.staat.contactverboden.has(S.pieter)).toBe(true);
    expect(s.staat.acties.find((a) => a.id === pieter.id)!.voortgang).toBe('afgerond');
    expect(bouwKandidatenlijst(s.staat, S.pandGroteTuin).rijen.some((r) => r.contactId === S.pieter)).toBe(false);
    expect(bouwBellijst(s.staat, 'm-nicolas').kaarten.some((k) => k.contactId === S.pieter)).toBe(false);
  });

  it('gekocht sluit enkel het betreffende zoektraject en meldt één keer aan voor opvolging na aankoop', () => {
    const s = sessie();
    const actie = { ...herbevestigingsActie(s.staat, S.dirk), soort: 'pand', pandId: S.pandGroteTuin } as Contactactie;
    const r = () => registreerResultaat(s.staat, { contactId: S.dirk, acties: [actie], uitkomst: 'gekocht', zoekopdrachtId: 'z-dirk-1', door: 'm-nicolas', nu: NU, maakId, gesimuleerd: true });
    s.bewaar(r().wijzigingen);
    expect(zoek(s.staat, 'z-dirk-1').status).toBe('gesloten');
    expect(zoek(s.staat, 'z-dirk-2').status).toBe('actief');
    expect(s.staat.kwalificaties.get(S.dirk)!.poolStatus).toBe('actief');
    expect(r().wijzigingen.filter((w) => w.soort === 'nazorg')).toEqual([]);
  });

  it('afgesproken terugbelmomenten krijgen voorrang, ook zonder pandmatch', () => {
    const b = bouwBellijst(sessie().staat, 'm-nicolas');
    expect(b.kaarten[0]).toMatchObject({ contactId: S.elke, label: 'vandaag_eerst' });
    expect(b.kaarten[0]!.labelReden).toMatch(/Afgesproken terugbelmoment/);
  });

  it('capaciteit is een dagdoel: dringende acties blijven zichtbaar boven het doel', () => {
    const s = sessie();
    s.bewaar([{ soort: 'instellingen', id: 'kantoor', data: { ...s.staat.instellingen, capaciteit: 1 }, verwachteVersie: null }]);
    const b = bouwBellijst(s.staat, 'm-nicolas');
    expect(b.kaarten.filter((k) => k.label === 'vandaag_eerst').length).toBe(1);
    expect(b.kaarten.filter((k) => k.label === 'vandaag').length).toBe(0);
    expect(b.kaarten.filter((k) => k.label === 'deze_week').length).toBeGreaterThan(0);
  });
});

describe('stabiliteit van de gedeelde lijst', () => {
  it('een kandidaat met een open actie blijft zichtbaar; een onbevestigd bezwaar is enkel een aandachtspunt', () => {
    const s = sessie();
    const pieter = s.staat.acties.find((a) => a.contactId === S.pieter)!;
    s.bewaar(registreerResultaat(s.staat, { contactId: S.pieter, acties: [pieter], uitkomst: 'bezoek', bezoek: { dag: '2026-10-17', uur: '10:00' }, notitie: 'Goede indeling, maar de tuin mag groter.', door: 'm-nicolas', nu: NU, maakId, gesimuleerd: true }).wijzigingen);
    const rij = bouwKandidatenlijst(s.staat, S.pandLancering, s.staat.campagnes[0]!).rijen.find((r) => r.contactId === S.pieter)!;
    expect(rij.actie!.voortgang).toBe('bezoek_gepland');
    expect(rij.aandacht.join(' ')).toMatch(/Mogelijk bezwaar tegen de tuin.*nog te bevestigen/);
    // Het voorstel stuurt de match van andere panden nog niet.
    expect(berekenMatch(s.staat, zoek(s.staat, 'z-claes'), S.pandGroteTuin).bezwaarOpgelost).toEqual([]);
  });
});

describe('opslag', () => {
  it('lokale opslag overleeft herladen (nieuwe instantie leest dezelfde gegevens)', async () => {
    const geheugen = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => geheugen.get(k) ?? null,
      setItem: (k: string, v: string) => void geheugen.set(k, v),
      removeItem: (k: string) => void geheugen.delete(k),
    };
    const { maakLokaleOpslag } = await import('../../core/verkoop/opslag');
    const eerste = maakLokaleOpslag('test');
    const actie = sessie().staat.acties[0]!;
    expect((await eerste.bewaar([{ soort: 'actie', id: actie.id, data: { ...actie, voortgang: 'interesse' }, verwachteVersie: null }], 'm-nicolas')).ok).toBe(true);
    const naHerladen = maakLokaleOpslag('test');
    expect((await naHerladen.laad()).map((r) => [r.id, r.versie])).toEqual([[actie.id, 1]]);
    await naHerladen.reset('m-jonas');
    expect(await maakLokaleOpslag('test').laad()).toEqual([]);
  });
});

describe('na review', () => {
  const reg = (id: string, bedrag: number, dag: string): PrijsRegistratie => ({ id, pandId: 'p', soort: 'vraagprijs', bedrag, valuta: 'EUR', dag, bron: 'eraforce', door: null });

  it('een onbeoordeelde twijfelprijs verbergt geen latere echte daling', () => {
    const w = prijsWijzigingen([reg('a', 400000, '2026-09-01'), reg('b', 280000, '2026-09-10'), reg('c', 380000, '2026-09-20')], new Map());
    expect(w.find((x) => x.registratieId === 'c')).toMatchObject({ van: 400000, naar: 380000, status: 'zeker' });
  });

  it('een pauze voor een contact buiten de koperspool blijft gelden bij een volgende campagne', () => {
    const s = sessie();
    const actie = { ...herbevestigingsActie(s.staat, S.pieter), id: 'a-sanne', contactId: S.sanne, soort: 'pand', pandId: S.pandGroteTuin } as Contactactie;
    s.bewaar(registreerResultaat(s.staat, { contactId: S.sanne, acties: [actie], uitkomst: 'gepauzeerd', pauzeTot: '2027-01-31', door: 'm-nicolas', nu: NU, maakId, gesimuleerd: true }).wijzigingen);
    expect(s.staat.kwalificaties.get(S.sanne)!.poolStatus).toBe('gepauzeerd');
    expect(bouwKandidatenlijst(s.staat, S.pandGroteTuin).uitgesloten.find((u) => u.contactId === S.sanne)!.reden).toMatch(/gepauzeerd/);
  });

  it('een prijsdalingsbericht zegt enkel "binnen budget" als dat ook zo is', () => {
    const s = sessie();
    const c = prijsdalingCampagne(s);
    const rij = bouwKandidatenlijst(s.staat, S.pandPrijsdaling, c).rijen.find((r) => r.contactId === S.sarah)!;
    const actie = { ...herbevestigingsActie(s.staat, S.sarah), soort: 'pand', pandId: S.pandPrijsdaling } as Contactactie;
    const zonderBudget = maakZinnen(s.staat, actie, { ...rij, categorieen: ['eerdere_interesse'] }, c);
    expect(zonderBudget.openingszin).not.toMatch(/budget/);
  });
});
