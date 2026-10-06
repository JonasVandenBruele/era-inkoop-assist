// WhatsApp (zakelijk nummer op de Mac) → Oxpecker. Pure functies; het lezen gebeurt in scripts/whatsapp-lezen.ts.
//
// Afspraken met Jonas (6/10/2026):
// - Enkel 1-op-1-chats met nummers die ook bij een ERAForce-contact staan. Groepen en andere chats worden niet gelezen.
// - Naar Supabase gaat per contact en per dag enkel DAT er WhatsApp-contact was en wie wat stuurde, nooit de inhoud.
// - Een dag waarop de klant iets stuurde, telt als inhoudelijk contact (ritme, geplande stap afgerond).
//   Enkel berichten van jou zonder reactie is geen gesprek.
// - De inhoud van de laatste berichten gaat enkel lokaal naar Claude, als context voor de hooks.
import { dagVan, type DagKey } from '../../core/dates';
import type { Telefoon } from '../../domain/model';

/** Core Data bewaart tijden als seconden sinds 1/1/2001. */
export const CORE_DATA_EPOCH = 978307200;

export function coreDataDatum(seconden: number): Date {
  return new Date((seconden + CORE_DATA_EPOCH) * 1000);
}

/** Belgisch nummer in de vorm die WhatsApp gebruikt: "32470123456". Null als het geen bruikbaar nummer is. */
export function waNummer(nummer: string): string | null {
  let d = nummer.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = `32${d.slice(1)}`;
  return /^\d{9,15}$/.test(d) ? d : null;
}

/** "32470123456@s.whatsapp.net" → "32470123456". Groepen (@g.us), kanalen en @lid-adressen geven null. */
export function nummerUitJid(jid: string | null | undefined): string | null {
  const m = /^(\d{9,15})@s\.whatsapp\.net$/.exec(jid ?? '');
  return m ? m[1]! : null;
}

/** Alle WhatsApp-nummers van een contact. */
export function nummersVan(telefoons: Telefoon[]): string[] {
  return [...new Set(telefoons.map((t) => waNummer(t.nummer)).filter((n): n is string => n !== null))];
}

export interface WaBericht {
  tijd: Date;
  vanMij: boolean;
  tekst: string | null;
}

export interface WaDag {
  dag: DagKey;
  vanMij: number;
  vanKlant: number;
  laatste: Date;
}

/** Berichten samenvatten per Brusselse dag, zonder inhoud. Nieuwste dag eerst. */
export function perDag(berichten: WaBericht[]): WaDag[] {
  const dagen = new Map<DagKey, WaDag>();
  for (const b of berichten) {
    const dag = dagVan(b.tijd);
    const d = dagen.get(dag) ?? { dag, vanMij: 0, vanKlant: 0, laatste: b.tijd };
    if (b.vanMij) d.vanMij++;
    else d.vanKlant++;
    if (b.tijd > d.laatste) d.laatste = b.tijd;
    dagen.set(dag, d);
  }
  return [...dagen.values()].sort((a, b) => b.dag.localeCompare(a.dag));
}

/** Tekst voor de bronactiviteit: enkel aantallen, nooit de inhoud. */
export function dagTekst(d: WaDag): string {
  const delen = [d.vanMij && `${d.vanMij} van jou`, d.vanKlant && `${d.vanKlant} van de klant`].filter(Boolean).join(', ');
  return `WhatsApp: ${delen}${d.vanKlant === 0 ? ' (nog geen reactie)' : ''}`;
}
