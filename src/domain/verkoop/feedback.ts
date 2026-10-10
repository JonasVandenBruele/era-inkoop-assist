// Vrije tekst (gespreksnotitie, bezoekevaluatie) → voorstellen voor het zoekprofiel, telkens met de letterlijke zin als bron.
// Dit is de deterministische herkenning die in de demo draait. Later kan Claude dezelfde Inzicht-structuur invullen
// (herkenning: 'ai'); de regels hieronder blijven dan als vangnet en voor de tests.
//
// Uitgangspunten (opdracht §7):
//  - "Goede locatie en indeling, maar de tuin was te klein" → positief houden, tuinbezwaar aan het bezochte pand koppelen.
//    Nooit een minimale tuinmaat verzinnen.
//  - "Te duur voor wat het is" → prijs-kwaliteitbezwaar, het budget niet verlagen.
//  - "Interessant als de prijs zakt" → prijs van dit pand opvolgen.
//  - "Geen tuin nodig" → géén tuinvereiste maken.
//  - Uitspraken over iemand anders → niet aan deze kandidaat toeschrijven.
import type { Bezoek, Inzicht, InzichtKenmerk, InzichtSoort, Notitie } from './model';

interface Regel {
  patroon: RegExp;
  soort: InzichtSoort;
  kenmerk: InzichtKenmerk;
  uitleg: string;
  betrouwbaarheid?: Inzicht['betrouwbaarheid'];
}

// Volgorde telt: specifieke regels vóór algemene (bv. "te duur voor wat het is" vóór "te duur").
const REGELS: Regel[] = [
  { patroon: /\bgeen tuin nodig\b|\btuin (is )?niet nodig\b|\bhoeft geen tuin\b/i, soort: 'geen_eis', kenmerk: 'tuin', uitleg: 'Tuin is geen vereiste.' },
  { patroon: /\bgeen garage nodig\b|\bgarage (is )?niet nodig\b/i, soort: 'geen_eis', kenmerk: 'parking', uitleg: 'Garage is geen vereiste.' },
  { patroon: /\btuin\b[^.]*\b(te klein|klein)\b|\btuin\b[^.]*\b(mag|mocht|zou|moet) (wat |iets )?groter\b|\bkleine tuin\b|\bte weinig tuin\b/i, soort: 'bezwaar', kenmerk: 'tuin', uitleg: 'Tuin te klein bij dit pand. Zoek alternatieven met aantoonbaar meer bruikbare tuin.' },
  { patroon: /\bte veel (renovatie|werk|verbouwing)\b|\bte veel te doen\b|\bte veel werken\b/i, soort: 'bezwaar', kenmerk: 'staat', uitleg: 'Te veel werk aan dit pand. Zoek panden met aantoonbaar minder werk.' },
  { patroon: /\bte duur voor wat (het|het is|je krijgt)\b|\bprijs[- ]kwaliteit\b/i, soort: 'bezwaar', kenmerk: 'prijs_kwaliteit', uitleg: 'Prijs-kwaliteitbezwaar bij dit pand. Het budget wordt niet automatisch verlaagd.' },
  { patroon: /\b(interessant|opnieuw bekijken|terugkomen)\b[^.]*\b(als|indien|wanneer) de prijs (zakt|daalt|lager)\b|\bals (de prijs|ze) (nog )?(zakt|zakken|daalt)\b/i, soort: 'prijs_volgen', kenmerk: 'prijs', uitleg: 'Prijswijzigingen van dit pand opvolgen.' },
  { patroon: /\bte duur\b|\bprijs (is |was )?te hoog\b|\bboven (ons|hun|mijn) budget\b/i, soort: 'bezwaar', kenmerk: 'prijs', uitleg: 'Prijsbezwaar bij dit pand.' },
  { patroon: /\b(te )?druk(ke)? (straat|weg|baan|steenweg)\b|\blangs de steenweg\b|\bligging (is |was )?(niet goed|slecht|minder)\b|\bte veel verkeer\b|\blawaai(erig)?\b/i, soort: 'bezwaar', kenmerk: 'ligging', uitleg: 'Bezwaar tegen de ligging van dit pand. Een prijsdaling verandert dat niet.' },
  { patroon: /\bindeling (is |was )?(niet goed|onhandig|slecht)\b|\bonhandige indeling\b/i, soort: 'bezwaar', kenmerk: 'indeling', uitleg: 'Bezwaar tegen de indeling van dit pand. Een prijsdaling verandert dat niet.' },
  { patroon: /\bte klein\b|\bte weinig (ruimte|plaats)\b/i, soort: 'bezwaar', kenmerk: 'grootte', uitleg: 'Woning te klein.' },
  { patroon: /\bgoede (locatie|ligging)\b|\b(locatie|ligging) (is |was )?(goed|top|prima|ideaal)\b/i, soort: 'positief', kenmerk: 'locatie', uitleg: 'Ligging positief: behouden als pluspunt.' },
  { patroon: /\bgoede indeling\b|\bindeling (is |was )?(goed|top|prima)\b|\b(locatie|ligging) en indeling\b/i, soort: 'positief', kenmerk: 'indeling', uitleg: 'Indeling positief: behouden als pluspunt.' },
  { patroon: /\b(willen|gaan) (zeker |echt )?(kopen|aankopen)\b|\bvoor (de|het) (zomer|einde van het jaar|nieuwjaar) (iets )?kopen\b|\bkoopklaar\b|\bwillen snel beslissen\b/i, soort: 'aankoopplan', kenmerk: 'algemeen', uitleg: 'Uitdrukkelijk aankoopplan.', betrouwbaarheid: 'middel' },
  { patroon: /\b(gekocht|iets gevonden|zoeken niet meer|stoppen met zoeken|plannen (zijn )?gewijzigd)\b/i, soort: 'gestopt', kenmerk: 'algemeen', uitleg: 'Mogelijk gestopt met zoeken of al gekocht. Eerst nagaan.', betrouwbaarheid: 'middel' },
];

/** Zinsdelen die over iemand anders gaan: niet aan de kandidaat toeschrijven. */
const OVER_ANDER =
  /\b(zijn|haar|hun|mijn) (broer|zus|zoon|dochter|ouders|moeder|vader|vriend|vriendin|collega|buren|schoonouders)\b|\b(de buurman|de buurvrouw|een kennis)\b/i;

/** Splitst in zinnen en in delen rond "maar", zodat "goed X, maar Y te klein" twee aparte uitspraken worden. */
export function zinsdelen(tekst: string): string[] {
  return tekst
    .split(/(?<=[.!?;])\s+|\n+/)
    .flatMap((z) => z.split(/,?\s+maar\s+/i))
    .map((z) => z.trim().replace(/^[-–•]\s*/, ''))
    .filter((z) => z.length > 2);
}

export function interpreteerTekst(bron: { id: string; contactId: string; pandId: string | null; dag: string; tekst: string }): Inzicht[] {
  const uit: Inzicht[] = [];
  zinsdelen(bron.tekst).forEach((deel, i) => {
    if (OVER_ANDER.test(deel)) {
      uit.push({
        id: `inz:${bron.id}:${i}:ander`,
        contactId: bron.contactId,
        pandId: null,
        bronRef: bron.id,
        citaat: deel,
        soort: 'over_ander',
        kenmerk: 'algemeen',
        uitleg: 'Gaat over iemand anders: niet toegeschreven aan deze kandidaat.',
        betrouwbaarheid: 'hoog',
        status: 'voorstel',
        dag: bron.dag,
        herkenning: 'regels',
      });
      return;
    }
    const gezien = new Set<string>();
    for (const r of REGELS) {
      if (!r.patroon.test(deel)) continue;
      const sleutel = `${r.soort}:${r.kenmerk}`;
      // "te klein" na een tuinbezwaar is hetzelfde bezwaar; "te duur" na prijs-kwaliteit ook.
      if (gezien.has(sleutel) || (r.kenmerk === 'grootte' && gezien.has('bezwaar:tuin')) || (r.kenmerk === 'prijs' && r.soort === 'bezwaar' && (gezien.has('bezwaar:prijs_kwaliteit') || gezien.has('prijs_volgen:prijs')))) continue;
      gezien.add(sleutel);
      const pandGebonden = r.soort === 'bezwaar' || r.soort === 'positief' || r.soort === 'prijs_volgen';
      uit.push({
        id: `inz:${bron.id}:${i}:${r.soort}:${r.kenmerk}`,
        contactId: bron.contactId,
        pandId: pandGebonden ? bron.pandId : null,
        bronRef: bron.id,
        citaat: deel,
        soort: r.soort,
        kenmerk: r.kenmerk,
        uitleg: r.uitleg,
        betrouwbaarheid: r.betrouwbaarheid ?? (bron.pandId || !pandGebonden ? 'hoog' : 'middel'),
        status: 'voorstel',
        dag: bron.dag,
        herkenning: 'regels',
      });
    }
  });
  return uit;
}

export function interpreteer(n: Notitie): Inzicht[] {
  return interpreteerTekst(n);
}

export function interpreteerBezoek(b: Bezoek): Inzicht[] {
  return b.evaluatie ? interpreteerTekst({ id: b.id, contactId: b.contactId, pandId: b.pandId, dag: b.dag, tekst: b.evaluatie }) : [];
}

/** Leesbare naam van een kenmerk in een bezwaar of reden. */
export const KENMERK_LABEL: Record<InzichtKenmerk, string> = {
  tuin: 'tuin',
  prijs: 'prijs',
  prijs_kwaliteit: 'prijs-kwaliteit',
  staat: 'te veel werk',
  ligging: 'ligging',
  indeling: 'indeling',
  locatie: 'locatie',
  grootte: 'te klein',
  parking: 'parking',
  algemeen: 'algemeen',
};

/** Bezwaren die een prijsdaling kan veranderen. Ligging, indeling, tuin … veranderen niet door een lagere prijs. */
export function prijsGevoelig(k: InzichtKenmerk): boolean {
  return k === 'prijs' || k === 'prijs_kwaliteit';
}
