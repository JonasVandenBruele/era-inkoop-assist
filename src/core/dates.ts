// Alle dagberekeningen gebeuren in Europe/Brussels.
// Een "dag" stellen we voor als string "YYYY-MM-DD" (DagKey): ondubbelzinnig, los van tijdzones.
import { TZDate } from '@date-fns/tz';
import { addDays, format, parseISO, isValid, differenceInCalendarDays } from 'date-fns';
import { nlBE } from 'date-fns/locale';

export const TIJDZONE = 'Europe/Brussels';

/** "YYYY-MM-DD" in Brusselse tijd. */
export type DagKey = string;

const DAG_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOKAAL_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;

export function isDagKey(s: string): boolean {
  return DAG_RE.test(s) && isValid(parseISO(s));
}

/** Zet een lokale Brusselse tijd ("2026-10-13T07:30" of "2026-10-13") om naar een absoluut tijdstip. */
export function vanBrusselsLokaal(lokaal: string): Date {
  const m = LOKAAL_RE.exec(lokaal);
  if (!m) throw new Error(`Ongeldige lokale datum: ${lokaal}`);
  const [, j, mo, d, u, mi] = m;
  const tz = new TZDate(Number(j), Number(mo) - 1, Number(d), Number(u ?? 0), Number(mi ?? 0), TIJDZONE);
  return new Date(tz.getTime());
}

/** Tijdstip → DagKey in Brussel. */
export function dagVan(tijdstip: Date): DagKey {
  return format(new TZDate(tijdstip, TIJDZONE), 'yyyy-MM-dd');
}

/** Tijdstip → "HH:mm" in Brussel. */
export function uurVan(tijdstip: Date): string {
  return format(new TZDate(tijdstip, TIJDZONE), 'HH:mm');
}

/** Start van een Brusselse dag als absoluut tijdstip. */
export function startVanDag(dag: DagKey): Date {
  return vanBrusselsLokaal(`${dag}T00:00`);
}

/** Dag + n kalenderdagen (zomertijd-veilig, want we rekenen op datums, niet op uren). */
export function plusDagen(dag: DagKey, n: number): DagKey {
  return format(addDays(parseISO(dag), n), 'yyyy-MM-dd');
}

/** Aantal kalenderdagen van `van` tot `tot` (positief als `tot` later is). */
export function dagenTussen(van: DagKey, tot: DagKey): number {
  return differenceInCalendarDays(parseISO(tot), parseISO(van));
}

/** Combineer een Brusselse dag en "HH:mm" tot een tijdstip. */
export function opDagUur(dag: DagKey, uur: string): Date {
  return vanBrusselsLokaal(`${dag}T${uur}`);
}

const WEEKDAGEN = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'] as const;
const MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'] as const;

/** "di 13 okt" (vaste Belgische afkortingen, zonder punten). */
export function korteDag(dag: DagKey): string {
  const d = parseISO(dag);
  return `${WEEKDAGEN[d.getDay()]} ${d.getDate()} ${MAANDEN[d.getMonth()]}`;
}

/** "dinsdag 13 oktober 2026" */
export function langeDag(dag: DagKey): string {
  return format(parseISO(dag), 'EEEE d MMMM yyyy', { locale: nlBE });
}

/** "13/10 om 14:05" in Brusselse tijd. */
export function datumUur(tijdstip: Date): string {
  return format(new TZDate(tijdstip, TIJDZONE), "d/MM 'om' HH:mm", { locale: nlBE });
}

/** Mensvriendelijk: "vandaag", "gisteren", "3 dagen geleden", "over 5 dagen". */
export function relatief(dag: DagKey, vandaag: DagKey): string {
  const n = dagenTussen(vandaag, dag);
  if (n === 0) return 'vandaag';
  if (n === -1) return 'gisteren';
  if (n === 1) return 'morgen';
  if (n < 0) return `${-n} dagen geleden`;
  return `over ${n} dagen`;
}
