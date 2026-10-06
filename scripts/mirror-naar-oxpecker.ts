// ERAForce-mirror → Oxpecker (fase 8). Draait op de Mac, na elke mirror-run (07:00 en 19:00), zolang de kluis open is.
//
//   npx tsx scripts/mirror-naar-oxpecker.ts <pad/naar/mirror.sqlite> [--droog]
//
// Leest de mirror ALLEEN-LEZEN en stuurt enkel door wat op de gebruiker van toepassing is (besluit Jonas 5/10/2026):
// zijn leads, de contacten waarmee hij taken of afspraken heeft, zijn taken (plus taken van collega's op zijn leads)
// en zijn afspraken. Schrijft als de rol oxpecker_import, die enkel rijen met bron 'eraforce_mirror' mag aanraken.
// Het wachtwoord komt uit de macOS-sleutelhanger. Logt enkel aantallen, nooit namen of inhoud.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import {
  afspraakAlsGesprek,
  contactNaarContact,
  eventNaarAfspraak,
  leadNaarContact,
  taakNaarActiviteit,
  type ActiviteitImport,
  type AfspraakImport,
  type ContactImport,
  type SfRij,
} from '../src/adapters/crm/eraforce';

const SF_GEBRUIKER = process.env.ERAFORCE_GEBRUIKER ?? 'jonas.vandenbruele@era.leustoye';
const OXPECKER_EMAIL = process.env.OXPECKER_EMAIL ?? 'jonas@eraleustoye.be';
const DB_HOST = process.env.SUPABASE_DB_HOST ?? 'aws-1-eu-central-1.pooler.supabase.com';
const SLEUTELHANGER = 'Oxpecker import (Supabase)';

const [pad] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DROOG = process.argv.includes('--droog');
if (!pad) {
  console.error('Gebruik: mirror-naar-oxpecker.ts <mirror.sqlite> [--droog]');
  process.exit(1);
}

// ---------- 1. Lezen uit de mirror ----------

const mirror = new DatabaseSync(pad, { readOnly: true });
const lees = (sql: string, ...p: (string | number)[]) => mirror.prepare(sql).all(...p) as SfRij[];
const inBlokken = (tabel: string, ids: string[]) => {
  const uit: SfRij[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const deel = ids.slice(i, i + 500);
    uit.push(...lees(`select * from "${tabel}" where _verwijderd = 0 and Id in (${deel.map(() => '?').join(',')})`, ...deel));
  }
  return uit;
};

const ik = lees('select Id from "User" where lower(Username) = lower(?)', SF_GEBRUIKER)[0]?.Id as string | undefined;
if (!ik) throw new Error('ERAForce-gebruiker niet gevonden in de mirror.');
const namen = new Map(lees('select Id, Name from "User"').map((r) => [r.Id as string, (r.Name as string) ?? null]));
const naam = (id: string | null) => (id ? (namen.get(id) ?? null) : null);

const leads = lees('select * from Lead where _verwijderd = 0 and OwnerId = ?', ik);
const taken = lees(
  'select * from Task where _verwijderd = 0 and (OwnerId = ? or WhoId in (select Id from Lead where _verwijderd = 0 and OwnerId = ?))',
  ik,
  ik,
);
const events = lees('select * from Event where _verwijderd = 0 and OwnerId = ?', ik);

// Contacten (003) waarmee ik taken of afspraken heb.
const contactIds = [...new Set([...taken, ...events].map((r) => r.WhoId as string | null).filter((id): id is string => Boolean(id?.startsWith('003'))))];

const contacten: ContactImport[] = [
  ...leads.map(leadNaarContact).filter((c): c is ContactImport => c !== null),
  ...inBlokken('Contact', contactIds).map(contactNaarContact),
];
const personen = new Set(contacten.map((c) => c.externId!));
const nu = new Date();
const activiteiten: ActiviteitImport[] = [
  ...taken.map((t) => taakNaarActiviteit(t, naam)),
  ...events.map((e) => afspraakAlsGesprek(e, nu, naam)),
].filter((a): a is ActiviteitImport => a !== null && personen.has(a.contactExternId));
const afspraken: AfspraakImport[] = events
  .map(eventNaarAfspraak)
  .filter((a): a is AfspraakImport => a !== null)
  .map((a) => (a.contactExternId && !personen.has(a.contactExternId) ? { ...a, contactExternId: null, koppelStatus: 'geen' as const } : a));
mirror.close();

console.log(
  `Selectie: ${contacten.length} contacten (${leads.length} leads, ${contactIds.length} contacten), ${activiteiten.length} activiteiten, ${afspraken.length} afspraken.`,
);
if (DROOG) {
  const telling = (xs: { statusBron?: string; type?: string }[], k: 'statusBron' | 'type') =>
    Object.entries(xs.reduce<Record<string, number>>((m, x) => ((m[x[k]!] = (m[x[k]!] ?? 0) + 1), m), {}));
  console.log('Status:', telling(contacten, 'statusBron'), '| Activiteiten:', telling(activiteiten, 'type'));
  console.log('Open terugbeltaken:', activiteiten.filter((a) => a.type === 'taak' && a.taakSoort === 'terugbellen').length);
  process.exit(0);
}

// ---------- 2. Schrijven naar Supabase ----------

const projectRef = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(readFileSync(join(import.meta.dirname, '..', '.env.local'), 'utf8'))?.[1];
if (!projectRef) throw new Error('Supabase-project niet gevonden in .env.local.');
const wachtwoord = execFileSync('security', ['find-generic-password', '-s', SLEUTELHANGER, '-w'], { encoding: 'utf8' }).trim();

const db = new pg.Client({ host: DB_HOST, port: 5432, user: `oxpecker_import.${projectRef}`, password: wachtwoord, database: 'postgres', ssl: { rejectUnauthorized: false } });
await db.connect();

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const herkomst = (x: { externId: string | null; gebeurdOp: Date | null; gewijzigdInBronOp: Date | null }) => ({
  bron: 'eraforce_mirror',
  extern_id: x.externId,
  gebeurd_op: iso(x.gebeurdOp),
  gewijzigd_in_bron_op: iso(x.gewijzigdInBronOp),
  is_testdata: false,
});

/** Upsert via JSON; geeft extern_id → id terug en telt nieuwe rijen. */
async function upsert(tabel: string, eigenaar: string, rijen: Record<string, unknown>[]) {
  const kolommen = Object.keys(rijen[0] ?? { extern_id: null });
  const lijst = kolommen.map((k) => `"${k}"`).join(', ');
  const update = kolommen.filter((k) => k !== 'extern_id').map((k) => `"${k}" = excluded."${k}"`).join(', ');
  const ids = new Map<string, string>();
  let nieuw = 0;
  for (let i = 0; i < rijen.length; i += 1000) {
    const r = await db.query<{ id: string; extern_id: string; nieuw: boolean }>(
      `insert into public.${tabel} (eigenaar_id, geimporteerd_op, ${lijst})
       select $2::uuid, now(), ${lijst} from json_populate_recordset(null::public.${tabel}, $1::json)
       on conflict (eigenaar_id, bron, extern_id) where extern_id is not null
       do update set ${update}, geimporteerd_op = now()
       returning id, extern_id, (xmax = 0) as nieuw`,
      [JSON.stringify(rijen.slice(i, i + 1000)), eigenaar],
    );
    for (const x of r.rows) {
      ids.set(x.extern_id, x.id);
      if (x.nieuw) nieuw++;
    }
  }
  return { ids, nieuw };
}

let runId: string | null = null;
try {
  await db.query('begin');
  const eigenaar = (await db.query<{ id: string | null }>('select public.import_eigenaar($1) as id', [OXPECKER_EMAIL])).rows[0]?.id;
  if (!eigenaar) throw new Error('Oxpecker-gebruiker niet gevonden.');
  const bronId = (
    await db.query<{ id: string }>(
      `insert into public.bronnen (eigenaar_id, soort, adapter, naam, is_testdata) values ($1, 'crm', 'eraforce_mirror', 'ERAForce-mirror', false)
       on conflict (eigenaar_id, soort, adapter) do update set naam = excluded.naam returning id`,
      [eigenaar],
    )
  ).rows[0]!.id;
  runId = (await db.query<{ id: string }>('insert into public.import_runs (eigenaar_id, bron_id) values ($1, $2) returning id', [eigenaar, bronId])).rows[0]!.id;

  // Contacten
  const c = await upsert(
    'contacten',
    eigenaar,
    contacten.map((x) => ({
      ...herkomst(x),
      aanhef: x.aanhef,
      voornaam: x.voornaam,
      achternaam: x.achternaam,
      telefoons: x.telefoons,
      email: x.email,
      straat: x.straat,
      postcode: x.postcode,
      gemeente: x.gemeente,
      status_bron: x.statusBron,
      status_label_bron: x.statusLabelBron ?? null,
      herkomst_contact: x.herkomstContact,
      niet_bellen_bron: x.nietBellenBron,
      aangemaakt_in_bron_op: iso(x.aangemaaktInBronOp),
    })),
  );
  // Niet meer in de selectie (verwijderd, geconverteerd of overgedragen): niet wissen, want je eigen notities en
  // belresultaten hangen eraan. Wel van de bellijst halen.
  const weg = await db.query(
    `update public.contacten set status_bron = 'beeindigd', status_label_bron = 'Niet meer bij jou in ERAForce'
     where eigenaar_id = $1 and bron = 'eraforce_mirror' and not (extern_id = any($2)) and status_bron <> 'beeindigd'`,
    [eigenaar, [...c.ids.keys()]],
  );

  // Activiteiten
  const a = await upsert(
    'bronactiviteiten',
    eigenaar,
    activiteiten.map((x) => ({
      ...herkomst(x),
      type: x.type,
      contact_id: c.ids.get(x.contactExternId) ?? null,
      taak_soort: x.taakSoort,
      vervalt_op: x.vervaltOp,
      vervalt_uur: x.vervaltUur,
      taak_afgerond: x.taakAfgerond,
      auteur: x.auteur,
      tekst: x.tekst,
      soort_label: x.soortLabel ?? null,
      kanaal: x.kanaal ?? null,
    })),
  );
  const aWeg = await db.query(`delete from public.bronactiviteiten where eigenaar_id = $1 and bron = 'eraforce_mirror' and not (extern_id = any($2))`, [eigenaar, [...a.ids.keys()]]);

  // Afspraken
  const af = await upsert(
    'afspraken',
    eigenaar,
    afspraken.map((x) => ({
      ...herkomst(x),
      titel: x.titel,
      start_op: iso(x.start),
      einde_op: iso(x.einde),
      hele_dag: x.heleDag,
      locatie: x.locatie,
      contact_id: x.contactExternId ? (c.ids.get(x.contactExternId) ?? null) : null,
      koppel_status: x.koppelStatus,
      omschrijving: x.omschrijving,
      soort_label: x.soortLabel ?? null,
    })),
  );
  const afWeg = await db.query(`delete from public.afspraken where eigenaar_id = $1 and bron = 'eraforce_mirror' and not (extern_id = any($2))`, [eigenaar, [...af.ids.keys()]]);

  const nieuw = c.nieuw + a.nieuw + af.nieuw;
  const totaal = c.ids.size + a.ids.size + af.ids.size;
  await db.query(`update public.import_runs set status = 'gelukt', beeindigd_op = now(), aantal_nieuw = $2, aantal_gewijzigd = $3, aantal_genegeerd = $4 where id = $1`, [
    runId,
    nieuw,
    totaal - nieuw,
    (weg.rowCount ?? 0) + (aWeg.rowCount ?? 0) + (afWeg.rowCount ?? 0),
  ]);
  await db.query('update public.bronnen set laatst_succesvol_op = now(), laatste_fout = null where id = $1', [bronId]);
  await db.query('commit');
  console.log(
    `Oxpecker bijgewerkt: ${c.ids.size} contacten (${c.nieuw} nieuw, ${weg.rowCount} niet meer bij jou), ${a.ids.size} activiteiten (${a.nieuw} nieuw, ${aWeg.rowCount} weg), ${af.ids.size} afspraken (${af.nieuw} nieuw, ${afWeg.rowCount} weg).`,
  );
} catch (e) {
  await db.query('rollback').catch(() => {});
  // Enkel de foutcode of een korte technische boodschap; geen klantinhoud.
  const fout = e instanceof Error ? e.message.slice(0, 200) : 'onbekende fout';
  console.error(`Import mislukt: ${fout}`);
  process.exitCode = 1;
} finally {
  await db.end();
}
