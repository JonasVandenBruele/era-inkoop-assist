// Baanprospectie-blokken (Jonas, 6/10/2026): langsgaan en flyers gebeuren enkel in de blokken "Baanprospectie"
// in zijn ERAForce-agenda. Zo'n bezoek staat dus pas op de daglijst op een dag met een blok, en wordt in dat blok gepland.
import { dagVan, uurVan, type DagKey } from '../core/dates';
import type { Afspraak, Contactkanaal } from './model';

/** Werk ter plaatse: dat past enkel in een Baanprospectie-blok. */
export function isVeldwerk(k: Contactkanaal | null | undefined): k is 'bezoek' | 'flyer' {
  return k === 'bezoek' || k === 'flyer';
}

export function isProspectieblok(a: Afspraak): boolean {
  if (/geannuleerd/i.test(a.titel)) return false;
  return /baanprospectie/i.test(a.soortLabel ?? '') || /baanprospectie/i.test(a.titel);
}

/** Blokken van die dag die nog niet voorbij zijn (uur "HH:mm" van nu, indien het vandaag is), vroegste eerst. */
export function prospectieblokkenOp(afspraken: Afspraak[], dag: DagKey, uur?: string): Afspraak[] {
  return afspraken
    .filter((a) => isProspectieblok(a) && !a.heleDag && dagVan(a.start) === dag && (!uur || uurVan(a.einde) > uur))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Het eerstvolgende blok ná die dag, of null als er geen gepland is. */
export function volgendProspectieblok(afspraken: Afspraak[], naDag: DagKey): Afspraak | null {
  return afspraken.filter((a) => isProspectieblok(a) && !a.heleDag && dagVan(a.start) > naDag).sort((a, b) => a.start.getTime() - b.start.getTime())[0] ?? null;
}
