// Kandidaten & opvolging per pand: wie past, waarom, en wat is de volgende stap? (opdracht §8, §10, §11, §13)
// De lijst wordt altijd opnieuw berekend; toewijzingen, resultaten en beslissingen zitten in de acties en blijven dus
// bewaard bij opnieuw genereren of synchroniseren.
import { dagenTussen, korteDag, type DagKey } from '../../core/dates';
import { KENMERK_LABEL, prijsGevoelig } from './feedback';
import { actualiteit, berekenIntentie, koopbereidheidTekst, type Actualiteit, type Intentie } from './intentie';
import { berekenMatch, besteMatch, type MatchResultaat } from './matching';
import { OPEN_VOORTGANG, naamVan, type Campagne, type Contactactie, type VerkoopPand, type Zoekopdracht } from './model';
import { euro, prijsWijzigingen, type PrijsWijziging } from './prijs';
import {
  actieveZoekopdrachten,
  contactSleutel,
  huidigeVraagprijs,
  laatsteContact,
  matchPrijs,
  vrijgaveVan,
  type VerkoopStaat,
} from './staat';

export type Categorie =
  | 'koopklaar'
  | 'actief'
  | 'vergelijkbaar'
  | 'bezwaar_opgelost'
  | 'binnen_budget'
  | 'prijsbezwaar'
  | 'prijs_volgen'
  | 'eerdere_interesse'
  | 'eerder_bod';

export const CATEGORIE_LABEL: Record<Categorie, string> = {
  koopklaar: 'Koopklaar',
  actief: 'Actieve zoeker',
  vergelijkbaar: 'Bezocht of bood op vergelijkbaar pand',
  bezwaar_opgelost: 'Lost eerder bezwaar op',
  binnen_budget: 'Nu binnen budget',
  prijsbezwaar: 'Eerder prijsbezwaar',
  prijs_volgen: 'Wou prijs opvolgen',
  eerdere_interesse: 'Eerder interesse',
  eerder_bod: 'Deed eerder een bod',
};

/** Hoe dringend/concreet de aanleiding is (0..1), voor het onderdeel "aanleiding" van de belprioriteit. */
const AANLEIDING_GEWICHT: Record<Categorie, number> = {
  binnen_budget: 1,
  prijsbezwaar: 1,
  eerder_bod: 0.95,
  prijs_volgen: 0.9,
  eerdere_interesse: 0.8,
  bezwaar_opgelost: 0.8,
  koopklaar: 0.75,
  vergelijkbaar: 0.55,
  actief: 0.5,
};

export interface Prioriteit {
  score: number;
  redenen: string[];
}

export interface KandidaatRij {
  contactId: string;
  sleutel: string;
  /** Andere leden van het gekoppelde huishouden. */
  huishoudenLeden: string[];
  match: MatchResultaat;
  zoekopdracht: Zoekopdracht;
  /** Matches voor alle actieve zoekopdrachten van dit contact (afzonderlijk berekend). */
  matches: MatchResultaat[];
  intentie: Intentie;
  actualiteit: Actualiteit;
  koopbereidheid: { label: string; zorg: string | null };
  categorieen: Categorie[];
  /** Waarom dit pand voor deze kandidaat relevant is (aanleiding eerst). */
  redenen: string[];
  /** Relevante historiek met dit of vergelijkbare panden. */
  historiek: string[];
  /** Aandachtspunten bij een kandidaat die zichtbaar blijft door een open actie (bv. een nog te bevestigen bezwaar). */
  aandacht: string[];
  eigenaarId: string;
  actie: Contactactie | null;
  mag: { contacteren: boolean; reden: string | null };
  aanbevolenStap: string;
  prioriteit: Prioriteit;
}

export interface Uitgesloten {
  contactId: string;
  reden: string;
}

export interface Kandidatenlijst {
  pand: VerkoopPand;
  beschikbaar: boolean;
  campagne: Campagne | null;
  rijen: KandidaatRij[];
  uitgesloten: Uitgesloten[];
  /** Aantal zwakke matches dat bewust niet getoond wordt. */
  zwakVerborgen: number;
}

export const BESCHIKBARE_FASEN: VerkoopPand['fase'][] = ['in_voorbereiding', 'verkoopopdracht', 'gepubliceerd'];

export function isOpen(a: Contactactie): boolean {
  return OPEN_VOORTGANG.includes(a.voortgang);
}

/** Open actie voor deze kandidaat (of zijn huishouden) bij dit pand, anders de laatste. */
export function actieVoor(staat: VerkoopStaat, sleutel: string, pandId: string | null): Contactactie | null {
  const lijst = staat.acties
    .filter((a) => a.pandId === pandId && contactSleutel(staat, a.contactId) === sleutel)
    .sort((a, b) => b.aangemaaktOp.localeCompare(a.aangemaaktOp));
  return lijst.find(isOpen) ?? lijst[0] ?? null;
}

/** Contactregels: verbod, pauze en afgeronde trajecten gaan altijd voor op een nieuwe match. */
export function contactRegel(staat: VerkoopStaat, contactId: string): string | null {
  const verbod = staat.contactverboden.get(contactId);
  if (verbod) return `Niet meer contacteren (sinds ${korteDag(verbod.op)}${verbod.reden ? `: ${verbod.reden}` : ''})`;
  if (staat.kandidaten.get(contactId)?.contact.nietBellenBron) return 'Niet bellen volgens ERAForce';
  const kw = staat.kwalificaties.get(contactId);
  if (kw?.poolStatus === 'gepauzeerd' && (!kw.pauze?.tot || kw.pauze.tot >= staat.vandaag)) {
    return `Zoeken gepauzeerd${kw.pauze?.tot ? ` tot ${korteDag(kw.pauze.tot)}` : ''}${kw.pauze?.reden ? ` (${kw.pauze.reden})` : ''}`;
  }
  if (kw?.poolStatus === 'afgerond') return 'Gekocht of zoektocht afgerond';
  return null;
}

function vergelijkbaar(a: VerkoopPand, b: VerkoopPand, prijsA: number | null, prijsB: number | null, z: Zoekopdracht): boolean {
  if (a.id === b.id || a.type !== b.type) return false;
  const regio = z.criteria.find((c) => c.sleutel === 'regio' && c.status === 'actief');
  const zelfdeStreek = a.gemeente === b.gemeente || (regio?.sleutel === 'regio' && regio.waarde.gemeenten.includes(a.gemeente) && regio.waarde.gemeenten.includes(b.gemeente));
  if (!zelfdeStreek) return false;
  if (prijsA === null || prijsB === null) return false;
  return Math.abs(prijsA - prijsB) / prijsB <= 0.15;
}

export function bouwKandidatenlijst(staat: VerkoopStaat, pandId: string, campagne: Campagne | null = null): Kandidatenlijst {
  const pand = staat.panden.get(pandId);
  if (!pand) throw new Error(`Onbekend pand ${pandId}`);
  const beschikbaar = BESCHIKBARE_FASEN.includes(pand.fase);
  const leeg: Kandidatenlijst = { pand, beschikbaar, campagne, rijen: [], uitgesloten: [], zwakVerborgen: 0 };
  if (!beschikbaar) return leeg;

  const vrijgave = vrijgaveVan(staat, pandId);
  const prijsNu = matchPrijs(staat, pandId);
  const daling = campagne?.soort === 'prijsdaling' ? campagne.prijs : null;
  const perSleutel = new Map<string, KandidaatRij>();
  const uitgesloten: Uitgesloten[] = [];
  let zwak = 0;

  for (const kand of staat.kandidaten.values()) {
    const contactId = kand.contact.id;
    const zoek = actieveZoekopdrachten(staat, contactId);
    const bezoeken = staat.bezoeken.filter((b) => b.contactId === contactId && b.pandId === pandId);
    const biedingen = staat.biedingen.filter((b) => b.contactId === contactId && b.pandId === pandId);
    const inzichtenHier = staat.inzichten.filter((i) => i.contactId === contactId && i.pandId === pandId && i.status !== 'verworpen');
    const afwijzing = staat.afwijzingen.filter((a) => a.contactId === contactId && a.pandId === pandId).sort((a, b) => b.dag.localeCompare(a.dag))[0];
    const heeftHistoriek = bezoeken.length > 0 || biedingen.length > 0 || inzichtenHier.length > 0 || Boolean(afwijzing);
    if (!zoek.length && !heeftHistoriek) continue;

    const matches = zoek.map((z) => berekenMatch(staat, z, pandId));
    const best = besteMatch(matches);
    const sleutel = contactSleutel(staat, contactId);

    // ---- Contactregels gaan voor op elke match
    const regel = contactRegel(staat, contactId);
    if (regel) {
      if (heeftHistoriek || (best && best.klasse !== 'zwak' && best.klasse !== 'uitgesloten')) uitgesloten.push({ contactId, reden: regel });
      continue;
    }
    if (!best) {
      if (heeftHistoriek) uitgesloten.push({ contactId, reden: 'Geen actieve zoekopdracht meer' });
      continue;
    }

    // Een kandidaat met een open actie bij dit pand blijft altijd zichtbaar (de opvolging loopt); regels worden dan
    // aandachtspunten in plaats van een uitsluiting.
    const bestaand = actieVoor(staat, sleutel, pandId);
    const openActie = bestaand && isOpen(bestaand) ? bestaand : null;
    const aandacht: string[] = [];

    // ---- Bezwaren tegen dit pand die een prijsdaling niet verandert (enkel bevestigde bezwaren sluiten uit)
    const vastBezwaar = inzichtenHier.find((i) => i.soort === 'bezwaar' && !prijsGevoelig(i.kenmerk));
    if (vastBezwaar) {
      const tekst = `bezwaar tegen de ${KENMERK_LABEL[vastBezwaar.kenmerk]} van dit pand ("${vastBezwaar.citaat}")`;
      if (vastBezwaar.status === 'bevestigd' && !openActie) {
        uitgesloten.push({ contactId, reden: `Eerder ${tekst}${daling ? '. Een prijsdaling verandert dat niet.' : '.'}` });
        continue;
      }
      aandacht.push(vastBezwaar.status === 'bevestigd' ? `Eerder ${tekst}` : `Mogelijk ${tekst}: nog te bevestigen`);
    }
    // ---- Eerder afgewezen: enkel terug als het werkelijke bezwaar veranderde
    const prijsBezwaarHier = inzichtenHier.find((i) => (i.soort === 'bezwaar' && prijsGevoelig(i.kenmerk)) || i.soort === 'prijs_volgen');
    if (afwijzing) {
      const nuPrijs = huidigeVraagprijs(staat, pandId);
      const prijsVeranderd = prijsGevoelig(afwijzing.reden) && afwijzing.prijsOpMoment !== null && nuPrijs !== null && nuPrijs < afwijzing.prijsOpMoment;
      if (!prijsVeranderd) {
        const reden = `Wees dit pand af op ${afwijzing.dag} (${KENMERK_LABEL[afwijzing.reden]}). Sindsdien geen relevante verandering.`;
        if (!openActie) {
          uitgesloten.push({ contactId, reden });
          continue;
        }
        aandacht.push(reden);
      }
    }

    // ---- Categorieën
    const kw = staat.kwalificaties.get(contactId);
    const categorieen: Categorie[] = [];
    const redenen: string[] = [];
    const historiek: string[] = [];
    for (const b of bezoeken) historiek.push(`${b.volgnummer === 1 ? 'Bezocht' : `${b.volgnummer}e bezoek`} op ${b.dag}${b.evaluatie ? `: "${b.evaluatie}"` : ''}`);
    for (const b of biedingen) historiek.push(`Bod van ${euro(b.bedrag)} op ${b.dag} (${b.status})`);
    if (afwijzing) historiek.push(`Wees af op ${afwijzing.dag} om de ${KENMERK_LABEL[afwijzing.reden]} (prijs toen ${euro(afwijzing.prijsOpMoment)})`);

    const limiet = kw?.budget ? kw.budget.bedrag : (best && zoek.find((z) => z.id === best.zoekopdrachtId)?.criteria.find((c) => c.sleutel === 'budget' && c.status === 'actief')?.waarde as { max: number } | undefined)?.max ?? null;

    if (daling) {
      const beforeMatch = besteMatch(zoek.map((z) => berekenMatch(staat, z, pandId, { prijs: daling.van })));
      if (limiet !== null && daling.van > limiet && daling.naar <= limiet) {
        categorieen.push('binnen_budget');
        redenen.push(kw?.budget ? 'Nieuwe vraagprijs valt binnen het bevestigde maximumbudget.' : 'Nieuwe vraagprijs valt binnen het opgegeven budget.');
      }
      const prijsKwaliteit = inzichtenHier.find((i) => i.soort === 'bezwaar' && i.kenmerk === 'prijs_kwaliteit');
      if (prijsBezwaarHier || (afwijzing && prijsGevoelig(afwijzing.reden))) {
        categorieen.push('prijsbezwaar');
        if (prijsKwaliteit) redenen.push(`Vond de prijs te hoog voor wat het is; de vraagprijs zakte van ${euro(daling.van)} naar ${euro(daling.naar)}. Budget ongewijzigd.`);
        else if (limiet !== null && daling.naar <= limiet) redenen.push('Eerder afgehaakt vanwege de prijs; nieuwe vraagprijs sluit aan op het besproken bereik.');
        else redenen.push(`Eerder afgehaakt vanwege de prijs; de vraagprijs zakte van ${euro(daling.van)} naar ${euro(daling.naar)}.`);
      }
      if (inzichtenHier.some((i) => i.soort === 'prijs_volgen')) {
        categorieen.push('prijs_volgen');
        redenen.push('Vroeg om opvolging als de prijs zou zakken.');
      }
      if (biedingen.length) {
        const b = [...biedingen].sort((x, y) => y.dag.localeCompare(x.dag))[0]!;
        categorieen.push('eerder_bod');
        redenen.push(`Bood eerder ${euro(b.bedrag)} (${b.dag}); nieuwe vraagprijs ${euro(daling.naar)}.`);
      }
      const eerdereInteresse = staat.acties.some((a) => a.pandId === pandId && contactSleutel(staat, a.contactId) === sleutel && a.interesse === 'ja');
      if (eerdereInteresse) {
        categorieen.push('eerdere_interesse');
        redenen.push('Toonde eerder interesse in dit pand.');
      }
      if (!categorieen.length && best.klasse === 'sterk' && beforeMatch && beforeMatch.klasse !== 'sterk') {
        categorieen.push('actief');
        redenen.push('Met de nieuwe prijs een sterke match op de actieve zoekopdracht.');
      }
      if (!categorieen.length && !openActie) continue;
      if (best.klasse === 'uitgesloten') {
        if (!openActie) {
          uitgesloten.push({ contactId, reden: `Ondanks de prijsdaling past dit pand niet: ${best.schendingen[0]}` });
          continue;
        }
        aandacht.push(`Past niet meer: ${best.schendingen[0]}`);
      }
    } else {
      if (best.klasse === 'uitgesloten') {
        if (!openActie) {
          // Tonen wie in de juiste streek zoekt maar een harde voorwaarde mist (bv. budget): zo is zichtbaar waarom niet.
          const locatieOk = best.onderdelen.find((o) => o.sleutel === 'locatie')?.score === 1;
          if (heeftHistoriek || locatieOk) uitgesloten.push({ contactId, reden: `Past niet: ${best.schendingen[0]}` });
          continue;
        }
        aandacht.push(`Past niet meer: ${best.schendingen[0]}`);
      }
      if (kw?.poolStatus === 'koopklaar' && (best.klasse === 'sterk' || best.klasse === 'goed')) categorieen.push('koopklaar');
      if (best.klasse === 'sterk' || best.klasse === 'goed') categorieen.push('actief');
      if (best.bezwaarOpgelost.length) categorieen.push('bezwaar_opgelost');
      const andere = staat.bezoeken
        .filter((b) => b.contactId === contactId && b.pandId !== pandId)
        .map((b) => ({ id: b.pandId, wat: `Bezocht`, dag: b.dag }))
        .concat(staat.biedingen.filter((b) => b.contactId === contactId && b.pandId !== pandId).map((b) => ({ id: b.pandId, wat: `Bood op`, dag: b.dag })));
      const zo = zoek.find((z) => z.id === best.zoekopdrachtId)!;
      for (const x of andere) {
        const p = staat.panden.get(x.id);
        if (p && vergelijkbaar(p, pand, matchPrijs(staat, p.id)?.bedrag ?? null, prijsNu?.bedrag ?? null, zo)) {
          if (!categorieen.includes('vergelijkbaar')) categorieen.push('vergelijkbaar');
          historiek.push(`${x.wat} een vergelijkbaar pand in ${p.gemeente} (${x.dag})`);
        }
      }
      const toon = categorieen.some((c) => c !== 'vergelijkbaar') || (best.klasse === 'mogelijk' && categorieen.includes('vergelijkbaar'));
      if ((!toon || best.klasse === 'zwak') && !openActie) {
        zwak++;
        continue;
      }
      redenen.push(...best.bezwaarOpgelost);
    }
    redenen.push(...best.redenen.slice(0, 4));

    // ---- Vrijgave, stap en prioriteit
    const intentie = berekenIntentie(staat, contactId);
    const act = actualiteit(kw, staat.vandaag, staat.instellingen.bevestigingsritmeDagen);
    const telefoon = kand.contact.telefoons.length > 0;
    const mag = !vrijgave.contacteren
      ? { contacteren: false, reden: 'Nog geen vrijgave om kandidaten te contacteren' }
      : !telefoon
        ? { contacteren: false, reden: 'Geen telefoonnummer gekend' }
        : { contacteren: true, reden: null };
    const rij: KandidaatRij = {
      contactId,
      sleutel,
      huishoudenLeden: [],
      match: best,
      zoekopdracht: zoek.find((z) => z.id === best.zoekopdrachtId)!,
      matches,
      intentie,
      actualiteit: act,
      koopbereidheid: koopbereidheidTekst(staat, contactId),
      categorieen,
      redenen: [...new Set(redenen)],
      historiek,
      aandacht,
      eigenaarId: kw?.verantwoordelijkeId ?? kand.eigenaarId,
      actie: bestaand,
      mag,
      aanbevolenStap: '',
      prioriteit: { score: 0, redenen: [] },
    };
    rij.prioriteit = belprioriteit(staat, rij, campagne);
    rij.aanbevolenStap = aanbevolenStap(staat, rij, pand);

    // Bundelen per gekoppeld huishouden: de best passende persoon blijft, de anderen worden vermeld.
    const vorige = perSleutel.get(sleutel);
    if (!vorige) perSleutel.set(sleutel, rij);
    else {
      const [hoofd, ander] = vorige.prioriteit.score >= rij.prioriteit.score ? [vorige, rij] : [rij, vorige];
      hoofd.huishoudenLeden = [...new Set([...hoofd.huishoudenLeden, ...ander.huishoudenLeden, ander.contactId])];
      hoofd.categorieen = [...new Set([...hoofd.categorieen, ...ander.categorieen])];
      hoofd.redenen = [...new Set([...hoofd.redenen, ...ander.redenen])];
      hoofd.aandacht = [...new Set([...hoofd.aandacht, ...ander.aandacht])];
      hoofd.historiek = [...hoofd.historiek, ...ander.historiek.map((h) => `${naamVan(staat.contacten.get(ander.contactId)!)}: ${h}`)];
      perSleutel.set(sleutel, hoofd);
    }
  }

  const rijen = [...perSleutel.values()].sort((a, b) => b.prioriteit.score - a.prioriteit.score);
  return { pand, beschikbaar, campagne, rijen, uitgesloten, zwakVerborgen: zwak };
}

/** Belprioriteit (opdracht §13): pas na de contactregels; redenen eerst, geen voorspelde aankoopkans. */
export function belprioriteit(staat: VerkoopStaat, rij: Pick<KandidaatRij, 'match' | 'intentie' | 'categorieen' | 'contactId' | 'actualiteit'>, campagne: Campagne | null): Prioriteit {
  const g = staat.instellingen.belGewichten;
  const totaal = g.match + g.intentie + g.aanleiding + g.opvolging || 1;
  const m = rij.match.score / 100;
  const i = (rij.intentie.score ?? 0) / 100;
  const a = Math.max(0, ...rij.categorieen.map((c) => AANLEIDING_GEWICHT[c])) * (campagne || rij.categorieen.length ? 1 : 0.5);
  const lc = laatsteContact(staat, rij.contactId);
  const dagen = lc ? dagenTussen(lc.dag, staat.vandaag) : null;
  const o = rij.actualiteit.verouderd || dagen === null ? 1 : dagen > 30 ? 0.8 : dagen > 14 ? 0.5 : 0.2;
  const delen = [
    { w: g.match * m, tekst: `Match ${rij.match.score}` },
    { w: g.intentie * i, tekst: rij.intentie.score === null ? 'Aankoopintentie onbekend' : `Intentie ${rij.intentie.score}: ${rij.intentie.signalen[0]?.label ?? ''}` },
    { w: g.aanleiding * a, tekst: rij.categorieen.length ? `Aanleiding: ${CATEGORIE_LABEL[rij.categorieen[0]!].toLowerCase()}` : 'Geen bijzondere aanleiding' },
    { w: g.opvolging * o, tekst: dagen === null ? 'Nog geen betekenisvol contact' : `Laatste contact ${dagen} dagen geleden` },
  ];
  const score = Math.round((delen.reduce((t, d) => t + d.w, 0) / totaal) * 100);
  return { score, redenen: [...delen].sort((x, y) => y.w - x.w).slice(0, 3).map((d) => d.tekst) };
}

function aanbevolenStap(staat: VerkoopStaat, rij: KandidaatRij, pand: VerkoopPand): string {
  if (!rij.mag.contacteren) {
    if (!vrijgaveVan(staat, pand.id).contacteren) return `Vrijgave voor contact vragen aan ${staat.medewerkers.get(pand.inkoperId ?? '')?.voornaam ?? 'de inkoper'} (afspraak met eigenaar)`;
    return rij.mag.reden ?? 'Eerst controleren';
  }
  if (rij.actie && isOpen(rij.actie) && rij.actie.volgendeStap) return rij.actie.volgendeStap;
  if (!staat.kwalificaties.has(rij.contactId)) return 'Eerst kwalificeren: nog niet in de koperspool (koopbereidheid onbekend)';
  if (rij.actualiteit.verouderd) return 'Bellen en eerst bevestigen of ze nog zoeken (koopbereidheid verouderd)';
  if (rij.categorieen.includes('prijsbezwaar') || rij.categorieen.includes('binnen_budget') || rij.categorieen.includes('eerder_bod')) return 'Nieuwe vraagprijs voorleggen en bezoek voorstellen';
  if (rij.match.onbekend.length && rij.match.klasse !== 'sterk') return `Eerst navragen: ${rij.match.onbekend[0]!.toLowerCase()}`;
  if (rij.categorieen.includes('koopklaar')) return pand.fase === 'gepubliceerd' ? 'Bellen en bezoek inplannen' : 'Bellen vóór publicatie en bezoek voorstellen';
  return 'Interesse peilen';
}

/** Welke prijsdalingen bij dit pand nog geen campagne hebben (om "Volg prijsdaling op" te tonen). */
export function openPrijsdalingen(staat: VerkoopStaat, pandId: string): PrijsWijziging[] {
  const bestaand = new Set(staat.campagnes.filter((c) => c.pandId === pandId && c.soort === 'prijsdaling').map((c) => c.sleutel));
  return prijsWijzigingen(staat.prijzen, staat.prijsoordelen, pandId).filter((w) => !bestaand.has(`prijsdaling:${w.registratieId}`));
}

export function dagenGeleden(staat: VerkoopStaat, dag: DagKey): number {
  return dagenTussen(dag, staat.vandaag);
}
