// WhatsApp: te beantwoorden (7/10/2026, toestemming Jonas). Draait op de Mac elk half uur, 8–20u (ma–za), via
// `mirror.py whatsapp` (launchd be.eraleustoye.oxpecker-whatsapp).
//
//   npx tsx scripts/whatsapp-open.ts [--droog] [--nu]
//
// 1. Leest ALLEEN-LEZEN alle 1-op-1-chats op het zakelijke nummer (geen groepen) van de laatste 30 dagen.
// 2. Open = de klant schreef het laatst, binnen 14 dagen.
// 3. Claude (via het abonnement) schrijft per open chat een antwoord in Jonas' stijl, of zegt dat er geen nodig is.
//    Een ongewijzigde chat wordt niet opnieuw gevraagd.
// 4. Naar Supabase (public.whatsapp_open): per open chat de laatste klantberichten (max. 3, ingekort) en het antwoord.
//    Wat niet meer open is (jij antwoordde), verdwijnt. Logt enkel aantallen, nooit namen of inhoud.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { dagVan } from '../src/core/dates';
import * as m from '../src/core/db/mappers';
import { aanspreekvormVan, detecteerTaal, nummersVan, openKlantberichten } from '../src/adapters/gesprekken/whatsapp';
import { personen, samengevoegd } from '../src/domain/dubbels';
import { taalVan, zegtJe } from '../src/domain/model';
import { CLAUDE_TOKEN, sleutel, vraagClaudeJson, zoekClaude } from './claude';
import { leesRecenteChats, zoekWhatsapp } from './whatsapp-lezen';

const OXPECKER_EMAIL = process.env.OXPECKER_EMAIL ?? 'jonas@eraleustoye.be';
const DB_HOST = process.env.SUPABASE_DB_HOST ?? 'aws-1-eu-central-1.pooler.supabase.com';
const MODEL = process.env.WHATSAPP_MODEL ?? 'sonnet';
const PER_KEER = 5;
const DROOG = process.argv.includes('--droog');
const NU = process.argv.includes('--nu');

const REGELS = `Je helpt Jonas, inkoper bij ERA-vastgoedkantoren in Vlaams-Brabant (ERA Leus & Toye), zijn WhatsApp te beantwoorden.
Je krijgt open chats op zijn zakelijke nummer: de klant schreef het laatst. Schrijf per chat een antwoord dat Jonas kan versturen.

- Schrijf zoals Jonas (uit zijn WhatsApp-historiek): kort en warm, 1–3 zinnen, "Dag <voornaam>," of "Hi <voornaam>,",
  meestal je-vorm (u als aanspreekvorm "u" is of de klant duidelijk formeel schrijft), zelden emoji, ondertekenen met
  "Mvg, Jonas" of "Groetjes, Jonas" (bij een eerste contact "Jonas van ERA"). In het Frans: "Bonjour …, Bav, Jonas";
  in het Engels: "Hi …, Kind regards, Jonas". Antwoord in de taal van de chat.
- Antwoord op wat de klant vraagt of zegt. Verzin NOOIT feiten: geen prijzen, data, uren, beschikbaarheid, afspraken of
  toezeggingen die niet in de chat staan. Vraagt de klant iets wat je niet weet, schrijf dan dat Jonas het nakijkt en
  snel iets laat weten, of stel een korte wedervraag. Stelt de klant een moment voor, bevestig dan niet zelf maar
  schrijf dat Jonas het even checkt (tenzij Jonas het moment eerder in de chat al voorstelde).
- Geen verkooppraat, geen druk, geen URL's. Niets gevoeligs (ziekte, overlijden, scheiding, geld) uitdiepen.
- Is er geen antwoord nodig (bv. "ok", "dank je", een duim, een afsluitende groet of een bericht dat duidelijk geen
  reactie verwacht), zet dan nodig op false en antwoord "".
- Een spraakbericht, foto of document zie je enkel als "[spraakbericht]" enz.: verwijs er kort naar zonder de inhoud te
  raden ("Bedankt voor je bericht, ik luister het zo even" / "Thanks voor de foto's").
- reden: één korte zin voor Jonas (wat de klant wil), zonder namen.

Antwoord met ENKEL een JSON-array, zonder uitleg:
[{"ref":"w1","nodig":true,"antwoord":"…","reden":"…"}]`;

interface Antwoord {
  ref: string;
  nodig?: boolean;
  antwoord?: string;
  reden?: string;
}

const binnenUren = () => {
  const brussel = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Brussels' }));
  return brussel.getDay() !== 0 && brussel.getHours() >= 8 && brussel.getHours() < 20;
};

let db: pg.Client | null = null;
try {
  if (!NU && !DROOG && !binnenUren()) process.exit(0);
  const pad = zoekWhatsapp();
  if (!pad) throw new Error('geen WhatsApp-database op deze Mac gevonden');
  let chats;
  try {
    chats = leesRecenteChats(pad);
  } catch (e) {
    const t = String(e);
    throw new Error(/authorization|not permitted|unable to open|SQLITE_CANTOPEN|SQLITE_AUTH/i.test(t) ? 'geen toegang tot de WhatsApp-database (macOS-toestemming nodig)' : `WhatsApp-database onleesbaar: ${t.slice(0, 80)}`);
  }
  const nu = new Date();
  const open = chats.map((c) => ({ chat: c, klant: openKlantberichten(c.berichten, nu) })).filter((x): x is { chat: typeof x.chat; klant: NonNullable<typeof x.klant> } => x.klant !== null);

  // Supabase: je ERAForce-contacten (naam, taal, aanspreking, laatste gesprekken) en de bestaande rijen.
  const projectRef = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(readFileSync(join(import.meta.dirname, '..', '.env.local'), 'utf8'))?.[1];
  if (!projectRef) throw new Error('Supabase-project niet gevonden in .env.local');
  const wachtwoord = sleutel('Oxpecker import (Supabase)');
  if (!wachtwoord) throw new Error('geen importwachtwoord in de sleutelhanger');
  db = new pg.Client({ host: DB_HOST, port: 5432, user: `oxpecker_import.${projectRef}`, password: wachtwoord, database: 'postgres', ssl: { rejectUnauthorized: false } });
  await db.connect();
  const eigenaar = (await db.query<{ id: string | null }>('select public.import_eigenaar($1) as id', [OXPECKER_EMAIL])).rows[0]?.id;
  if (!eigenaar) throw new Error('Oxpecker-gebruiker niet gevonden');
  const contacten = (await db.query(`select * from public.contacten where eigenaar_id = $1 and bron = 'eraforce_mirror' and not is_testdata`, [eigenaar])).rows.map(m.contactNaarModel);
  const activiteiten = (await db.query(`select * from public.bronactiviteiten where eigenaar_id = $1 and type in ('gesprek', 'notitie') and bron = 'eraforce_mirror'`, [eigenaar])).rows.map(m.activiteitNaarModel);
  const groepen = personen(contacten);
  const contactVan = new Map<string, (typeof contacten)[number]>();
  for (const c of contacten) for (const n of nummersVan(c.telefoons)) if (!contactVan.has(n)) contactVan.set(n, c);
  const bestaand = new Map(
    (
      await db.query<{ nummer: string; invoer_hash: string | null }>('select nummer, invoer_hash from public.whatsapp_open where eigenaar_id = $1', [eigenaar]).catch((e) => {
        if (DROOG) return { rows: [] as { nummer: string; invoer_hash: string | null }[] };
        throw e;
      })
    ).rows.map((r) => [r.nummer, r.invoer_hash]),
  );

  const contexten = open.map(({ chat, klant }, i) => {
    const los = contactVan.get(chat.nummer);
    const c = los ? samengevoegd(los, (groepen.get(los.id) ?? [los]).filter((x) => x.id !== los.id)) : null;
    const ids = new Set((c ? groepen.get(c.id) ?? [c] : []).map((x) => x.id));
    const gesprekken = activiteiten
      .filter((a) => a.contactId && ids.has(a.contactId) && a.gebeurdOp)
      .sort((a, b) => b.gebeurdOp!.getTime() - a.gebeurdOp!.getTime())
      .slice(0, 3)
      .map((a) => ({ dag: dagVan(a.gebeurdOp!), tekst: a.tekst.slice(0, 400) }));
    const eigen = chat.berichten.filter((b) => b.vanMij).map((b) => b.tekst);
    const tekst = {
      ref: `w${i + 1}`,
      naam: c ? [c.voornaam, c.achternaam].filter(Boolean).join(' ') : chat.naam,
      voornaam: c?.voornaam ?? (chat.naam ?? '').split(' ')[0] ?? null,
      gekend_in_eraforce: Boolean(c),
      status_eraforce: c?.statusLabelBron ?? null,
      aanspreekvorm: aanspreekvormVan(eigen) ?? (c && !zegtJe(c) ? 'u' : 'je'),
      taal: detecteerTaal(chat.berichten.map((b) => b.tekst)) ?? (c ? taalVan(c) : null),
      chat: chat.berichten.slice(-12).map((b) => ({ wanneer: b.tijd.toISOString().slice(0, 16), van: b.vanMij ? 'Jonas' : 'klant', tekst: (b.tekst ?? '').slice(0, 500) })),
      laatste_gesprekken_eraforce: gesprekken,
    };
    const hash = createHash('sha256').update(JSON.stringify({ tekst, model: MODEL, versie: 1 })).digest('hex').slice(0, 32);
    return { chat, klant, contact: c, tekst, hash };
  });
  const teDoen = contexten.filter((x) => bestaand.get(x.chat.nummer) !== x.hash);
  console.log(`WhatsApp open: ${chats.length} recente 1-op-1-chats, ${open.length} open, ${teDoen.length} nieuw of gewijzigd.`);
  if (DROOG) {
    if (process.env.WA_TOON === '1') console.log(JSON.stringify(teDoen.slice(0, 1).map((x) => x.tekst), null, 2));
    process.exit(0);
  }

  // Claude
  const claude = teDoen.length ? zoekClaude() : null;
  if (teDoen.length && !claude) throw new Error('claude-programma niet gevonden');
  const token = sleutel(CLAUDE_TOKEN);
  let gemaakt = 0;
  let nietNodig = 0;
  let mislukt = 0;
  for (let i = 0; i < teDoen.length; i += PER_KEER) {
    const groep = teDoen.slice(i, i + PER_KEER);
    let antwoorden: Antwoord[] = [];
    try {
      antwoorden = vraagClaudeJson<Antwoord>(claude!, token, REGELS, { chats: groep.map((x) => x.tekst) }, MODEL);
    } catch (e) {
      mislukt += groep.length;
      console.error(`WhatsApp open: groep mislukt: ${(e instanceof Error ? e.message : 'fout').slice(0, 120)}`);
      continue;
    }
    for (const x of groep) {
      const a = antwoorden.find((y) => y?.ref === x.tekst.ref);
      if (!a) {
        mislukt++;
        continue;
      }
      const nodig = a.nodig !== false && Boolean(a.antwoord?.trim());
      nodig ? gemaakt++ : nietNodig++;
      await db.query(
        `insert into public.whatsapp_open (eigenaar_id, nummer, contact_id, naam, laatste_op, klant_berichten, nodig, antwoord, taal, reden, invoer_hash, afgehandeld_op, bijgewerkt_op)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, null, now())
         on conflict (eigenaar_id, nummer) do update set contact_id = excluded.contact_id, naam = excluded.naam, laatste_op = excluded.laatste_op,
           klant_berichten = excluded.klant_berichten, nodig = excluded.nodig, antwoord = excluded.antwoord, taal = excluded.taal, reden = excluded.reden,
           invoer_hash = excluded.invoer_hash, bijgewerkt_op = now(),
           -- "Niet nodig" blijft gelden tot er een nieuw klantbericht is.
           afgehandeld_op = case when whatsapp_open.laatste_op = excluded.laatste_op then whatsapp_open.afgehandeld_op end`,
        [
          eigenaar,
          x.chat.nummer,
          x.contact?.id ?? null,
          (x.tekst.naam as string | null) ?? null,
          x.klant.at(-1)!.tijd.toISOString(),
          JSON.stringify(x.klant.map((b) => ({ tijd: b.tijd.toISOString(), tekst: (b.tekst ?? '').slice(0, 300) }))),
          nodig,
          nodig ? a.antwoord!.trim().replace(/\s*https?:\/\/\S+/g, '').slice(0, 700) : null,
          x.tekst.taal,
          a.reden?.trim().slice(0, 200) ?? null,
          x.hash,
        ],
      );
    }
  }
  // Niet meer open (jij antwoordde of te oud): weg.
  const weg = await db.query('delete from public.whatsapp_open where eigenaar_id = $1 and not (nummer = any($2))', [eigenaar, open.map((x) => x.chat.nummer)]);
  console.log(`WhatsApp open klaar: ${gemaakt} antwoorden klaar, ${nietNodig} zonder antwoord nodig, ${mislukt} mislukt, ${weg.rowCount ?? 0} beantwoord of verlopen.`);
  if (mislukt > 0 && gemaakt + nietNodig === 0) process.exitCode = 1;
} catch (e) {
  console.error(`WhatsApp open mislukt: ${e instanceof Error ? e.message.slice(0, 200) : 'onbekende fout'}`);
  process.exitCode = 1;
} finally {
  await db?.end();
}
