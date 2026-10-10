// Korte openingszinnen en berichtvoorstellen in Belgisch-Nederlands (opdracht §15).
// Enkel bevestigde en deelbare informatie: zonder vrijgave geen pandgegevens, nooit de interne richtprijs, nooit het adres.
// Geen verzonnen exclusiviteit, schaarste of concurrerende bieders.
import { zegtJe } from '../model';
import type { KandidaatRij } from './kandidatenlijst';
import type { Campagne, Contactactie, Zoekopdracht } from './model';
import { euro } from './prijs';
import { matchPrijs, vrijgaveVan, type VerkoopStaat } from './staat';

const GETAL = ['nul', 'één', 'twee', 'drie', 'vier', 'vijf', 'zes'];

/** "een woning met drie slaapkamers en een tuin rond Bertem" — uit de eigen zoekvraag van de kandidaat. */
export function zoekbeschrijving(z: Zoekopdracht): string {
  const c = z.criteria.filter((x) => x.status === 'actief' && x.soort !== 'onbekend' && x.soort !== 'vermoeden');
  const type = c.find((x) => x.sleutel === 'type');
  const soort = type?.sleutel === 'type' && type.waarde.types.length === 1 && type.waarde.types[0] === 'appartement' ? 'een appartement' : 'een woning';
  const delen: string[] = [];
  const slpk = c.find((x) => x.sleutel === 'slaapkamers');
  if (slpk?.sleutel === 'slaapkamers') delen.push(`${GETAL[slpk.waarde.min] ?? slpk.waarde.min} slaapkamers`);
  const tuin = c.find((x) => x.sleutel === 'tuin');
  if (tuin?.sleutel === 'tuin' && tuin.waarde.nodig) delen.push('een tuin');
  const terras = c.find((x) => x.sleutel === 'terras');
  if (!tuin && terras?.sleutel === 'terras' && terras.waarde.nodig) delen.push('een terras');
  const regio = c.find((x) => x.sleutel === 'regio');
  const waar = regio?.sleutel === 'regio' && regio.waarde.gemeenten[0] ? ` rond ${regio.waarde.gemeenten[0]}` : '';
  const ren = c.find((x) => x.sleutel === 'renovatie');
  const staat = ren?.sleutel === 'renovatie' && ren.waarde.maxWerk === 'te_renoveren' ? ' om te renoveren' : '';
  return `${soort}${staat}${delen.length ? ` met ${delen.join(' en ')}` : ''}${waar}`;
}

interface Zinnen {
  openingszin: string | null;
  bericht: string | null;
  /** Waarom er (nog) geen pandgegevens in staan. */
  beperking: string | null;
}

export function maakZinnen(staat: VerkoopStaat, actie: Contactactie, rij: KandidaatRij | null, campagne: Campagne | null): Zinnen {
  const kandidaat = staat.kandidaten.get(actie.contactId);
  if (!kandidaat) return { openingszin: null, bericht: null, beperking: null };
  const c = kandidaat.contact;
  const je = zegtJe(c);
  const v = c.voornaam ?? c.achternaam;
  const t = {
    je: je ? 'je' : 'u',
    jouw: je ? 'je' : 'uw',
  };
  const zo = rij?.zoekopdracht ?? staat.zoekopdrachten.find((z) => z.contactId === c.id && z.status === 'actief') ?? null;
  const zoek = zo ? zoekbeschrijving(zo) : 'een nieuwe woning';
  const algemeen = `Dag ${v}, ik wou even horen of ${t.je} nog steeds op zoek bent naar ${zoek}. Is er intussen iets veranderd aan ${t.jouw} plannen, budget of timing?`;

  if (actie.soort === 'opvolging' && !actie.pandId) {
    const zin = `Dag ${v}, zoals afgesproken bel ik ${t.je} even terug over ${t.jouw} zoektocht naar ${zoek}. Is er intussen iets veranderd aan ${t.jouw} plannen of budget?`;
    return { openingszin: zin, bericht: zin, beperking: null };
  }
  if (actie.soort === 'herbevestiging' || !actie.pandId) {
    return { openingszin: algemeen, bericht: `${algemeen} Laat gerust iets weten wanneer bellen past.`, beperking: null };
  }
  const pand = staat.panden.get(actie.pandId)!;
  const vrij = vrijgaveVan(staat, pand.id);
  if (!vrij.contacteren) {
    return {
      openingszin: null,
      bericht: algemeen,
      beperking: 'Nog geen vrijgave om over dit pand te contacteren: enkel een algemene vraag, zonder pandgegevens.',
    };
  }
  const prijs = matchPrijs(staat, pand.id);
  const deelPrijs = vrij.deelbaar.vraagprijs && prijs?.soort === 'vraagprijs' ? euro(prijs.bedrag) : null;
  const waar = vrij.deelbaar.gemeente ? ` in ${pand.gemeente}` : '';
  const ding = pand.type === 'appartement' ? 'appartement' : 'woning';
  const deze = vrij.deelbaar.gemeente ? `de ${ding} in ${pand.gemeente}` : `deze ${ding}`;
  const cat = rij?.categorieen ?? [];
  const bezocht = staat.bezoeken.some((b) => b.contactId === c.id && b.pandId === pand.id);
  let zin: string;

  if (campagne?.soort === 'prijsdaling') {
    const nieuw = deelPrijs ? `De vraagprijs is nu aangepast naar ${deelPrijs}.` : 'De vraagprijs is intussen aangepast.';
    if (cat.includes('prijsbezwaar') && bezocht) {
      zin = `Dag ${v}, ${t.je} bezocht ${deze} eerder en gaf aan dat de prijs het belangrijkste struikelblok was. ${nieuw} Is het zinvol om ze opnieuw te bespreken?`;
    } else if (cat.includes('eerder_bod')) {
      zin = `Dag ${v}, ${t.je} deed eerder een bod op ${deze}. ${nieuw} Is het zinvol om dat samen opnieuw te bekijken?`;
    } else if (cat.includes('prijs_volgen')) {
      zin = `Dag ${v}, ${t.je} vroeg om iets te laten weten als de prijs van ${deze} zou zakken. ${nieuw} Wil ${t.je} ze opnieuw bekijken?`;
    } else if (cat.includes('binnen_budget')) {
      zin = `Dag ${v}, ${t.je} zoekt ${zoek}. Er is een ${ding}${waar} waarvan de vraagprijs nu ${deelPrijs ? `${deelPrijs} bedraagt en ` : ''}binnen ${t.jouw} budget valt. Mag ik ${t.je} er meer over vertellen?`;
    } else {
      zin = `Dag ${v}, ${t.je} zoekt ${zoek}. Voor ${deze} is de vraagprijs aangepast${deelPrijs ? ` naar ${deelPrijs}` : ''}. Is het zinvol om die samen te bekijken?`;
    }
  } else if (cat.includes('bezwaar_opgelost') && rij) {
    const tuin = rij.match.bezwaarOpgelost.find((x) => x.includes('tuinbezwaar'));
    if (tuin) {
      const m2 = vrij.deelbaar.kenmerken && pand.kenmerken.tuin?.bruikbareOpp ? ` (ongeveer ${pand.kenmerken.tuin.bruikbareOpp} m²)` : '';
      zin = `Dag ${v}, bij de woning die ${t.je} eerder bezocht vond ${t.je} de tuin te klein. We hebben een ${ding}${waar} met een duidelijk grotere tuin${m2}. Interesse om die te bekijken?`;
    } else {
      zin = `Dag ${v}, bij de woning die ${t.je} eerder bezocht was er te veel werk aan. We hebben een ${ding}${waar} die minder werk vraagt. Interesse om die te bekijken?`;
    }
  } else if (pand.fase === 'gepubliceerd') {
    zin = `Dag ${v}, ${t.je} gaf aan dat ${t.je} zoekt naar ${zoek}. We hebben een ${ding}${waar} die daarbij lijkt aan te sluiten${deelPrijs ? `, met een vraagprijs van ${deelPrijs}` : ''}. Zoeken jullie nog steeds in die richting?`;
  } else {
    zin = `Dag ${v}, ${t.je} gaf aan dat ${t.je} nog zoekt naar ${zoek}. We hebben een ${ding} in voorbereiding${waar} die daarbij lijkt aan te sluiten. Zoeken jullie nog steeds in die richting?`;
  }
  return {
    openingszin: zin,
    bericht: `${zin} Bel of stuur gerust een berichtje terug.`,
    beperking: [!vrij.deelbaar.gemeente && 'gemeente', !deelPrijs && 'vraagprijs'].filter(Boolean).length
      ? `Niet vermeld (niet vrijgegeven): ${[!vrij.deelbaar.gemeente && 'gemeente', !deelPrijs && 'vraagprijs'].filter(Boolean).join(', ')}.`
      : null,
  };
}

/** Woorden die nooit in een voorstel mogen staan (verzonnen druk). Gebruikt in de tests. */
export const VERBODEN_DRUK = [/exclusief/i, /\bsnel zijn\b/i, /andere (kandidaten|bieders|kopers)/i, /veel interesse/i, /laatste kans/i, /\bbieders\b/i];
