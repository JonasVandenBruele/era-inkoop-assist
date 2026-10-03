// Werkdagen: maandag–vrijdag, zonder Belgische wettelijke feestdagen.
import { parseISO, getDay } from 'date-fns';
import { plusDagen, type DagKey } from '../core/dates';

/** Paaszondag (Gregoriaans, algoritme van Meeus/Jones/Butcher). */
function paaszondag(jaar: number): DagKey {
  const a = jaar % 19;
  const b = Math.floor(jaar / 100);
  const c = jaar % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const maand = Math.floor((h + l - 7 * m + 114) / 31);
  const dag = ((h + l - 7 * m + 114) % 31) + 1;
  return `${jaar}-${String(maand).padStart(2, '0')}-${String(dag).padStart(2, '0')}`;
}

const cache = new Map<number, Set<DagKey>>();

/** De 10 wettelijke feestdagen in België. */
export function belgischeFeestdagen(jaar: number): Set<DagKey> {
  let set = cache.get(jaar);
  if (!set) {
    const pasen = paaszondag(jaar);
    set = new Set([
      `${jaar}-01-01`, // Nieuwjaar
      plusDagen(pasen, 1), // Paasmaandag
      `${jaar}-05-01`, // Dag van de Arbeid
      plusDagen(pasen, 39), // O.L.H. Hemelvaart
      plusDagen(pasen, 50), // Pinkstermaandag
      `${jaar}-07-21`, // Nationale feestdag
      `${jaar}-08-15`, // O.L.V. Hemelvaart
      `${jaar}-11-01`, // Allerheiligen
      `${jaar}-11-11`, // Wapenstilstand
      `${jaar}-12-25`, // Kerstmis
    ]);
    cache.set(jaar, set);
  }
  return set;
}

export function isWerkdag(dag: DagKey): boolean {
  const weekdag = getDay(parseISO(dag)); // 0 = zondag
  if (weekdag === 0 || weekdag === 6) return false;
  return !belgischeFeestdagen(Number(dag.slice(0, 4))).has(dag);
}

/** De n-de werkdag ná `dag` (n = 0 geeft `dag` zelf als dat een werkdag is, anders de volgende). */
export function plusWerkdagen(dag: DagKey, n: number): DagKey {
  let d = dag;
  if (n === 0) {
    while (!isWerkdag(d)) d = plusDagen(d, 1);
    return d;
  }
  let over = n;
  while (over > 0) {
    d = plusDagen(d, 1);
    if (isWerkdag(d)) over--;
  }
  return d;
}

/** Aantal werkdagen na `van` tot en met `tot` (0 als `tot` niet later is). */
export function werkdagenTussen(van: DagKey, tot: DagKey): number {
  let n = 0;
  for (let d = plusDagen(van, 1); d <= tot; d = plusDagen(d, 1)) if (isWerkdag(d)) n++;
  return n;
}
