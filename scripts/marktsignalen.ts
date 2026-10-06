// Te koop gezet (6/10/2026): staat de woning van een prospect te koop — zelf of via een andere makelaar?
// Draait op de Mac na elke mirror-run (07:00 en 19:00), via mirror.py, vóór de hooks.
//
//   npx tsx scripts/marktsignalen.ts <pad/naar/mirror.sqlite> [--droog] [--zonder-immoweb]
//
// Bronnen:
//  1. Marketpulse-prospects in de mirror (alle eigenaars): Marketpulse zet nieuwe Immoweb/Zimmo-zoekertjes als lead in
//     ERAForce, met "Particulier", "Concurrent Makelaar (…)" of "Notaris". Soms zonder straat (adres verborgen).
//  2. Immoweb zelf: de zoekresultaten "huis en appartement te koop" per postcode waar Jonas contacten heeft. Beleefd:
//     robots.txt, minstens 3 s tussen aanvragen, een eerlijke naam (Oxpecker-marktsignalen/1.0). Een blokkade of captcha
//     wordt nooit omzeild: dan stopt het Immoweb-deel en blijven de vorige signalen staan.
// Koppeling op het genormaliseerde adres (src/domain/adres.ts): straat (afkortingen voluit, officiële straatnaam uit het
// Vlaamse Adressenregister), huisnummer, bus en POSTCODE — de gemeentenaam telt niet.
// Schrijft public.marktsignalen als de rol oxpecker_import. Logt enkel aantallen, nooit namen of adressen.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import { adresSleutel, gebouwSleutel, normBus, officieleStraat, splitsStraatregel, vergelijkAdres, type AdresDelen } from '../src/domain/adres';

const OXPECKER_EMAIL = process.env.OXPECKER_EMAIL ?? 'jonas@eraleustoye.be';
const DB_HOST = process.env.SUPABASE_DB_HOST ?? 'aws-1-eu-central-1.pooler.supabase.com';
const SLEUTELHANGER = 'Oxpecker import (Supabase)';
const USER_AGENT = 'Oxpecker-marktsignalen/1.0 (+https://jonasvandenbruele.github.io/era-inkoop-assist/)';
const CACHE = join(homedir(), '.oxpecker');
/** Een advertentie die langer online staat, is geen nieuws meer: enkel bewaren als historiek (geen bericht). */
const VERS_DAGEN = 30;
/** Marketpulse-prospects van de laatste … dagen. */
const MARKETPULSE_DAGEN = 120;
const MAX_PAGINAS = 20;

const args = process.argv.slice(2);
const pad = args.find((a) => !a.startsWith('--'));
const DROOG = args.includes('--droog');
const ZONDER_IMMOWEB = args.includes('--zonder-immoweb');
if (!pad) {
  console.error('Gebruik: marktsignalen.ts <mirror.sqlite> [--droog] [--zonder-immoweb]');
  process.exit(1);
}

// ---------- Beleefd ophalen ----------

const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));
const laatste = new Map<string, number>();
const robots = new Map<string, RegExp[]>();

class Geblokkeerd extends Error {}

async function haal(url: string, { gap = 3000, json = false } = {}): Promise<{ status: number; tekst: string; url: string }> {
  const u = new URL(url);
  const nu = Date.now();
  const vorige = laatste.get(u.host) ?? 0;
  if (nu - vorige < gap) await wacht(gap - (nu - vorige));
  laatste.set(u.host, Date.now());
  for (let poging = 0; ; poging++) {
    try {
      const r = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, 'accept-language': 'nl-BE,nl;q=0.9', accept: json ? 'application/json' : 'text/html,application/xhtml+xml' },
        signal: AbortSignal.timeout(25_000),
        redirect: 'follow',
      });
      const tekst = await r.text();
      return { status: r.status, tekst, url: r.url };
    } catch (e) {
      if (poging >= 2) throw e;
      await wacht(4000 * (poging + 1));
    }
  }
}

/** robots.txt (User-agent: *): Disallow-regels met * en $. */
async function toegelaten(url: string): Promise<boolean> {
  const u = new URL(url);
  if (!robots.has(u.origin)) {
    const regels: RegExp[] = [];
    try {
      const r = await haal(`${u.origin}/robots.txt`, { gap: 0 });
      let voorIedereen = false;
      for (const lijn of r.tekst.split(/\r?\n/)) {
        const [k, ...rest] = lijn.split(':');
        const v = rest.join(':').trim();
        if (/^user-agent$/i.test(k!.trim())) voorIedereen = v === '*';
        else if (voorIedereen && /^disallow$/i.test(k!.trim()) && v) {
          regels.push(new RegExp(`^${v.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`));
        }
      }
    } catch {
      /* geen robots.txt: alles toegestaan */
    }
    robots.set(u.origin, regels);
  }
  const pad = u.pathname + u.search;
  return !robots.get(u.origin)!.some((r) => r.test(pad));
}

const lijktGeblokkeerd = (status: number, tekst: string) =>
  status === 403 || status === 429 || /captcha-delivery|geo\.captcha|datadome/i.test(tekst.slice(0, 20000));

// ---------- Officiële straatnamen (Adressenregister, open data) ----------

/** Straatnamen van de gemeente van een Vlaamse postcode; 30 dagen gecachet in ~/.oxpecker/straatnamen. */
async function straatnamen(postcode: string): Promise<string[]> {
  const n = Number(postcode);
  const vlaams = (n >= 1500 && n <= 3999) || (n >= 8000 && n <= 9999);
  if (!vlaams) return [];
  const map = join(CACHE, 'straatnamen');
  const bestand = join(map, `${postcode}.json`);
  if (existsSync(bestand) && Date.now() - statSync(bestand).mtimeMs < 30 * 86400000) return JSON.parse(readFileSync(bestand, 'utf8')) as string[];
  try {
    const info = JSON.parse((await haal(`https://api.basisregisters.vlaanderen.be/v2/postinfo/${postcode}`, { gap: 300, json: true })).tekst);
    const gemeente = info?.gemeente?.gemeentenaam?.geografischeNaam?.spelling as string | undefined;
    if (!gemeente) return [];
    const namen: string[] = [];
    for (let offset = 0; offset < 5000; offset += 500) {
      const r = JSON.parse(
        (await haal(`https://api.basisregisters.vlaanderen.be/v2/straatnamen?gemeentenaam=${encodeURIComponent(gemeente)}&limit=500&offset=${offset}`, { gap: 300, json: true })).tekst,
      );
      const deel = (r?.straatnamen ?? []) as { straatnaam?: { geografischeNaam?: { spelling?: string } }; straatnaamStatus?: string }[];
      namen.push(...deel.filter((s) => s.straatnaamStatus !== 'gehistoreerd').map((s) => s.straatnaam?.geografischeNaam?.spelling).filter((s): s is string => Boolean(s)));
      if (deel.length < 500) break;
    }
    mkdirSync(map, { recursive: true });
    writeFileSync(bestand, JSON.stringify(namen));
    return namen;
  } catch {
    return [];
  }
}

// ---------- Contacten en adressen ----------

interface ContactAdres {
  id: string;
  externId: string | null;
  adres: AdresDelen;
  /** Zelfde adres met de officiële straatnaam (als die anders geschreven is). */
  officieel: AdresDelen | null;
  /** Komt de prospect zelf uit een advertentie (Marketpulse)? Dan is die advertentie geen nieuws. */
  eigen: { immowebId: string | null; markt: string | null } | null;
  status: string;
}

interface Advertentie {
  bron: 'immoweb' | 'marketpulse';
  externId: string;
  /** Lead-ID van de Marketpulse-prospect (niet koppelen aan die lead zelf). */
  leadId?: string;
  adres: AdresDelen;
  verkoper: 'particulier' | 'makelaar' | 'notaris' | null;
  makelaar: string | null;
  vraagprijs: number | null;
  onlineSinds: string | null;
  url: string | null;
  status: 'te_koop' | 'onder_optie' | 'verkocht' | 'weg';
}

function maakIndex(contacten: ContactAdres[]) {
  const index = new Map<string, ContactAdres[]>();
  for (const c of contacten) {
    for (const a of [c.adres, c.officieel]) {
      const k = a && gebouwSleutel(a);
      if (!k) continue;
      const lijst = index.get(k) ?? [];
      if (!lijst.includes(c)) lijst.push(c);
      index.set(k, lijst);
    }
  }
  return index;
}

/** Contacten op het adres van een advertentie: 'adres' (zelfde woning) of 'gebouw' (andere bus). */
function zoek(index: Map<string, ContactAdres[]>, a: AdresDelen, officieel: AdresDelen | null) {
  const uit = new Map<string, { contact: ContactAdres; overeenkomst: 'adres' | 'gebouw' }>();
  for (const x of [a, officieel]) {
    const k = x && gebouwSleutel(x);
    if (!k) continue;
    for (const c of index.get(k) ?? []) {
      const y = [c.adres, c.officieel].filter((z): z is AdresDelen => Boolean(z)).find((z) => vergelijkAdres(z, x!));
      if (!y) continue;
      // Voor een bericht moet het dezelfde woning zijn: een andere of ontbrekende bus aan één kant = enkel hetzelfde gebouw.
      const o = normBus(y.bus) === normBus(x.bus) ? 'adres' : 'gebouw';
      const vorige = uit.get(c.id);
      if (!vorige || (vorige.overeenkomst === 'gebouw' && o === 'adres')) uit.set(c.id, { contact: c, overeenkomst: o });
    }
  }
  return [...uit.values()];
}

async function metOfficieel(a: AdresDelen): Promise<AdresDelen | null> {
  if (!a.straat || !a.postcode) return null;
  const o = officieleStraat(a.straat, await straatnamen(a.postcode));
  return o && o !== a.straat ? { ...a, straat: o } : null;
}

// ---------- Bron 1: Marketpulse in de mirror ----------

const AGENCY = /Concurrent Makelaar\s*\((.+)\)\s*$/;
const immowebIdUit = (url: string | null | undefined) => (url ? (/immoweb\.be\/.*?\/(?:id)?(\d{6,})/.exec(url)?.[1] ?? null) : null);

/** Leads die zelf uit een advertentie komen (Marketpulse): Lead-ID → Immoweb-ID en marktdatum. */
function leesEigenAdvertenties(mirrorPad: string, leadIds: string[]) {
  const db = new DatabaseSync(mirrorPad, { readOnly: true });
  const uit = new Map<string, { immowebId: string | null; markt: string | null }>();
  for (let i = 0; i < leadIds.length; i += 500) {
    const deel = leadIds.slice(i, i + 500);
    const rijen = db
      .prepare(`select Id, ERA_URL_2__c as url, ERA_Datum_op_de_markt__c as markt from Lead where LeadSource = 'Marketpulse' and Id in (${deel.map(() => '?').join(',')})`)
      .all(...deel) as { Id: string; url: string | null; markt: string | null }[];
    for (const r of rijen) uit.set(r.Id, { immowebId: immowebIdUit(r.url), markt: r.markt });
  }
  db.close();
  return uit;
}

function leesMarketpulse(mirrorPad: string): Advertentie[] {
  const db = new DatabaseSync(mirrorPad, { readOnly: true });
  const rijen = db
    .prepare(
      `select Id, Status, ERA_Reden__c as reden, ERA_Bron_Bemiddelaar__c as bemiddelaar, ERA_Te_koop_te_huur_bij__c as bij,
              ERA_Straat__c as straat, ERA_Huisnummer__c as nummer, ERA_Bus__c as bus, ERA_Postcode__c as postcode,
              ERA_URL_2__c as url, ERA_Datum_op_de_markt__c as markt, ERA_Actuele_Vraagprijs__c as prijs, CreatedDate as gemaakt
       from Lead where _verwijderd = 0 and LeadSource = 'Marketpulse' and IsConverted = 0
         and ERA_Straat__c is not null and ERA_Huisnummer__c is not null and CreatedDate >= ?`,
    )
    .all(new Date(Date.now() - MARKETPULSE_DAGEN * 86400000).toISOString()) as Record<string, string | number | null>[];
  db.close();
  return rijen.map((r) => {
    const bij = String(r.bij ?? r.bemiddelaar ?? '').toLowerCase();
    const verkoper = /particulier/.test(bij) ? 'particulier' : /notaris/.test(bij) ? 'notaris' : /makelaar|agent/.test(bij) ? 'makelaar' : null;
    const url = (r.url as string | null) ?? null;
    const immowebId = immowebIdUit(url) ?? undefined;
    const reden = String(r.reden ?? '');
    const status: Advertentie['status'] = r.Status === 'Beëindigd' ? (/verkocht/i.test(reden) ? 'verkocht' : 'weg') : 'te_koop';
    return {
      // Dezelfde advertentie als in de Immoweb-zoekresultaten krijgt hetzelfde ID (geen dubbel signaal).
      bron: immowebId ? 'immoweb' : 'marketpulse',
      externId: immowebId ?? (r.Id as string),
      leadId: r.Id as string,
      adres: { straat: r.straat as string, nummer: String(r.nummer), bus: (r.bus as string | null) ?? null, postcode: String(r.postcode ?? '') },
      verkoper,
      makelaar: verkoper === 'makelaar' ? (AGENCY.exec(String(r.bemiddelaar ?? ''))?.[1]?.trim() ?? null) : null,
      vraagprijs: r.prijs === null ? null : Math.round(Number(r.prijs)),
      onlineSinds: (r.markt as string | null) ?? String(r.gemaakt ?? '').slice(0, 10) ?? null,
      url,
      status,
    } satisfies Advertentie;
  });
}

// ---------- Bron 2: Immoweb ----------

interface ImmowebResultaat {
  id: number;
  customerName?: string | null;
  flags?: { main?: string | null; secondary?: string[] };
  property?: { location?: { street?: string | null; number?: string | null; box?: string | null; postalCode?: string | null; locality?: string | null }; type?: string; subtype?: string };
  transaction?: { type?: string; sale?: { price?: number | null } };
}

/** Alle advertenties "huis en appartement te koop" in één postcode. null = niet (volledig) gelukt. */
async function immowebPostcode(postcode: string): Promise<ImmowebResultaat[] | null> {
  const uit: ImmowebResultaat[] = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const url = `https://www.immoweb.be/nl/search-results/huis-en-appartement/te-koop?postalCodes=${postcode}&page=${pagina}`;
    if (!(await toegelaten(url))) return null;
    const r = await haal(url, { json: true });
    if (lijktGeblokkeerd(r.status, r.tekst)) throw new Geblokkeerd(`HTTP ${r.status}`);
    if (r.status !== 200) return null;
    let d: { results?: ImmowebResultaat[]; totalItems?: number };
    try {
      d = JSON.parse(r.tekst);
    } catch {
      return null;
    }
    const deel = (d.results ?? []).filter((x) => String(x.property?.location?.postalCode ?? '') === postcode);
    uit.push(...deel);
    if ((d.results ?? []).length < 30 || uit.length >= (d.totalItems ?? 0)) return uit;
  }
  return uit;
}

/** Details van één advertentie (enkel voor gekoppelde): sinds wanneer online, optie/verkocht, particulier of kantoor. */
async function immowebDetail(id: string, advertentieUrl: string | null): Promise<{ sinds: string | null; status: Advertentie['status'] | null; particulier: boolean | null; kantoor: string | null } | null> {
  const url = advertentieUrl ?? `https://www.immoweb.be/nl/zoekertje/huis/te-koop/x/0000/${id}`;
  if (!(await toegelaten(url))) return null;
  const r = await haal(url);
  if (lijktGeblokkeerd(r.status, r.tekst)) throw new Geblokkeerd(`HTTP ${r.status}`);
  if (r.status === 404 || r.status === 410) return { sinds: null, status: 'weg', particulier: null, kantoor: null };
  const i = r.tekst.indexOf('window.classified');
  if (i < 0) return null;
  const start = r.tekst.indexOf('{', i);
  let c: Record<string, any>;
  try {
    // Het object eindigt op de eerste "};" na de start; JSON.parse faalt als het afgekapt is.
    const einde = r.tekst.indexOf('};', start);
    c = JSON.parse(r.tekst.slice(start, einde + 1));
  } catch {
    return null;
  }
  if (String(c.id) !== id) return null;
  const flags = c.flags ?? {};
  const klant = (c.customers ?? [])[0] ?? {};
  return {
    sinds: (c.publication?.creationDate as string | undefined)?.slice(0, 10) ?? null,
    status: flags.isSoldOrRented ? 'verkocht' : flags.isUnderOption ? 'onder_optie' : 'te_koop',
    particulier: klant.type ? klant.type === 'PRIVATE' : null,
    kantoor: klant.type && klant.type !== 'PRIVATE' ? (klant.name ?? null) : null,
  };
}

function immowebNaarAdvertentie(x: ImmowebResultaat): Advertentie | null {
  const loc = x.property?.location ?? {};
  if (!loc.street || !loc.number || !loc.postalCode) return null; // adres verborgen: niet te koppelen
  const prive = x.customerName === 'PRIVATE';
  return {
    bron: 'immoweb',
    externId: String(x.id),
    adres: { straat: loc.street, nummer: String(loc.number), bus: loc.box ?? null, postcode: String(loc.postalCode) },
    verkoper: prive ? 'particulier' : 'makelaar',
    makelaar: prive ? null : (x.customerName ?? null),
    vraagprijs: x.transaction?.sale?.price ?? null,
    onlineSinds: null,
    url: `https://www.immoweb.be/nl/zoekertje/${(x.property?.type ?? 'huis').toLowerCase() === 'apartment' ? 'appartement' : 'huis'}/te-koop/${encodeURIComponent((loc.locality ?? 'x').toLowerCase())}/${loc.postalCode}/${x.id}`,
    status: x.flags?.main === 'under_option' ? 'onder_optie' : 'te_koop',
  };
}

// ---------- Supabase ----------

function sleutel(dienst: string): string | null {
  try {
    return execFileSync('security', ['find-generic-password', '-s', dienst, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

async function verbind() {
  const projectRef = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(readFileSync(join(import.meta.dirname, '..', '.env.local'), 'utf8'))?.[1];
  if (!projectRef) throw new Error('Supabase-project niet gevonden in .env.local.');
  const wachtwoord = sleutel(SLEUTELHANGER);
  if (!wachtwoord) throw new Error('geen importwachtwoord in de sleutelhanger');
  const maakClient = () => new pg.Client({ host: DB_HOST, port: 5432, user: `oxpecker_import.${projectRef}`, password: wachtwoord, database: 'postgres', ssl: { rejectUnauthorized: false } });
  let db = maakClient();
  for (let poging = 1; ; poging++) {
    try {
      await db.connect();
      return db;
    } catch (e) {
      if (poging >= 3 || !/password authentication failed/i.test(String(e))) throw e;
      await wacht(60_000);
      db = maakClient();
    }
  }
}

// ---------- Hoofdprogramma ----------

const dagenGeleden = (dag: string | null) => (dag ? (Date.now() - new Date(`${dag}T12:00:00Z`).getTime()) / 86400000 : null);

let db: pg.Client | null = null;
try {
  db = await verbind();
  const eigenaar = (await db.query<{ id: string | null }>('select public.import_eigenaar($1) as id', [OXPECKER_EMAIL])).rows[0]?.id;
  if (!eigenaar) throw new Error('Oxpecker-gebruiker niet gevonden');
  const rijen = (
    await db.query<{ id: string; extern_id: string | null; straat: string | null; postcode: string | null; status_bron: string }>(
      `select id, extern_id, straat, postcode, status_bron from public.contacten where eigenaar_id = $1 and bron = 'eraforce_mirror' and not is_testdata`,
      [eigenaar],
    )
  ).rows;

  const eigen = leesEigenAdvertenties(pad, rijen.map((r) => r.extern_id).filter((x): x is string => Boolean(x?.startsWith('00Q'))));
  const contacten: ContactAdres[] = [];
  for (const r of rijen) {
    const adres = { ...splitsStraatregel(r.straat), postcode: r.postcode };
    if (!adresSleutel(adres)) continue;
    contacten.push({ id: r.id, externId: r.extern_id, adres, officieel: await metOfficieel(adres), eigen: (r.extern_id && eigen.get(r.extern_id)) || null, status: r.status_bron });
  }
  const index = maakIndex(contacten);
  const dubbels = [...new Map(contacten.map((c) => [adresSleutel(c.officieel ?? c.adres), 0])).keys()].length;
  console.log(`Marktsignalen: ${contacten.length} contacten met volledig adres (${contacten.length - dubbels} op een adres dat al voorkomt), ${contacten.filter((c) => c.officieel).length} met officiële straatnaam.`);

  // Advertenties verzamelen
  const advertenties: Advertentie[] = leesMarketpulse(pad);
  const marketpulse = advertenties.length;
  const volledigGescand = new Set<string>();
  let immoweb = 0;
  let immowebFout: string | null = null;
  if (!ZONDER_IMMOWEB) {
    // Postcodes van de actieve contacten (prospects en leads), grootste eerst.
    const telling = new Map<string, number>();
    for (const r of rijen) {
      const pc = (r.postcode ?? '').replace(/\D/g, '');
      if (pc.length === 4 && r.status_bron !== 'beeindigd' && r.status_bron !== 'relatie') telling.set(pc, (telling.get(pc) ?? 0) + 1);
    }
    const postcodes = [...telling.entries()].sort((a, b) => b[1] - a[1]).map(([pc]) => pc).slice(0, 40);
    try {
      for (const pc of postcodes) {
        const lijst = await immowebPostcode(pc);
        if (!lijst) continue;
        volledigGescand.add(pc);
        for (const x of lijst) {
          const a = immowebNaarAdvertentie(x);
          if (a) {
            advertenties.push(a);
            immoweb++;
          }
        }
      }
    } catch (e) {
      immowebFout = e instanceof Geblokkeerd ? `Immoweb blokkeert (${e.message}); vorige signalen blijven staan` : `Immoweb niet bereikbaar (${e instanceof Error ? e.name : 'fout'})`;
    }
    console.log(`Marktsignalen: Immoweb ${volledigGescand.size}/${postcodes.length} postcodes, ${immoweb} advertenties met adres${immowebFout ? ` — ${immowebFout}` : ''}.`);
  }

  // Koppelen
  interface Treffer {
    contact: ContactAdres;
    overeenkomst: 'adres' | 'gebouw';
    a: Advertentie;
  }
  const treffers = new Map<string, Treffer>(); // contact|bron|extern
  for (const a of advertenties) {
    for (const t of zoek(index, a.adres, await metOfficieel(a.adres))) {
      if (a.leadId && t.contact.externId === a.leadId) continue; // de Marketpulse-lead zelf
      if (t.contact.eigen?.immowebId && t.contact.eigen.immowebId === (a.bron === 'immoweb' ? a.externId : null)) continue; // zijn eigen advertentie
      const k = `${t.contact.id}|${a.bron}|${a.externId}`;
      const vorige = treffers.get(k);
      // Immoweb-zoekresultaat (actueel) gaat voor dezelfde advertentie via Marketpulse.
      if (!vorige || (vorige.a.leadId && !a.leadId)) treffers.set(k, { ...t, a: vorige?.a.onlineSinds && !a.onlineSinds ? { ...a, onlineSinds: vorige.a.onlineSinds } : a });
    }
  }

  // Details van gekoppelde Immoweb-advertenties (enkel die, dus weinig aanvragen).
  if (!ZONDER_IMMOWEB && !immowebFout) {
    try {
      const gezien = new Map<string, Awaited<ReturnType<typeof immowebDetail>>>();
      for (const t of treffers.values()) {
        if (t.a.bron !== 'immoweb' || t.overeenkomst !== 'adres') continue;
        if (!gezien.has(t.a.externId)) gezien.set(t.a.externId, await immowebDetail(t.a.externId, t.a.url));
        const d = gezien.get(t.a.externId);
        if (!d) continue;
        if (d.sinds) t.a.onlineSinds = d.sinds;
        if (d.status) t.a.status = d.status;
        if (d.particulier !== null) {
          t.a.verkoper = d.particulier ? 'particulier' : (t.a.verkoper === 'notaris' ? 'notaris' : 'makelaar');
          t.a.makelaar = d.particulier ? null : (d.kantoor ?? t.a.makelaar);
        }
      }
    } catch (e) {
      immowebFout = `details: ${e instanceof Error ? e.message : 'fout'}`;
    }
  }

  // Prospects die zelf uit een advertentie komen: dezelfde verkoopperiode (marktdatum binnen 60 dagen) is geen nieuws.
  for (const [k, t] of treffers) {
    const m = t.contact.eigen?.markt;
    if (m && (!t.a.onlineSinds || Math.abs((dagenGeleden(m) ?? 0) - (dagenGeleden(t.a.onlineSinds) ?? 0)) <= 60)) treffers.delete(k);
  }
  // Advertenties van ERA zelf (bv. ERA Leus & Toye) zijn onze eigen klanten: geen signaal.
  for (const [k, t] of treffers) if (/^ERA\b/i.test(t.a.makelaar ?? '')) treffers.delete(k);
  /** Reden voor een bericht? Enkel dezelfde woning, vers te koop, bij een lopende prospect of relatie. Een prospect die zelf
   * uit een advertentie komt (Marketpulse), verkoopt al via een makelaar: enkel nieuws als hij nu zelf verkoopt. */
  const berichtWaardig = (t: Treffer) =>
    t.overeenkomst === 'adres' &&
    (t.a.status === 'te_koop' || t.a.status === 'onder_optie') &&
    (dagenGeleden(t.a.onlineSinds) ?? 0) <= VERS_DAGEN &&
    t.contact.status !== 'beeindigd' &&
    (!t.contact.eigen || t.a.verkoper === 'particulier');
  const vers = [...treffers.values()].filter(berichtWaardig);
  console.log(
    `Marktsignalen: ${marketpulse} Marketpulse-prospects, ${treffers.size} koppelingen met contacten (${new Set([...treffers.values()].map((t) => t.contact.id)).size} contacten), ${vers.length} vers te koop (${vers.filter((t) => t.a.verkoper === 'particulier').length} particulier).`,
  );
  if (DROOG) {
    const tel = (f: (t: Treffer) => string) => Object.entries([...treffers.values()].reduce<Record<string, number>>((m, t) => ((m[f(t)] = (m[f(t)] ?? 0) + 1), m), {}));
    console.log('Per overeenkomst:', tel((t) => t.overeenkomst), '| per bron:', tel((t) => t.a.bron), '| vers per verkoper:', Object.entries(vers.reduce<Record<string, number>>((m, t) => ((m[t.a.verkoper ?? '?'] = (m[t.a.verkoper ?? '?'] ?? 0) + 1), m), {})));
    // Enkel kantoor, status en datums (geen namen of adressen), om de regels te toetsen.
    if (process.env.MS_DETAIL === '1') for (const t of vers) console.log(t.a.bron, t.a.verkoper, t.a.makelaar, t.contact.status, t.contact.eigen ? 'eigen-advertentie' : '-', t.a.onlineSinds, t.a.status);
    process.exit(0);
  }

  // Schrijven
  await db.query('begin');
  const bestaand = new Map(
    (await db.query<{ contact_id: string; bron: string; extern_id: string; status: string }>('select contact_id, bron, extern_id, status from public.marktsignalen where eigenaar_id = $1', [eigenaar])).rows.map((r) => [
      `${r.contact_id}|${r.bron}|${r.extern_id}`,
      r.status,
    ]),
  );
  let nieuw = 0;
  let historiek = 0;
  for (const [k, t] of treffers) {
    const isNieuw = !bestaand.has(k);
    // Een advertentie die al lang online staat (of verkocht/weg is) bij de eerste vondst: enkel historiek, geen bericht.
    // Niet bericht-waardig bij de eerste vondst (ander gebouwdeel, al lang online, beëindigde lead, …): enkel historiek.
    const oud = isNieuw && !berichtWaardig(t);
    if (isNieuw) (oud ? historiek++ : nieuw++);
    await db.query(
      `insert into public.marktsignalen (eigenaar_id, contact_id, bron, extern_id, verkoper, makelaar, vraagprijs, online_sinds, url, overeenkomst, status, afgehandeld_op)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, case when $12 then now() end)
       on conflict (eigenaar_id, contact_id, bron, extern_id) do update set verkoper = excluded.verkoper, makelaar = excluded.makelaar,
         vraagprijs = excluded.vraagprijs, online_sinds = coalesce(excluded.online_sinds, marktsignalen.online_sinds), url = coalesce(excluded.url, marktsignalen.url),
         overeenkomst = excluded.overeenkomst, status = excluded.status, laatst_gezien_op = now()`,
      [eigenaar, t.contact.id, t.a.bron, t.a.externId, t.a.verkoper, t.a.makelaar, t.a.vraagprijs, t.a.onlineSinds, t.a.url, t.overeenkomst, t.a.status, oud],
    );
  }
  // Immoweb-advertenties die niet meer in de (volledig gelezen) zoekresultaten staan: weg (tenzij al verkocht).
  let weg = 0;
  if (!ZONDER_IMMOWEB && !immowebFout && volledigGescand.size > 0) {
    const gezien = [...treffers.keys()];
    const r = await db.query(
      `update public.marktsignalen m set status = 'weg'
       from public.contacten c
       where m.eigenaar_id = $1 and m.bron = 'immoweb' and m.status in ('te_koop', 'onder_optie') and c.id = m.contact_id
         and regexp_replace(coalesce(c.postcode, ''), '\\D', '', 'g') = any($2) and not ((m.contact_id || '|immoweb|' || m.extern_id) = any($3))`,
      [eigenaar, [...volledigGescand], gezien],
    );
    weg = r.rowCount ?? 0;
  }
  await db.query('commit');
  console.log(`Marktsignalen klaar: ${nieuw} nieuw te koop gezet, ${historiek} als historiek (al langer online), ${weg} niet meer online.`);
} catch (e) {
  await db?.query('rollback').catch(() => {});
  const fout = e instanceof Error ? e.message.slice(0, 200) : 'onbekende fout';
  console.error(`Marktsignalen mislukt: ${fout}`);
  process.exitCode = 1;
} finally {
  await db?.end();
}
