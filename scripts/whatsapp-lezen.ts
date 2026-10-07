// Leest de WhatsApp-chats van de Mac ALLEEN-LEZEN (de lokale database van de WhatsApp-app).
// Enkel 1-op-1-chats met nummers die je meegeeft (de nummers van je ERAForce-contacten); de rest wordt niet gelezen.
// Gebruikt door scripts/whatsapp-naar-oxpecker.ts (enkel aantallen naar Supabase) en scripts/hooks-maken.ts (inhoud lokaal naar Claude).
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { berichtSoortTekst, CORE_DATA_EPOCH, coreDataDatum, nummerUitJid, type WaBericht } from '../src/adapters/gesprekken/whatsapp';

/** Waar de WhatsApp-app op de Mac haar chats bewaart. De Business-app eerst. */
export function zoekWhatsapp(): string | null {
  const kandidaten = [
    process.env.WHATSAPP_DB,
    join(homedir(), 'Library/Group Containers/group.net.whatsapp.WhatsAppSMB.shared/ChatStorage.sqlite'),
    join(homedir(), 'Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite'),
  ];
  return kandidaten.find((p): p is string => Boolean(p && existsSync(p))) ?? null;
}

export interface WaLezing {
  /** Nummer ("32470123456") → berichten, oudste eerst. */
  berichten: Map<string, WaBericht[]>;
  /** Enkel aantallen, voor het logboek. */
  telling: { chats: number; gekoppeld: number; berichten: number };
}

/**
 * Berichten van de laatste `dagen` dagen voor de gevraagde nummers. Gooit een korte technische fout (zonder inhoud)
 * als de database onleesbaar is of een onbekende opbouw heeft.
 */
export function leesWhatsapp(pad: string, nummers: Set<string>, dagen = 365): WaLezing {
  const db = new DatabaseSync(pad, { readOnly: true });
  try {
    const kolommen = (tabel: string) => new Set((db.prepare(`pragma table_info("${tabel}")`).all() as { name: string }[]).map((k) => k.name));
    const sessie = kolommen('ZWACHATSESSION');
    const bericht = kolommen('ZWAMESSAGE');
    for (const k of ['Z_PK', 'ZCONTACTJID']) if (!sessie.has(k)) throw new Error(`onbekende opbouw (ZWACHATSESSION.${k})`);
    for (const k of ['ZCHATSESSION', 'ZISFROMME', 'ZMESSAGEDATE', 'ZTEXT']) if (!bericht.has(k)) throw new Error(`onbekende opbouw (ZWAMESSAGE.${k})`);

    const chats = db.prepare('select Z_PK as id, ZCONTACTJID as jid from ZWACHATSESSION').all() as { id: number; jid: string | null }[];
    const sessieNummer = new Map<number, string>();
    for (const c of chats) {
      const n = nummerUitJid(c.jid);
      if (n && nummers.has(n)) sessieNummer.set(c.id, n);
    }
    const berichten = new Map<string, WaBericht[]>();
    let aantal = 0;
    const vanaf = Date.now() / 1000 - CORE_DATA_EPOCH - dagen * 86400;
    const ids = [...sessieNummer.keys()];
    for (let i = 0; i < ids.length; i += 500) {
      const deel = ids.slice(i, i + 500);
      const rijen = db
        .prepare(
          `select ZCHATSESSION as sessie, ZISFROMME as vanMij, ZMESSAGEDATE as datum, ZTEXT as tekst from ZWAMESSAGE
           where ZCHATSESSION in (${deel.map(() => '?').join(',')}) and ZMESSAGEDATE >= ? order by ZMESSAGEDATE`,
        )
        .all(...deel, vanaf) as { sessie: number; vanMij: number; datum: number; tekst: string | null }[];
      for (const r of rijen) {
        const n = sessieNummer.get(r.sessie)!;
        const lijst = berichten.get(n) ?? [];
        lijst.push({ tijd: coreDataDatum(r.datum), vanMij: r.vanMij === 1, tekst: r.tekst });
        berichten.set(n, lijst);
        aantal++;
      }
    }
    return { berichten, telling: { chats: chats.length, gekoppeld: sessieNummer.size, berichten: aantal } };
  } finally {
    db.close();
  }
}

export interface WaChat {
  nummer: string;
  /** Naam zoals WhatsApp ze toont (contact in je telefoon of profielnaam). */
  naam: string | null;
  /** Berichten van de laatste `dagen` dagen, oudste eerst; zonder systeem- en reactieberichten. */
  berichten: WaBericht[];
}

/**
 * Alle 1-op-1-chats met een bericht in de laatste `dagen` dagen (Te beantwoorden, toestemming Jonas 7/10/2026).
 * Geen groepen, verborgen of verwijderde chats. Berichten zonder tekst worden "[foto]", "[spraakbericht]", ….
 */
export function leesRecenteChats(pad: string, dagen = 30, perChat = 20): WaChat[] {
  const db = new DatabaseSync(pad, { readOnly: true });
  try {
    const vanaf = Date.now() / 1000 - CORE_DATA_EPOCH - dagen * 86400;
    const chats = db
      .prepare(
        `select Z_PK as id, ZCONTACTJID as jid, ZPARTNERNAME as naam from ZWACHATSESSION
         where ZCONTACTJID like '%@s.whatsapp.net' and coalesce(ZREMOVED, 0) = 0 and coalesce(ZHIDDEN, 0) = 0 and ZLASTMESSAGEDATE >= ?`,
      )
      .all(vanaf) as { id: number; jid: string | null; naam: string | null }[];
    const uit: WaChat[] = [];
    const lees = db.prepare(
      `select ZISFROMME as vanMij, ZMESSAGEDATE as datum, ZTEXT as tekst, ZMESSAGETYPE as type from ZWAMESSAGE
       where ZCHATSESSION = ? and ZMESSAGEDATE >= ? and ZMESSAGETYPE not in (6, 10, 59, 66) order by ZMESSAGEDATE desc limit ?`,
    );
    for (const c of chats) {
      const nummer = nummerUitJid(c.jid);
      if (!nummer) continue;
      const rijen = lees.all(c.id, vanaf, perChat) as { vanMij: number; datum: number; tekst: string | null; type: number }[];
      if (rijen.length === 0) continue;
      uit.push({
        nummer,
        naam: c.naam?.trim() || null,
        berichten: rijen.reverse().map((r) => ({ tijd: coreDataDatum(r.datum), vanMij: r.vanMij === 1, tekst: r.tekst?.trim() || berichtSoortTekst(r.type) })),
      });
    }
    return uit;
  } finally {
    db.close();
  }
}
