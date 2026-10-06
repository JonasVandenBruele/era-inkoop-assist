// Hooks maken met Claude (6/10/2026). Draait op de Mac na elke mirror-run (07:00 en 19:00), via mirror.py.
//
//   npx tsx scripts/hooks-maken.ts <pad/naar/mirror.sqlite> [--droog] [--dag JJJJ-MM-DD] [--max 25] [--opnieuw]
//
// 1. Berekent de bellijst met dezelfde domeincode als de app: om 07:00 voor vandaag, om 19:00 voor de volgende werkdag.
// 2. Verzamelt per kandidaat de context: geplande taak, laatste gesprekken, buurtfeiten uit de mirror (ERA-verkopen in
//    de gemeente) en nieuws (Google Nieuws: vastgoed algemeen en per gemeente).
// 3. Vraagt Claude per 5 contacten een hook, openingszin, kanaal en conceptbericht. Claude draait via Jonas' eigen
//    abonnement (`claude -p`, zonder tools), niet via een API-sleutel (besluit Jonas 6/10/2026).
// 4. Schrijft het resultaat naar public.contacthooks als de rol oxpecker_import.
//
// Naar Claude gaan enkel de evaluaties en de context van Jonas' eigen prospects; van andere klanten enkel de straatnaam,
// het type en de maand van een verkoop (geen namen, huisnummers of prijzen). Logt enkel aantallen, nooit inhoud.
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import { dagVan, dagenTussen, uurVan, type DagKey } from '../src/core/dates';
import { leesInstellingen } from '../src/core/settings/schema';
import * as m from '../src/core/db/mappers';
import { isGevoelig } from '../src/domain/haken';
import { berekenBellijst, type Kandidaat } from '../src/domain/prioriteit';
import { isWerkdag, plusWerkdagen } from '../src/domain/werkdagen';
import { heeftTelefoon } from '../src/domain/overzicht';
import type { Contactkanaal } from '../src/domain/model';
import { prospectieblokkenOp } from '../src/domain/prospectieblokken';
import { nummersVan, type WaBericht } from '../src/adapters/gesprekken/whatsapp';
import { leesWhatsapp, zoekWhatsapp } from './whatsapp-lezen';

const OXPECKER_EMAIL = process.env.OXPECKER_EMAIL ?? 'jonas@eraleustoye.be';
const DB_HOST = process.env.SUPABASE_DB_HOST ?? 'aws-1-eu-central-1.pooler.supabase.com';
const SLEUTELHANGER = 'Oxpecker import (Supabase)';
const CLAUDE_TOKEN = 'Oxpecker Claude-token';
const PER_KEER = 5;
const MODEL = process.env.HOOKS_MODEL ?? 'sonnet';
const KANALEN: Contactkanaal[] = ['bellen', 'bericht', 'whatsapp', 'mail', 'flyer', 'brief', 'bezoek'];

const args = process.argv.slice(2);
const optie = (naam: string) => (args.includes(naam) ? args[args.indexOf(naam) + 1] : undefined);
const pad = args.find((a, i) => !a.startsWith('--') && !['--dag', '--max'].includes(args[i - 1] ?? ''));
const DROOG = args.includes('--droog');
const OPNIEUW = args.includes('--opnieuw');
const MAX = Number(optie('--max') ?? 25);
if (!pad) {
  console.error('Gebruik: hooks-maken.ts <mirror.sqlite> [--droog] [--dag JJJJ-MM-DD] [--max 25] [--opnieuw]');
  process.exit(1);
}

// ---------- Claude zoeken ----------

/** Het claude-programma: in PATH, ~/.local/bin, of de versie die de Claude-app meebrengt (nieuwste eerst). */
function zoekClaude(): string | null {
  const kandidaten = [process.env.CLAUDE_PAD, join(homedir(), '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'];
  for (const k of kandidaten) if (k && existsSync(k)) return k;
  const basis = join(homedir(), 'Library/Application Support/Claude/claude-code');
  if (!existsSync(basis)) return null;
  const versies = readdirSync(basis)
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const v of versies) {
    for (const h of readdirSync(join(basis, v))) {
      const p = join(basis, v, h, 'claude.app/Contents/MacOS/claude');
      if (existsSync(p)) return p;
    }
  }
  return null;
}

function sleutel(dienst: string): string | null {
  try {
    return execFileSync('security', ['find-generic-password', '-s', dienst, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

// ---------- Nieuws (Google Nieuws RSS) ----------

interface Nieuws {
  titel: string;
  bron: string | null;
  dag: DagKey | null;
  url: string;
}

const ALGEMEEN = ['registratierechten woning', 'renovatieplicht woning', 'EPC verkoop woning', 'woonkrediet rente', 'vastgoedmarkt Vlaanderen', 'erfbelasting woning'];

const ontsnap = (t: string) => t.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

async function nieuws(zoek: string, max: number, dagen: number): Promise<Nieuws[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${zoek} when:${dagen}d`)}&hl=nl&gl=BE&ceid=BE:nl`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0 Oxpecker' } });
    if (!r.ok) return [];
    const xml = await r.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, max).map(([, item]) => {
      const veld = (n: string) => (new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`).exec(item!)?.[1] ?? '');
      const datum = new Date(veld('pubDate'));
      return { titel: ontsnap(veld('title')), bron: ontsnap(veld('source')) || null, dag: Number.isNaN(datum.getTime()) ? null : dagVan(datum), url: ontsnap(veld('link')) };
    });
  } catch {
    return [];
  }
}

// ---------- Buurtfeiten uit de mirror ----------

interface Buurtfeit {
  soort: 'verkocht' | 'te koop';
  straat: string;
  type: string | null;
  maand: string | null; // "2026-08"
}

/** ERA-verkopen (laatste 12 maanden) en panden die nu te koop staan, per gemeente. Zonder huisnummer, naam of prijs. */
function leesBuurt(mirrorPad: string): Map<string, Buurtfeit[]> {
  const db = new DatabaseSync(mirrorPad, { readOnly: true });
  const rijen = db
    .prepare(
      `select b.Id as object, o.StageName as fase, coalesce(o.ERA_Datum_Ondertekening_VK_OV__c, o.CloseDate) as verkocht, o.ERA_Datum_Op_de_markt__c as markt,
              b.ERA_Straat__c as straat, b.ERA_Gemeente__c as gemeente, coalesce(b.ERA_Object_Type__c, o.ERA_Object_Type__c) as type
       from Opportunity o join ERA_Object__c b on b.Id = o.ERA_Object__c
       where o._verwijderd = 0 and b._verwijderd = 0
         and ((o.StageName in ('Verkocht', 'Verkocht OV') and coalesce(o.ERA_Datum_Ondertekening_VK_OV__c, o.CloseDate) >= date('now', '-12 months'))
           or o.StageName in ('Actief - In Verkoop', 'Onderhandeling'))`,
    )
    .all() as Record<string, string | null>[];
  db.close();
  const uit = new Map<string, Buurtfeit[]>();
  const gezien = new Set<string>();
  for (const r of rijen) {
    // Eén pand met meerdere dossiers (bv. "Verkocht OV" en daarna "Verkocht") telt één keer.
    const sleutel = `${r.object}:${r.fase === 'Verkocht' || r.fase === 'Verkocht OV' ? 'v' : 't'}`;
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    const gemeente = (r.gemeente ?? '').trim().toLowerCase();
    const straat = (r.straat ?? '').replace(/\s+\d.*$/, '').trim();
    if (!gemeente || !straat) continue;
    const verkocht = r.fase === 'Verkocht' || r.fase === 'Verkocht OV';
    const datum = verkocht ? r.verkocht : r.markt;
    const lijst = uit.get(gemeente) ?? [];
    lijst.push({ soort: verkocht ? 'verkocht' : 'te koop', straat, type: r.type ?? null, maand: datum ? datum.slice(0, 7) : null });
    uit.set(gemeente, lijst);
  }
  return uit;
}

const straatnaam = (s: string | null) => (s ?? '').replace(/\s+\d.*$/, '').trim().toLowerCase();

// ---------- Context per contact ----------

interface Context {
  ref: string;
  kandidaat: Kandidaat;
  tekst: Record<string, unknown>;
  links: Set<string>;
  hash: string;
}

function maakContext(
  ref: string,
  k: Kandidaat,
  gegevens: Awaited<ReturnType<typeof laad>>,
  buurt: Map<string, Buurtfeit[]>,
  lokaal: Map<string, Nieuws[]>,
  algemeen: Nieuws[],
  dag: DagKey,
  whatsapp: WaBericht[],
): Context {
  const c = k.contact;
  const veldwerk = prospectieblokkenOp(gegevens.afspraken, dag).length > 0;
  const gesprekken = gegevens.activiteiten
    .filter((a) => a.contactId === c.id && (a.type === 'gesprek' || a.type === 'notitie') && a.gebeurdOp)
    // Lege items ("invite .", enkel een onderwerp) tellen niet mee; zo blijven oudere, inhoudelijke gesprekken zichtbaar.
    .filter((a) => a.tekst.split(/\s+/).filter((w) => /\p{L}{2,}/u.test(w)).length >= 5)
    .sort((a, b) => b.gebeurdOp!.getTime() - a.gebeurdOp!.getTime())
    .slice(0, 5)
    .map((a) => ({ dag: dagVan(a.gebeurdOp!), tekst: a.tekst.slice(0, 700) }));
  const notities = gegevens.belpogingen
    .filter((p) => p.contactId === c.id && !p.ongedaanOp && p.notitie)
    .sort((a, b) => b.tijdstip.getTime() - a.tijdstip.getTime())
    .slice(0, 2)
    .map((p) => ({ dag: dagVan(p.tijdstip), kanaal: p.kanaal ?? 'telefoon', uitkomst: p.uitkomst, notitie: p.notitie!.slice(0, 300) }));
  const gemeente = (c.gemeente ?? '').trim().toLowerCase();
  const feiten = buurt.get(gemeente) ?? [];
  const zelfdeStraat = feiten.filter((f) => f.straat.toLowerCase() === straatnaam(c.straat));
  const verkocht = feiten.filter((f) => f.soort === 'verkocht');
  const nieuwsLokaal = lokaal.get(gemeente) ?? [];
  const links = new Set([...algemeen, ...nieuwsLokaal].map((n) => n.url));
  const tekst = {
    ref,
    naam: [c.aanhef, c.voornaam, c.achternaam].filter(Boolean).join(' '),
    aanspreekvorm: c.aanspreekvormBron ?? 'u',
    status: c.statusLabelBron ?? c.statusBron,
    langetermijn: c.statusBron === 'langetermijn',
    herkomst: c.herkomstContact,
    klant_sinds: c.aangemaaktInBronOp ? dagVan(c.aangemaaktInBronOp) : null,
    woont_in: c.gemeente,
    straat: c.straat ? straatnaam(c.straat) : null,
    waarom_vandaag: k.reden,
    geplande_taak: k.terugbel ? { dag: k.terugbel.dag, onderwerp: (k.terugbel.tekst ?? '').split('\n')[0]!.slice(0, 200), kanaal: k.terugbel.kanaal } : null,
    laatste_gesprekken: gesprekken,
    eigen_notities_in_app: notities,
    // Laatste WhatsApp-berichten van je zakelijke nummer: enkel lokaal gelezen en enkel hier naar Claude
    // (toestemming Jonas 6/10/2026). Ze gaan nooit naar Supabase.
    whatsapp_laatste_berichten: whatsapp
      .filter((b) => b.tekst && b.tekst.trim())
      .slice(-8)
      .map((b) => ({ dag: dagVan(b.tijd), van: b.vanMij ? 'Jonas' : 'klant', tekst: b.tekst!.slice(0, 300) })),
    pogingen_zonder_antwoord: k.pogingenZonderAntwoord,
    // Langsgaan en flyers enkel op een dag met een Baanprospectie-blok in de agenda (Jonas, 6/10/2026).
    baanprospectie_blok_op_dag: veldwerk,
    kanalen_mogelijk: KANALEN.filter((x) =>
      x === 'bellen'
        ? heeftTelefoon(c)
        : x === 'bericht' || x === 'whatsapp'
          ? c.telefoons.some((t) => t.label === 'gsm')
          : x === 'mail'
            ? Boolean(c.email)
            : x === 'brief'
              ? Boolean(c.straat && c.gemeente)
              : Boolean(c.straat && c.gemeente) && (veldwerk || k.terugbel?.kanaal === x),
    ),
    buurt: {
      era_verkocht_in_gemeente_12_maanden: verkocht.length,
      zelfde_straat: zelfdeStraat.slice(0, 3),
      // Laatste 3 maanden, nieuwste eerst.
      recent_verkocht: verkocht
        .filter((f) => f.maand && dagenTussen(`${f.maand}-15`, dag) <= 100)
        .sort((a, b) => b.maand!.localeCompare(a.maand!))
        .slice(0, 3),
    },
    lokaal_nieuws: nieuwsLokaal.map((n) => ({ titel: n.titel, bron: n.bron, dag: n.dag, url: n.url })),
  };
  // De vingerafdruk gebruikt de inhoud zonder het algemene nieuws, zodat een nieuw krantenartikel niet alles opnieuw laat maken.
  const hash = createHash('sha256').update(JSON.stringify({ tekst, model: MODEL, versie: 4 })).digest('hex').slice(0, 32);
  return { ref, kandidaat: k, tekst, links, hash };
}

// ---------- Claude ----------

const REGELS = `Je helpt Jonas, inkoper (prospectie van verkopers) bij ERA-vastgoedkantoren in Vlaams-Brabant, om zijn prospects te contacteren.
Voor elk contact maak je één HOOK: een concreet, herleidbaar aanknopingspunt waarom Jonas vandaag contact opneemt.

Werkwijze ("ossenpikker"): altijd aanwezig, nooit opdringerig. De hook levert de klant iets op (nuttige info, een antwoord op wat hij zelf zei).
- Gebruik ENKEL de aangeleverde feiten. Verzin niets: geen cijfers, data, wetten, verkopen of nieuws die niet in de invoer staan.
- Vertrek bij voorkeur van wat de klant zelf zei in de laatste gesprekken of WhatsApp-berichten, of van het onderwerp van de geplande taak
  (bv. "wil via Biddit verkopen in oktober" → vraag of de Biddit-verkoop gestart is). Een algemene zin als
  "we hadden afgesproken dat ik u zou terugbellen" is VERBODEN.
- Voor langetermijnprospects zonder concrete aanleiding: een buurtfeit (ERA-verkoop in de straat of gemeente) of een
  relevant nieuwsbericht uit de invoer (algemeen vastgoednieuws of lokaal nieuws), met de link als bron.
- Niets gevoeligs: geen overlijden, ziekte, scheiding, schulden, financiële problemen, ook al staat het in de notities.
  Persoonlijke info gebruik je hoogstens als stille achtergrond, nooit in de openingszin of het bericht.
- Noem nooit namen, huisnummers of prijzen van andere klanten.
- Schrijf zoals Jonas zelf schrijft (uit zijn WhatsApp-historiek, 6/10/2026): kort en warm, ±1–3 zinnen.
  Begin met "Dag <voornaam>," of "Hi <voornaam>," (bijna altijd de voornaam, meestal je-vorm; u enkel als aanspreekvorm
  "u" is of iemand duidelijk formeel is). Verwijs concreet naar wat de klant de vorige keer vertelde ("Laatste keer
  vertelde je me dat …, is dat ondertussen …?"), en sluit af met een hulpaanbod ("Kan ik nog ergens bij helpen?").
  Ondertekenen met "Mvg, Jonas van ERA", "Fijne avond, Jonas van ERA" of "Groetjes, Jonas". Geen emoji, geen
  verkooppraat, geen druk.
- Taal: in de taal van de eerdere gesprekken of WhatsApp-berichten (Nederlands, Frans of Engels). In het Frans:
  "Bonjour <voornaam>, … Bav, Jonas de ERA"; in het Engels: "Hi <first name>, Jonas from ERA here. …".
- Vlaams Nederlands, spreektaal maar beleefd. Jonas werkt bij ERA.
- Kanaal: kies uit kanalen_mogelijk. Langsgaan (bezoek) en flyer kan enkel tijdens een Baanprospectie-blok; daarom staan
  ze enkel in kanalen_mogelijk op zo'n dag. Respecteer het kanaal van de geplande taak (bv. bezoek bij "langsgaan met flyer").
  Antwoordde de klant onlangs via WhatsApp, dan ligt WhatsApp voor de hand. Herhaal geen vraag die al in WhatsApp
  beantwoord werd, en citeer nooit letterlijk uit een WhatsApp-bericht van de klant.
  Na meerdere pogingen zonder antwoord of als de notities zeggen dat iemand moeilijk telefonisch bereikbaar is:
  WhatsApp, bericht, brief, flyer of langsgaan. Langetermijn met informatieve hook: liefst iets rustig te lezen.
- openingszin: wat Jonas zegt als iemand opneemt of de deur opendoet (max 2 zinnen, begin met "Goeiedag" of de naam,
  "met Jonas van ERA", eindig met een korte vraag). Ook hier: de taal van de klant. Leeg ("") als het kanaal geen gesprek is (brief, flyer).
- conceptbericht: enkel bij bericht, whatsapp, mail, brief of flyer: een kort voorstel in Jonas' stijl (WhatsApp/bericht
  max ±300 tekens, mail of brief mag langer, max 500). Anders "".
- Zet NOOIT een URL in de openingszin of het conceptbericht; noem de bron bij naam (bv. "volgens VRT"). De app toont de link apart.
- Spreek altijd aan met de naam (meneer/mevrouw + achternaam, of de voornaam bij "je").
- Lokaal nieuws gebruik je enkel als het over wonen, bouwen, verkavelingen, ruimtelijke plannen, mobiliteit of
  voorzieningen in hun buurt gaat. Algemene dorpsverhalen, sport of human interest zijn geen hook.
- bronnen: enkel URL's die letterlijk in de invoer staan en die je gebruikt; anders [].
- Is er echt geen bruikbaar aanknopingspunt, geef dan onderwerp "" (dan toont de app het aanknopingspunt uit de taak).

Antwoord met ENKEL een JSON-array, zonder uitleg, één object per contact:
[{"ref":"c1","onderwerp":"max 80 tekens","detail":"1-2 zinnen voor Jonas: waarom en waarover","openingszin":"…","kanaal":"bellen|bericht|whatsapp|mail|flyer|brief|bezoek","kanaal_reden":"korte reden","conceptbericht":"…","bronnen":["https://…"]}]`;

interface Antwoord {
  ref: string;
  onderwerp: string;
  detail?: string;
  openingszin?: string;
  kanaal?: string;
  kanaal_reden?: string;
  conceptbericht?: string;
  bronnen?: string[];
}

function vraagClaude(claude: string, token: string | null, contexten: Context[], algemeen: Nieuws[], dag: DagKey): Antwoord[] {
  const invoer = { dag, algemeen_vastgoednieuws: algemeen.map((n) => ({ titel: n.titel, bron: n.bron, dag: n.dag, url: n.url })), contacten: contexten.map((c) => c.tekst) };
  const map = mkdtempSync(join(tmpdir(), 'oxpecker-hooks-'));
  try {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY; // altijd via het abonnement, nooit een API-sleutel
    if (token) env.CLAUDE_CODE_OAUTH_TOKEN = token;
    const r = spawnSync(
      claude,
      ['-p', '--output-format', 'json', '--tools', '', '--model', MODEL, '--no-session-persistence', '--setting-sources', '', '--strict-mcp-config', '--system-prompt', REGELS],
      { input: JSON.stringify(invoer), encoding: 'utf8', cwd: map, env, timeout: 300_000, maxBuffer: 20 * 1024 * 1024 },
    );
    if (r.error) throw new Error(`claude start niet (${r.error.message.slice(0, 80)})`);
    let uit: { is_error?: boolean; result?: string; terminal_reason?: string };
    try {
      uit = JSON.parse(r.stdout);
    } catch {
      throw new Error(`claude gaf geen JSON (code ${r.status})`);
    }
    if (uit.is_error) throw new Error(/log ?in/i.test(uit.result ?? '') ? 'claude is niet aangemeld' : `claude-fout (${uit.terminal_reason ?? 'onbekend'})`);
    const tekst = uit.result ?? '';
    const json = tekst.slice(tekst.indexOf('['), tekst.lastIndexOf(']') + 1);
    const lijst = JSON.parse(json) as Antwoord[];
    return Array.isArray(lijst) ? lijst : [];
  } finally {
    rmSync(map, { recursive: true, force: true });
  }
}

/** Controle achteraf: geen verzonnen links, geen gevoelige inhoud, geldige kanalen, redelijke lengtes. */
function controleer(a: Antwoord, ctx: Context, algemeen: Nieuws[]) {
  const t = (s: unknown, max: number) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, max) : null);
  const onderwerp = t(a.onderwerp, 120);
  if (!onderwerp) return null;
  const alles = [onderwerp, a.detail, a.openingszin, a.conceptbericht].filter(Boolean).join(' ');
  if (isGevoelig(alles) || /zou terugbellen|hadden afgesproken/i.test(a.openingszin ?? '')) return null;
  const toegelaten = new Map([...algemeen, ...((ctx.tekst.lokaal_nieuws as Nieuws[]) ?? [])].map((n) => [n.url, n.titel]));
  const mogelijk = ctx.tekst.kanalen_mogelijk as Contactkanaal[];
  const kanaal = KANALEN.includes(a.kanaal as Contactkanaal) && mogelijk.includes(a.kanaal as Contactkanaal) ? (a.kanaal as Contactkanaal) : null;
  return {
    onderwerp,
    detail: t(a.detail, 400),
    openingszin: t(a.openingszin?.replace(/\s*https?:\/\/\S+/g, ''), 400),
    kanaal,
    kanaal_reden: kanaal ? t(a.kanaal_reden, 200) : null,
    conceptbericht: t(a.conceptbericht?.replace(/\s*https?:\/\/\S+/g, '').replace(/\s+([.,;:!?])/g, '$1'), 700),
    bronlinks: (a.bronnen ?? []).filter((u) => toegelaten.has(u)).slice(0, 3).map((url) => ({ titel: toegelaten.get(url)!, url })),
  };
}

// ---------- Supabase ----------

async function verbind() {
  const projectRef = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(readFileSync(join(import.meta.dirname, '..', '.env.local'), 'utf8'))?.[1];
  if (!projectRef) throw new Error('Supabase-project niet gevonden in .env.local.');
  const wachtwoord = sleutel(SLEUTELHANGER);
  if (!wachtwoord) throw new Error('geen importwachtwoord in de sleutelhanger');
  // Net na een wachtwoordwijziging weigert de pooler het wachtwoord soms even: dan nog twee keer proberen.
  const maakClient = () => new pg.Client({ host: DB_HOST, port: 5432, user: `oxpecker_import.${projectRef}`, password: wachtwoord, database: 'postgres', ssl: { rejectUnauthorized: false } });
  let db = maakClient();
  for (let poging = 1; ; poging++) {
    try {
      await db.connect();
      break;
    } catch (e) {
      if (poging >= 3 || !/password authentication failed/i.test(String(e))) throw e;
      console.log(`Aanmelden geweigerd; nieuwe poging over 60 s (${poging}/2).`);
      await new Promise((r) => setTimeout(r, 60_000));
      db = maakClient();
    }
  }
  return db;
}

async function laad(db: pg.Client, eigenaar: string) {
  // Na elkaar (één verbinding). Je eigen resultaten zijn optioneel: zonder leesrecht (oude migratie) rekenen we zonder.
  const rijen = async (tabel: string, optioneel = false) => {
    try {
      return (await db.query<Record<string, unknown>>(`select * from public.${tabel} where eigenaar_id = $1`, [eigenaar])).rows;
    } catch (e) {
      if (optioneel && /permission denied/i.test(String(e))) return [];
      throw e;
    }
  };
  const contacten = await rijen('contacten');
  const activiteiten = await rijen('bronactiviteiten');
  const afspraken = await rijen('afspraken');
  const [belpogingen, opvolgacties, keuzes, belverboden, haken, voorkeuren, inst] = [
    await rijen('belpogingen', true),
    await rijen('opvolgacties', true),
    await rijen('planningskeuzes', true),
    await rijen('belverboden', true),
    await rijen('waardehaken', true),
    await rijen('contactvoorkeuren', true),
    await rijen('instellingen', true),
  ];
  return {
    contacten: contacten!.map(m.contactNaarModel).filter((c) => c.bron === 'eraforce_mirror' && !c.isTestdata),
    activiteiten: activiteiten!.map(m.activiteitNaarModel),
    afspraken: afspraken!.map(m.afspraakNaarModel),
    belpogingen: belpogingen!.map(m.belpogingNaarModel),
    opvolgacties: opvolgacties!.map(m.opvolgactieNaarModel),
    keuzes: keuzes!.map(m.keuzeNaarModel),
    belverboden: belverboden!.map(m.belverbodNaarModel),
    haken: haken!.map(m.haakNaarModel),
    voorkeuren: voorkeuren!.map(m.voorkeurNaarModel),
    instellingen: leesInstellingen(inst![0]?.document),
  };
}

// ---------- Hoofdprogramma ----------

const nu = new Date();
const vandaag = dagVan(nu);
// 's Morgens voor vandaag, 's avonds voor de volgende werkdag.
const dag: DagKey = optie('--dag') ?? (uurVan(nu) < '12:00' && isWerkdag(vandaag) ? vandaag : plusWerkdagen(vandaag, 1));

let db: pg.Client | null = null;
try {
  const claude = zoekClaude();
  if (!claude && !DROOG) throw new Error('claude-programma niet gevonden');
  const token = sleutel(CLAUDE_TOKEN);

  db = await verbind();
  const eigenaar = (await db.query<{ id: string | null }>('select public.import_eigenaar($1) as id', [OXPECKER_EMAIL])).rows[0]?.id;
  if (!eigenaar) throw new Error('Oxpecker-gebruiker niet gevonden');
  const gegevens = await laad(db, eigenaar);

  const lijst = berekenBellijst({ ...gegevens, instellingen: gegevens.instellingen, vandaag: dag, uur: '09:00' });
  const kandidaten = [...lijst.vandaag, ...lijst.nietOpLijst, ...lijst.handmatigBeoordelen].slice(0, MAX);

  // Bestaande hooks voor die dag: ongewijzigde context = niet opnieuw vragen.
  const bestaand = new Map<string, string | null>();
  try {
    const r = await db.query<{ contact_id: string; invoer_hash: string | null }>('select contact_id, invoer_hash from public.contacthooks where eigenaar_id = $1 and dag = $2', [eigenaar, dag]);
    for (const x of r.rows) bestaand.set(x.contact_id, x.invoer_hash);
  } catch (e) {
    if (!DROOG) throw new Error(`tabel contacthooks niet bruikbaar (${String(e).slice(0, 80)})`);
  }

  const buurt = leesBuurt(pad);
  const algemeen = (await Promise.all(ALGEMEEN.map((z) => nieuws(z, 2, 30)))).flat().filter((n, i, xs) => xs.findIndex((x) => x.titel === n.titel) === i).slice(0, 8);
  const gemeenten = [...new Set(kandidaten.map((k) => (k.contact.gemeente ?? '').trim()).filter(Boolean))];
  const lokaal = new Map<string, Nieuws[]>();
  for (const g of gemeenten) {
    lokaal.set(g.toLowerCase(), await nieuws(`"${g}" (woning OR wonen OR bouwproject OR verkaveling OR gemeente)`, 3, 21));
  }

  // WhatsApp van de Mac: enkel de chats met de nummers van deze kandidaten. Lukt het niet, dan zonder.
  const waPerContact = new Map<string, WaBericht[]>();
  const waPad = zoekWhatsapp();
  if (waPad) {
    try {
      const nummers = new Map(kandidaten.map((k) => [k.contact.id, nummersVan(k.contact.telefoons)]));
      const lezing = leesWhatsapp(waPad, new Set([...nummers.values()].flat()), 365);
      for (const [id, ns] of nummers) waPerContact.set(id, ns.flatMap((n) => lezing.berichten.get(n) ?? []).sort((a, b) => a.tijd.getTime() - b.tijd.getTime()));
    } catch {
      console.log('Hooks: WhatsApp niet leesbaar; verder zonder.');
    }
  }
  const contexten = kandidaten.map((k, i) => maakContext(`c${i + 1}`, k, gegevens, buurt, lokaal, algemeen, dag, waPerContact.get(k.contact.id) ?? []));
  const metWa = [...waPerContact.values()].filter((b) => b.length > 0).length;
  const teDoen = contexten.filter((c) => OPNIEUW || bestaand.get(c.kandidaat.contact.id) !== c.hash);
  console.log(`Hooks: ${kandidaten.length} kandidaten voor ${dag}, ${teDoen.length} te maken (${contexten.length - teDoen.length} ongewijzigd), nieuws: ${algemeen.length} algemeen, ${gemeenten.length} gemeenten, WhatsApp bij ${metWa}.`);
  if (DROOG) {
    if (process.env.HOOKS_TOON === '1') console.log(JSON.stringify(teDoen.slice(0, 2).map((c) => c.tekst), null, 2));
    process.exit(0);
  }

  let gemaakt = 0;
  let leeg = 0;
  let mislukt = 0;
  for (let i = 0; i < teDoen.length; i += PER_KEER) {
    const groep = teDoen.slice(i, i + PER_KEER);
    let antwoorden: Antwoord[];
    try {
      antwoorden = vraagClaude(claude!, token, groep, algemeen, dag);
    } catch (e) {
      const fout = e instanceof Error ? e.message : 'onbekende fout';
      mislukt += groep.length;
      console.error(`Hooks: groep mislukt: ${fout.slice(0, 120)}`);
      if (/niet aangemeld|niet gevonden/.test(fout)) break;
      continue;
    }
    for (const ctx of groep) {
      const a = antwoorden.find((x) => x?.ref === ctx.ref);
      const h = a ? controleer(a, ctx, algemeen) : null;
      if (!h) {
        leeg++;
        // Geen bruikbare hook: een oude hook voor die dag weghalen, dan toont de app het aanknopingspunt.
        await db.query('delete from public.contacthooks where eigenaar_id = $1 and contact_id = $2 and dag = $3', [eigenaar, ctx.kandidaat.contact.id, dag]);
        continue;
      }
      await db.query(
        `insert into public.contacthooks (eigenaar_id, contact_id, dag, onderwerp, detail, openingszin, kanaal, kanaal_reden, conceptbericht, bronlinks, model, invoer_hash)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
         on conflict (eigenaar_id, contact_id, dag) do update set onderwerp = excluded.onderwerp, detail = excluded.detail, openingszin = excluded.openingszin,
           kanaal = excluded.kanaal, kanaal_reden = excluded.kanaal_reden, conceptbericht = excluded.conceptbericht, bronlinks = excluded.bronlinks,
           model = excluded.model, invoer_hash = excluded.invoer_hash, aangemaakt_op = now()`,
        [eigenaar, ctx.kandidaat.contact.id, dag, h.onderwerp, h.detail, h.openingszin, h.kanaal, h.kanaal_reden, h.conceptbericht, JSON.stringify(h.bronlinks), MODEL, ctx.hash],
      );
      gemaakt++;
    }
  }
  const opgeruimd = await db.query(`delete from public.contacthooks where eigenaar_id = $1 and dag < $2`, [eigenaar, dagVan(new Date(nu.getTime() - 30 * 86400000))]);
  console.log(`Hooks klaar: ${gemaakt} gemaakt, ${leeg} zonder bruikbare hook, ${mislukt} mislukt, ${opgeruimd.rowCount ?? 0} oude opgeruimd.`);
  if (mislukt > 0 && gemaakt === 0) process.exitCode = 1;
} catch (e) {
  const fout = e instanceof Error ? e.message.slice(0, 200) : 'onbekende fout';
  console.error(`Hooks mislukt: ${fout}`);
  process.exitCode = 1;
} finally {
  await db?.end();
}
