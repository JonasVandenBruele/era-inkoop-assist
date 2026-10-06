// WhatsApp (zakelijk nummer op de Mac) → Oxpecker. Draait na de ERAForce-import, via mirror.py (07:00 en 19:00).
//
//   npx tsx scripts/whatsapp-naar-oxpecker.ts [--droog]
//
// Naar Supabase gaat per contact en per dag enkel DAT er WhatsApp-contact was en wie wat stuurde (aantallen),
// als bronactiviteit met bron 'whatsapp'. Nooit de inhoud van berichten. Logt enkel aantallen.
// --droog leest en telt, maar schrijft niets: handig om de eerste keer te controleren.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { dagTekst, nummersVan, perDag } from '../src/adapters/gesprekken/whatsapp';
import type { Telefoon } from '../src/domain/model';
import { leesWhatsapp, zoekWhatsapp } from './whatsapp-lezen';

const OXPECKER_EMAIL = process.env.OXPECKER_EMAIL ?? 'jonas@eraleustoye.be';
const DB_HOST = process.env.SUPABASE_DB_HOST ?? 'aws-1-eu-central-1.pooler.supabase.com';
const DROOG = process.argv.includes('--droog');

let db: pg.Client | null = null;
try {
  const pad = zoekWhatsapp();
  if (!pad) throw new Error('geen WhatsApp-database op deze Mac gevonden');

  const projectRef = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(readFileSync(join(import.meta.dirname, '..', '.env.local'), 'utf8'))?.[1];
  if (!projectRef) throw new Error('Supabase-project niet gevonden in .env.local');
  const wachtwoord = execFileSync('security', ['find-generic-password', '-s', 'Oxpecker import (Supabase)', '-w'], { encoding: 'utf8' }).trim();
  db = new pg.Client({ host: DB_HOST, port: 5432, user: `oxpecker_import.${projectRef}`, password: wachtwoord, database: 'postgres', ssl: { rejectUnauthorized: false } });
  await db.connect();
  const eigenaar = (await db.query<{ id: string | null }>('select public.import_eigenaar($1) as id', [OXPECKER_EMAIL])).rows[0]?.id;
  if (!eigenaar) throw new Error('Oxpecker-gebruiker niet gevonden');

  // Nummers van je ERAForce-contacten → contact-id's (een nummer kan bij meer dan één contact horen).
  const contacten = (
    await db.query<{ id: string; telefoons: Telefoon[] }>(`select id, telefoons from public.contacten where eigenaar_id = $1 and bron = 'eraforce_mirror' and not is_testdata`, [eigenaar])
  ).rows;
  const contactenVan = new Map<string, string[]>();
  for (const c of contacten) for (const n of nummersVan(c.telefoons ?? [])) contactenVan.set(n, [...(contactenVan.get(n) ?? []), c.id]);

  let lezing;
  try {
    lezing = leesWhatsapp(pad, new Set(contactenVan.keys()));
  } catch (e) {
    const m = String(e);
    throw new Error(/authorization|not permitted|unable to open|SQLITE_CANTOPEN|SQLITE_AUTH/i.test(m) ? 'geen toegang tot de WhatsApp-database (macOS-toestemming nodig)' : `WhatsApp-database onleesbaar: ${m.slice(0, 80)}`);
  }

  const rijen: Record<string, unknown>[] = [];
  for (const [nummer, berichten] of lezing.berichten) {
    for (const d of perDag(berichten)) {
      for (const contactId of contactenVan.get(nummer) ?? []) {
        rijen.push({
          bron: 'whatsapp',
          extern_id: `wa:${contactId}:${d.dag}`,
          gebeurd_op: d.laatste.toISOString(),
          gewijzigd_in_bron_op: d.laatste.toISOString(),
          is_testdata: false,
          // De klant stuurde iets: dat telt als inhoudelijk contact. Enkel van jou: een notitie (geen gesprek).
          type: d.vanKlant > 0 ? 'gesprek' : 'notitie',
          contact_id: contactId,
          taak_soort: null,
          vervalt_op: null,
          vervalt_uur: null,
          taak_afgerond: true,
          auteur: null,
          tekst: dagTekst(d),
          soort_label: 'WhatsApp',
          kanaal: 'whatsapp',
        });
      }
    }
  }
  const metContact = new Set(rijen.map((r) => r.contact_id)).size;
  console.log(
    `WhatsApp: ${lezing.telling.chats} chats op de Mac, ${lezing.telling.gekoppeld} gekoppeld aan een ERAForce-contact, ${lezing.telling.berichten} berichten (laatste 12 maanden), ${rijen.length} contactdagen bij ${metContact} contacten.`,
  );
  if (DROOG) process.exit(0);

  await db.query('begin');
  for (let i = 0; i < rijen.length; i += 1000) {
    await db.query(
      `insert into public.bronactiviteiten (eigenaar_id, geimporteerd_op, bron, extern_id, gebeurd_op, gewijzigd_in_bron_op, is_testdata, type, contact_id, taak_soort,
         vervalt_op, vervalt_uur, taak_afgerond, auteur, tekst, soort_label, kanaal)
       select $2::uuid, now(), bron, extern_id, gebeurd_op, gewijzigd_in_bron_op, is_testdata, type, contact_id, taak_soort, vervalt_op, vervalt_uur, taak_afgerond, auteur, tekst, soort_label, kanaal
       from json_populate_recordset(null::public.bronactiviteiten, $1::json)
       on conflict (eigenaar_id, bron, extern_id) where extern_id is not null
       do update set gebeurd_op = excluded.gebeurd_op, gewijzigd_in_bron_op = excluded.gewijzigd_in_bron_op, type = excluded.type, tekst = excluded.tekst, geimporteerd_op = now()`,
      [JSON.stringify(rijen.slice(i, i + 1000)), eigenaar],
    );
  }
  const weg = await db.query(`delete from public.bronactiviteiten where eigenaar_id = $1 and bron = 'whatsapp' and not (extern_id = any($2))`, [eigenaar, rijen.map((r) => r.extern_id)]);
  await db.query('commit');
  console.log(`WhatsApp bijgewerkt: ${rijen.length} contactdagen, ${weg.rowCount ?? 0} weg.`);
} catch (e) {
  await db?.query('rollback').catch(() => {});
  console.error(`WhatsApp mislukt: ${e instanceof Error ? e.message.slice(0, 200) : 'onbekende fout'}`);
  process.exitCode = 1;
} finally {
  await db?.end();
}
