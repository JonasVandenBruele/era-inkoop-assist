// Matchscore: hoe goed past dit pand bij deze zoekopdracht? (opdracht §6 en §13)
// Controleerbare code, geen AI. Eén score per zoekopdracht; een kandidaat met twee scenario's krijgt er twee.
// - Een geschonden harde voorwaarde → nooit een sterke match.
// - Onbekende gegevens tellen neutraal (0,5) en verlagen de dekking; een dun profiel krijgt geen hoge score.
// - Biedingen en bezoeken beïnvloeden de match NIET (dat is aankoopintentie), enkel hun inhoudelijke feedback telt.
import { KENMERK_LABEL } from './feedback';
import { euro } from './prijs';
import {
  STAAT_VOLGORDE,
  type Criterium,
  type CriteriumSleutel,
  type EpcLabel,
  type Inzicht,
  type VerkoopInstellingen,
  type VerkoopPand,
  type Zoekopdracht,
} from './model';
import { matchPrijs, type VerkoopStaat } from './staat';

export type MatchKlasse = 'sterk' | 'goed' | 'mogelijk' | 'zwak' | 'uitgesloten';
export type OnderdeelSleutel = keyof VerkoopInstellingen['matchGewichten'];

export interface Onderdeel {
  sleutel: OnderdeelSleutel;
  label: string;
  gewicht: number;
  /** 0..1, of null als er niets over geweten is. */
  score: number | null;
  uitleg: string[];
}

export interface MatchResultaat {
  zoekopdrachtId: string;
  pandId: string;
  score: number; // 0..100
  klasse: MatchKlasse;
  /** Deel van het gewicht waarover iets geweten is (0..1). */
  dekking: number;
  onderdelen: Onderdeel[];
  /** Wat past. */
  redenen: string[];
  /** Wat niet of minder past. */
  afwijkingen: string[];
  /** Ontbrekende of onzekere informatie (bij pand of profiel). */
  onbekend: string[];
  schendingen: string[];
  /** Een eerder bezwaar dat dit pand aantoonbaar oplost. */
  bezwaarOpgelost: string[];
  prijs: { bedrag: number; soort: 'vraagprijs' | 'richtprijs'; deelbaar: boolean } | null;
}

const LABEL: Record<OnderdeelSleutel, string> = {
  budget: 'Budget',
  locatie: 'Locatie',
  woning: 'Type, kamers en oppervlakte',
  wensen: 'Wensen en feedback',
  praktisch: 'Staat, timing en praktisch',
};

const EPC_VOLGORDE: EpcLabel[] = ['A', 'B', 'C', 'D', 'E', 'F'];

interface Deelscore {
  score: number | null;
  uitleg: string;
}

function actief<K extends CriteriumSleutel>(z: Zoekopdracht, sleutel: K): Extract<Criterium, { sleutel: K }>[] {
  return z.criteria.filter((c): c is Extract<Criterium, { sleutel: K }> => c.sleutel === sleutel && c.status === 'actief' && c.soort !== 'onbekend');
}

const isHard = (c: Criterium) => c.soort === 'hard';
const pandNaam = (p: VerkoopPand | undefined) => (p ? `${p.type === 'appartement' ? 'appartement' : 'woning'} ${p.gemeente}` : 'een eerder pand');

export function berekenMatch(staat: VerkoopStaat, z: Zoekopdracht, pandId: string, opties: { prijs?: number } = {}): MatchResultaat {
  const pand = staat.panden.get(pandId);
  if (!pand) throw new Error(`Onbekend pand ${pandId}`);
  const k = pand.kenmerken;
  const gew = staat.instellingen.matchGewichten;
  const basisPrijs = matchPrijs(staat, pandId);
  const prijs = opties.prijs !== undefined ? { bedrag: opties.prijs, soort: 'vraagprijs' as const, deelbaar: basisPrijs?.deelbaar ?? false } : basisPrijs;
  const kw = staat.kwalificaties.get(z.contactId);

  const redenen: string[] = [];
  const afwijkingen: string[] = [];
  const onbekend: string[] = [];
  const schendingen: string[] = [];
  const bezwaarOpgelost: string[] = [];
  let hardOnbekend = false;
  /** Kerngegevens van het pand die de zoekvraag nodig heeft maar onbekend zijn: geen stellige matchclaim. */
  let kernOnbekend = false;

  const delen: Record<OnderdeelSleutel, Deelscore[]> = { budget: [], locatie: [], woning: [], wensen: [], praktisch: [] };
  const plus = (o: OnderdeelSleutel, score: number | null, uitleg: string) => delen[o].push({ score, uitleg });

  // ---- Budget
  const budgetC = actief(z, 'budget')[0];
  const bevestigd = kw?.budget ?? null;
  const limiet = bevestigd ? Math.min(bevestigd.bedrag, budgetC?.waarde.max ?? Infinity) : (budgetC?.waarde.max ?? null);
  const budgetHard = Boolean(bevestigd) || (budgetC ? isHard(budgetC) : false);
  if (limiet === null) {
    plus('budget', null, 'Geen budget gekend');
    onbekend.push('Budget van de kandidaat onbekend');
  } else if (!prijs) {
    plus('budget', null, 'Prijs van het pand nog niet gekend');
    onbekend.push('Vraagprijs nog niet gekend');
    kernOnbekend = true;
    if (budgetHard) hardOnbekend = true;
  } else {
    const welk = bevestigd ? 'bevestigd maximum' : 'budget';
    const prijsTekst = prijs.soort === 'richtprijs' ? `Interne richtprijs ${euro(prijs.bedrag)}` : `Vraagprijs ${euro(prijs.bedrag)}`;
    if (prijs.soort === 'richtprijs') onbekend.push('Enkel een interne richtprijs: nog geen bevestigde vraagprijs');
    if (prijs.bedrag <= limiet) {
      plus('budget', 1, `${prijsTekst} binnen ${welk} ${euro(limiet)}`);
      redenen.push(`${prijsTekst} valt binnen het ${welk} (${euro(limiet)})`);
    } else {
      const over = (prijs.bedrag - limiet) / limiet;
      if (budgetHard) {
        plus('budget', 0, `${prijsTekst} boven ${welk} ${euro(limiet)}`);
        schendingen.push(`${prijsTekst} ligt boven het ${welk} (${euro(limiet)})`);
      } else if (over <= 0.05) {
        plus('budget', 0.5, `${prijsTekst} iets boven budget ${euro(limiet)}`);
        afwijkingen.push(`${prijsTekst} ligt ${Math.round(over * 100)}% boven het budget`);
      } else {
        plus('budget', 0, `${prijsTekst} boven budget ${euro(limiet)}`);
        afwijkingen.push(`${prijsTekst} ligt boven het budget (${euro(limiet)})`);
      }
    }
    if (budgetC?.waarde.min && prijs.bedrag < budgetC.waarde.min * 0.8) afwijkingen.push(`Ruim onder het verwachte prijsbereik (vanaf ${euro(budgetC.waarde.min)})`);
  }

  // ---- Locatie
  for (const c of actief(z, 'regio_uitgesloten')) {
    if (c.waarde.gemeenten.includes(pand.gemeente)) {
      plus('locatie', 0, `${pand.gemeente} uitgesloten`);
      if (isHard(c) || c.soort === 'voorkeur') schendingen.push(`${pand.gemeente} staat bij de uitgesloten gemeenten`);
    }
  }
  const regio = actief(z, 'regio')[0];
  if (regio) {
    if (regio.waarde.gemeenten.includes(pand.gemeente)) {
      plus('locatie', 1, `${pand.gemeente} in gewenste regio`);
      redenen.push(`Ligt in ${pand.gemeente}, een gewenste gemeente`);
    } else {
      plus('locatie', 0.2, `${pand.gemeente} buiten gewenste regio`);
      if (isHard(regio)) schendingen.push(`${pand.gemeente} valt buiten de gewenste gemeenten`);
      else afwijkingen.push(`${pand.gemeente} valt buiten de gewenste gemeenten (${regio.waarde.gemeenten.join(', ')})`);
    }
  } else if (delen.locatie.length === 0) {
    onbekend.push('Gewenste regio onbekend');
  }

  // ---- Type, kamers, oppervlakte
  const type = actief(z, 'type')[0];
  if (type) {
    if (type.waarde.types.includes(pand.type)) plus('woning', 1, `Type ${pand.type} gewenst`);
    else {
      plus('woning', 0, `Type ${pand.type} niet gewenst`);
      (isHard(type) ? schendingen : afwijkingen).push(`Zoekt ${type.waarde.types.join(' of ')}, dit is een ${pand.type}`);
    }
  }
  const slpk = actief(z, 'slaapkamers')[0];
  if (slpk) {
    if (k.slaapkamers === null) {
      plus('woning', null, 'Aantal slaapkamers onbekend');
      onbekend.push('Aantal slaapkamers van het pand onbekend');
      kernOnbekend = true;
      if (isHard(slpk)) hardOnbekend = true;
    } else if (k.slaapkamers >= slpk.waarde.min) {
      plus('woning', 1, `${k.slaapkamers} slaapkamers`);
      redenen.push(`${k.slaapkamers} slaapkamers (zoekt minstens ${slpk.waarde.min})`);
    } else {
      plus('woning', k.slaapkamers === slpk.waarde.min - 1 ? 0.4 : 0, `${k.slaapkamers} slaapkamers`);
      (isHard(slpk) ? schendingen : afwijkingen).push(`${k.slaapkamers} slaapkamers, zoekt minstens ${slpk.waarde.min}`);
    }
  }
  const opp = actief(z, 'bewoonbare_opp')[0];
  if (opp) {
    if (k.bewoonbareOpp === null) {
      plus('woning', null, 'Bewoonbare oppervlakte onbekend');
      onbekend.push('Bewoonbare oppervlakte van het pand onbekend');
      kernOnbekend = true;
      if (isHard(opp)) hardOnbekend = true;
    } else if (k.bewoonbareOpp >= opp.waarde.min) {
      plus('woning', 1, `${k.bewoonbareOpp} m² bewoonbaar`);
    } else {
      plus('woning', k.bewoonbareOpp >= opp.waarde.min * 0.9 ? 0.6 : 0.2, `${k.bewoonbareOpp} m² bewoonbaar`);
      (isHard(opp) ? schendingen : afwijkingen).push(`${k.bewoonbareOpp} m² bewoonbaar, zoekt minstens ${opp.waarde.min} m²`);
    }
  }

  // ---- Wensen (buitenruimte, parking) en feedback uit eerdere bezoeken
  const nodig = (sleutel: 'tuin' | 'terras' | 'privacy' | 'parking' | 'garage', waarde: boolean | null, naam: string) => {
    for (const c of actief(z, sleutel)) {
      if (!c.waarde.nodig) continue;
      if (waarde === null) {
        plus('wensen', null, `${naam} onbekend`);
        onbekend.push(`${naam[0]!.toUpperCase()}${naam.slice(1)}: niet gekend bij dit pand`);
        if (sleutel === 'tuin') kernOnbekend = true;
        if (isHard(c)) hardOnbekend = true;
      } else if (waarde) {
        plus('wensen', 1, `${naam} aanwezig`);
        redenen.push(`Heeft ${naam}${c.soort === 'vermoeden' ? ' (afgeleide wens, nog te bevestigen)' : ''}`);
      } else {
        plus('wensen', 0, `geen ${naam}`);
        (isHard(c) ? schendingen : afwijkingen).push(`Geen ${naam}, terwijl dat ${isHard(c) ? 'een voorwaarde' : 'gewenst'} is`);
      }
    }
  };
  nodig('tuin', k.tuin ? k.tuin.aanwezig : null, 'tuin');
  nodig('terras', k.terras, 'terras');
  nodig('privacy', k.privacy === null ? null : k.privacy === 'goed', 'privacy');
  nodig('parking', k.parking === null ? (k.garage === true ? true : null) : k.parking || k.garage === true, 'parking');
  nodig('garage', k.garage, 'garage');
  const ori = actief(z, 'orientatie')[0];
  if (ori) {
    if (!k.orientatie) plus('wensen', null, 'Oriëntatie onbekend');
    else if (ori.waarde.richtingen.includes(k.orientatie)) {
      plus('wensen', 1, `Oriëntatie ${k.orientatie}`);
      redenen.push(`Tuin of terras op het ${k.orientatie}`);
    } else plus('wensen', 0.3, `Oriëntatie ${k.orientatie}`);
  }

  // Enkel bevestigde feedback stuurt de match; een voorstel uit een nieuwe notitie moet eerst gecontroleerd worden.
  const feedback = staat.inzichten.filter((i) => i.contactId === z.contactId && i.status === 'bevestigd' && i.pandId && i.pandId !== pandId);
  for (const inz of feedback) beoordeelFeedback(staat, inz, pand, plus, redenen, afwijkingen, onbekend, bezwaarOpgelost);

  // ---- Staat en praktisch
  const ren = actief(z, 'renovatie')[0];
  if (ren) {
    if (!k.staat) {
      plus('praktisch', null, 'Staat onbekend');
      onbekend.push('Staat van het pand onbekend');
    } else if (STAAT_VOLGORDE.indexOf(k.staat) <= STAAT_VOLGORDE.indexOf(ren.waarde.maxWerk)) {
      plus('praktisch', 1, `Staat: ${k.staat.replace(/_/g, ' ')}`);
    } else {
      plus('praktisch', 0, `Staat: ${k.staat.replace(/_/g, ' ')}`);
      (isHard(ren) ? schendingen : afwijkingen).push(`Pand is ${k.staat.replace(/_/g, ' ')}, kandidaat wil maximaal ${ren.waarde.maxWerk.replace(/_/g, ' ')}`);
    }
  }
  const toeg = actief(z, 'toegankelijkheid')[0];
  if (toeg?.waarde.gelijkvloers) {
    if (k.gelijkvloersWonen === null) {
      plus('praktisch', null, 'Gelijkvloers wonen onbekend');
      onbekend.push('Gelijkvloers wonen mogelijk? Niet gekend');
      if (isHard(toeg)) hardOnbekend = true;
    } else if (k.gelijkvloersWonen) plus('praktisch', 1, 'Gelijkvloers wonen mogelijk');
    else {
      plus('praktisch', 0, 'Geen gelijkvloers wonen');
      (isHard(toeg) ? schendingen : afwijkingen).push('Geen gelijkvloers wonen mogelijk');
    }
  }
  const epc = actief(z, 'epc')[0];
  if (epc) {
    if (!k.epc) plus('praktisch', null, 'EPC onbekend');
    else if (EPC_VOLGORDE.indexOf(k.epc) <= EPC_VOLGORDE.indexOf(epc.waarde.slechtsteLabel)) plus('praktisch', 1, `EPC ${k.epc}`);
    else {
      plus('praktisch', 0.3, `EPC ${k.epc}`);
      afwijkingen.push(`EPC-label ${k.epc}, voorkeur ${epc.waarde.slechtsteLabel} of beter`);
    }
  }

  // ---- Samenvoegen
  const onderdelen: Onderdeel[] = (Object.keys(LABEL) as OnderdeelSleutel[]).map((s) => {
    const gekend = delen[s].filter((d) => d.score !== null) as { score: number; uitleg: string }[];
    return {
      sleutel: s,
      label: LABEL[s],
      gewicht: gew[s],
      score: gekend.length ? Math.min(...gekend.map((d) => d.score)) * 0.5 + (gekend.reduce((t, d) => t + d.score, 0) / gekend.length) * 0.5 : null,
      uitleg: delen[s].map((d) => d.uitleg),
    };
  });
  const totaal = onderdelen.reduce((t, o) => t + o.gewicht, 0) || 1;
  // Dekking per criterium: een onderdeel met één gekend en één onbekend criterium telt half.
  const gekendGewicht = (Object.keys(LABEL) as OnderdeelSleutel[]).reduce((t, s) => {
    const n = delen[s].length;
    return t + (n ? (gew[s] * delen[s].filter((d) => d.score !== null).length) / n : 0);
  }, 0);
  // Onbekend telt neutraal (0,5): een profiel met weinig bekende criteria kan niet hoog scoren.
  const ruw = onderdelen.reduce((t, o) => t + o.gewicht * (o.score ?? 0.5), 0) / totaal;
  const dekking = gekendGewicht / totaal;
  const score = Math.round(ruw * 100);

  let klasse: MatchKlasse;
  if (schendingen.length) klasse = 'uitgesloten';
  // Sterk vraagt: hoge score, voldoende dekking, geen onbekende kerngegevens en geen onderdeel dat duidelijk afwijkt
  // (bv. buiten de gewenste regio). Zo levert onvolledige informatie nooit een stellige matchclaim op.
  else if (score >= 78 && dekking >= 0.6 && !hardOnbekend && !kernOnbekend && onderdelen.every((o) => o.score === null || o.score >= 0.5)) klasse = 'sterk';
  else if (score >= 66) klasse = 'goed';
  else if (score >= 52) klasse = 'mogelijk';
  else klasse = 'zwak';
  if (hardOnbekend) onbekend.unshift('Een harde voorwaarde kan niet gecontroleerd worden: geen stellige match');

  return { zoekopdrachtId: z.id, pandId, score, klasse, dekking, onderdelen, redenen, afwijkingen, onbekend, schendingen, bezwaarOpgelost, prijs };
}

/** Feedback uit een bezoek aan een ánder pand: lost dit pand dat bezwaar aantoonbaar op? */
function beoordeelFeedback(
  staat: VerkoopStaat,
  inz: Inzicht,
  pand: VerkoopPand,
  plus: (o: OnderdeelSleutel, s: number | null, u: string) => void,
  redenen: string[],
  afwijkingen: string[],
  onbekend: string[],
  opgelost: string[],
) {
  const bezocht = staat.panden.get(inz.pandId!);
  if (!bezocht) return;
  const naam = pandNaam(bezocht);
  if (inz.soort === 'bezwaar' && inz.kenmerk === 'tuin') {
    const hier = pand.kenmerken.tuin;
    const daar = bezocht.kenmerken.tuin;
    if (hier && !hier.aanwezig) {
      plus('wensen', 0, 'geen tuin');
      afwijkingen.push(`Geen tuin, terwijl de tuin bij ${naam} al te klein was`);
    } else if (hier?.bruikbareOpp != null && daar?.bruikbareOpp != null) {
      if (hier.bruikbareOpp > daar.bruikbareOpp) {
        plus('wensen', 1, `bruikbare tuin ±${hier.bruikbareOpp} m²`);
        opgelost.push(`Lost het tuinbezwaar bij ${naam} op: bruikbare tuin ±${hier.bruikbareOpp} m² tegenover ±${daar.bruikbareOpp} m²`);
      } else {
        plus('wensen', 0.2, `bruikbare tuin ±${hier.bruikbareOpp} m²`);
        afwijkingen.push(`Tuin niet groter dan bij ${naam}, waar de tuin te klein bevonden werd`);
      }
    } else {
      plus('wensen', null, 'bruikbare tuin onbekend');
      const perceel = pand.kenmerken.perceelOpp && bezocht.kenmerken.perceelOpp && pand.kenmerken.perceelOpp > bezocht.kenmerken.perceelOpp;
      onbekend.push(
        perceel
          ? `Groter perceel dan ${naam}, maar de bruikbare tuin is niet gekend: niet gerekend als oplossing voor het tuinbezwaar`
          : `Bruikbare tuin niet gekend: onzeker of dit het tuinbezwaar bij ${naam} oplost`,
      );
    }
  } else if (inz.soort === 'bezwaar' && inz.kenmerk === 'staat') {
    const hier = pand.kenmerken.staat;
    const daar = bezocht.kenmerken.staat;
    if (hier && daar) {
      if (STAAT_VOLGORDE.indexOf(hier) < STAAT_VOLGORDE.indexOf(daar)) {
        plus('wensen', 1, `minder werk (${hier.replace(/_/g, ' ')})`);
        opgelost.push(`Minder werk dan ${naam}: ${hier.replace(/_/g, ' ')} tegenover ${daar.replace(/_/g, ' ')}`);
      } else {
        plus('wensen', 0.2, hier.replace(/_/g, ' '));
        afwijkingen.push(`Niet minder werk dan ${naam}, dat al te veel renovatie vroeg`);
      }
    } else onbekend.push(`Staat onbekend: onzeker of dit minder werk vraagt dan ${naam}`);
  } else if (inz.soort === 'positief' && inz.kenmerk === 'locatie' && bezocht.gemeente === pand.gemeente) {
    redenen.push(`Zelfde gemeente als ${naam}, waarvan de ligging goed bevonden werd`);
  } else if (inz.soort === 'bezwaar' && inz.kenmerk === 'ligging' && bezocht.gemeente === pand.gemeente && pand.kenmerken.ligging) {
    redenen.push(`Andere ligging dan ${naam} (bezwaar: ${KENMERK_LABEL.ligging}): ${pand.kenmerken.ligging}`);
  }
}

export function besteMatch(matches: MatchResultaat[]): MatchResultaat | null {
  const volgorde: MatchKlasse[] = ['sterk', 'goed', 'mogelijk', 'zwak', 'uitgesloten'];
  return [...matches].sort((a, b) => volgorde.indexOf(a.klasse) - volgorde.indexOf(b.klasse) || b.score - a.score)[0] ?? null;
}

export const KLASSE_LABEL: Record<MatchKlasse, string> = {
  sterk: 'Sterke match',
  goed: 'Goede match',
  mogelijk: 'Mogelijke match',
  zwak: 'Zwakke match',
  uitgesloten: 'Past niet',
};
