// Prijsdalingen herkennen in de prijshistoriek (automatisch) of uit een handmatige registratie.
// Regels: een eerste prijs is nooit een daling; enkel dezelfde prijssoort en valuta vergelijken; twijfelgevallen
// (grote sprong, snelle correctie) moeten eerst bevestigd worden.
import { dagenTussen } from '../../core/dates';
import type { PrijsRegistratie } from './model';

export type PrijsOordeel = 'prijsdaling' | 'geen_prijsdaling';

export interface PrijsWijziging {
  registratieId: string;
  pandId: string;
  van: number;
  naar: number;
  dag: string;
  /** zeker = duidelijke daling; twijfel = eerst bevestigen; bevestigd/afgewezen = door een medewerker beoordeeld. */
  status: 'zeker' | 'twijfel' | 'bevestigd' | 'afgewezen';
  reden: string | null;
}

/** Een daling van meer dan dit deel is ongewoon (mogelijk een tikfout of andere prijssoort): eerst bevestigen. */
const GROTE_SPRONG = 0.25;
/** Een nieuwe prijs binnen zoveel dagen na de vorige kan een correctie zijn: eerst bevestigen. */
const SNELLE_CORRECTIE_DAGEN = 2;

export function prijsWijzigingen(prijzen: PrijsRegistratie[], oordelen: Map<string, PrijsOordeel>, pandId?: string): PrijsWijziging[] {
  const perPand = new Map<string, PrijsRegistratie[]>();
  for (const p of prijzen) {
    if (pandId && p.pandId !== pandId) continue;
    const sleutel = `${p.pandId}|${p.soort}|${p.valuta}`;
    perPand.set(sleutel, [...(perPand.get(sleutel) ?? []), p]);
  }
  const uit: PrijsWijziging[] = [];
  for (const lijst of perPand.values()) {
    lijst.sort((a, b) => a.dag.localeCompare(b.dag) || a.id.localeCompare(b.id));
    let vorige: PrijsRegistratie | null = null;
    for (const p of lijst) {
      if (vorige === null) {
        vorige = p; // eerste registratie: geen daling
        continue;
      }
      if (p.bedrag < vorige.bedrag) {
        const oordeel = oordelen.get(p.id);
        let status: PrijsWijziging['status'] = 'zeker';
        let reden: string | null = null;
        const daling = (vorige.bedrag - p.bedrag) / vorige.bedrag;
        if (daling > GROTE_SPRONG) {
          status = 'twijfel';
          reden = `Daling van ${Math.round(daling * 100)}% is ongewoon groot. Controleer of het om dezelfde prijssoort gaat.`;
        } else if (dagenTussen(vorige.dag, p.dag) < SNELLE_CORRECTIE_DAGEN) {
          status = 'twijfel';
          reden = 'Nieuwe prijs kort na de vorige: mogelijk een correctie in plaats van een prijsdaling.';
        }
        if (oordeel === 'prijsdaling') status = 'bevestigd';
        if (oordeel === 'geen_prijsdaling') status = 'afgewezen';
        uit.push({ registratieId: p.id, pandId: p.pandId, van: vorige.bedrag, naar: p.bedrag, dag: p.dag, status, reden });
      }
      // Enkel een stijging, een zekere of een bevestigde daling wordt het nieuwe vergelijkingspunt. Een (nog) twijfelachtige
      // of afgewezen registratie mag latere echte dalingen niet verbergen.
      const laatste = uit.at(-1);
      const isDezeDaling = laatste?.registratieId === p.id;
      if (!isDezeDaling ? p.bedrag >= vorige.bedrag : laatste.status === 'zeker' || laatste.status === 'bevestigd') vorige = p;
    }
  }
  return uit.sort((a, b) => b.dag.localeCompare(a.dag));
}

/** Een prijsdaling die als aanleiding mag dienen (zeker of bevestigd). */
export function isBruikbareDaling(w: PrijsWijziging): boolean {
  return w.status === 'zeker' || w.status === 'bevestigd';
}

/** Huidige vraagprijs: de laatste registratie, zonder afgewezen of nog onbevestigde twijfelgevallen. */
export function huidigePrijs(prijzen: PrijsRegistratie[], oordelen: Map<string, PrijsOordeel>, pandId: string): number | null {
  const twijfel = new Set(
    prijsWijzigingen(prijzen, oordelen, pandId)
      .filter((w) => w.status === 'twijfel' || w.status === 'afgewezen')
      .map((w) => w.registratieId),
  );
  const lijst = prijzen
    .filter((p) => p.pandId === pandId && !twijfel.has(p.id) && oordelen.get(p.id) !== 'geen_prijsdaling')
    .sort((a, b) => a.dag.localeCompare(b.dag) || a.id.localeCompare(b.id));
  return lijst.at(-1)?.bedrag ?? null;
}

export function euro(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'onbekend';
  return `€${Math.round(n).toLocaleString('nl-BE').replace(/ |\s/g, '.')}`;
}
