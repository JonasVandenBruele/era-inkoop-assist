// Aanknopingspunt zonder AI (6/10/2026): geen algemene "we hadden afgesproken"-zin, maar wat er concreet
// in de taak en het laatste gesprek staat. Jonas leest het als geheugensteun; de app maakt er geen zin van.
import { dagVan, type DagKey } from '../core/dates';
import type { LaatsteContact } from './overzicht';
import type { Terugbelafspraak } from './prioriteit';
import { isGevoelig } from './haken';

/** Taakonderwerpen die niets zeggen over waarover het gesprek moet gaan. */
const NIETSZEGGEND =
  /^(tb|t\.?b\.?|terugbellen|terug bellen|bellen|opbellen|bel|update|updaten|opvolgen|opvolging|telefonische opvolging|uitgaande oproep|inkomende oproep|follow[- ]?up|zo bellen|opvolgtaak|taak|herinnering|nabellen|(bellen|opvolgen),? zie vorige taken?)\b[\s:!.,;)(-]*(:\)|\(:)?\s*$/i;

export function isNietszeggend(onderwerp: string | null | undefined): boolean {
  const t = (onderwerp ?? '').trim();
  return t === '' || NIETSZEGGEND.test(t) || /^(tb|bellen|opvolgen)\s+(mevr\.?|dhr\.?|fam\.?|mevrouw|meneer|familie)\b/i.test(t);
}

export interface Aanknopingspunt {
  /** Specifiek onderwerp van de geplande taak, bv. "Zeker van biddit?". */
  taak: string | null;
  /** Fragment uit het laatste inhoudelijke gesprek, met de dag. */
  gesprek: { dag: DagKey; fragment: string } | null;
}

function eersteRegel(t: string): string {
  return t.split('\n')[0]!.trim();
}

/** Tekst van het laatste gesprek zonder het nietszeggende onderwerp ervoor ("Uitgaande Oproep\n\nWil toch …"). */
function kern(tekst: string): string {
  const regels = tekst.split(/\n+/).map((r) => r.trim()).filter(Boolean);
  while (regels.length > 1 && isNietszeggend(regels[0])) regels.shift();
  return regels.join(' ');
}

export function kortAf(t: string, max: number): string {
  return t.length > max ? `${t.slice(0, max).replace(/\s+\S*$/, '').trimEnd()}…` : t;
}

export function aanknopingspunt(terugbel: Terugbelafspraak | null, laatste: LaatsteContact | null, max = 180): Aanknopingspunt {
  const onderwerp = terugbel?.tekst ? eersteRegel(terugbel.tekst) : null;
  const taak = onderwerp && !isNietszeggend(onderwerp) && !isGevoelig(onderwerp) ? kortAf(onderwerp, 100) : null;
  const k = laatste?.tekst ? kern(laatste.tekst) : '';
  // Een gesprek van minder dan drie woorden ("invite .") zegt ook niets.
  const woorden = k.split(/\s+/).filter((w) => /\p{L}{2,}/u.test(w)).length;
  const gesprek = laatste && k && woorden >= 3 && !isNietszeggend(k) ? { dag: dagVan(laatste.tijdstip), fragment: kortAf(k, max) } : null;
  return { taak, gesprek };
}
