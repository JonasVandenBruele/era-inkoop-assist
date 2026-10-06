// Meldingentaak: draait elke ±10 minuten in GitHub Actions (.github/workflows/meldingen.yml).
// Leest per gebruiker met een pushabonnement de gegevens, bepaalt welke meldingen nu horen
// (src/domain/meldingen.ts) en verstuurt die. Logt enkel aantallen, nooit namen of inhoud.
import pg from 'pg';
import webpush from 'web-push';
import * as m from '../src/core/db/mappers';
import { leesInstellingen } from '../src/core/settings/schema';
import { gebruiktEchteData, kiesGegevens, type Gegevens } from '../src/core/db/store';
import { teVersturenMeldingen, type Pushmelding } from '../src/domain/meldingen';

const vereist = (naam: string) => {
  const v = process.env[naam];
  if (!v) throw new Error(`Omgevingsvariabele ${naam} ontbreekt.`);
  return v;
};

const TEST = process.env.TESTMELDING === 'true';
const SITE = process.env.SITE_URL ?? 'https://jonasvandenbruele.github.io/era-inkoop-assist/';

webpush.setVapidDetails(SITE, vereist('VAPID_PUBLIC_KEY'), vereist('VAPID_PRIVATE_KEY'));

const db = new pg.Client({
  host: vereist('SUPABASE_DB_HOST'),
  port: 5432,
  user: `postgres.${vereist('SUPABASE_PROJECT_ID')}`,
  password: vereist('SUPABASE_DB_PASSWORD'),
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

type Rij = Record<string, unknown>;
const rijen = async (sql: string, waarden: unknown[]) => (await db.query<Rij>(sql, waarden)).rows;
const tabel = (naam: string, eigenaar: string) => rijen(`select * from public.${naam} where eigenaar_id = $1`, [eigenaar]);

async function gegevensVan(eigenaar: string): Promise<Gegevens> {
  const [contacten, panden, contactPanden, activiteiten, afspraken, belpogingen, opvolgacties, keuzes, belverboden, haken, voorkeuren] = await Promise.all(
    ['contacten', 'panden', 'contact_pand', 'bronactiviteiten', 'afspraken', 'belpogingen', 'opvolgacties', 'planningskeuzes', 'belverboden', 'waardehaken', 'contactvoorkeuren'].map((t) =>
      tabel(t, eigenaar),
    ),
  );
  return {
    contacten: contacten!.map(m.contactNaarModel),
    panden: panden!.map(m.pandNaarModel),
    contactPanden: contactPanden!.map(m.contactPandNaarModel),
    activiteiten: activiteiten!.map(m.activiteitNaarModel),
    afspraken: afspraken!.map(m.afspraakNaarModel),
    belpogingen: belpogingen!.map(m.belpogingNaarModel),
    bronnen: [],
    opvolgacties: opvolgacties!.map(m.opvolgactieNaarModel),
    keuzes: keuzes!.map(m.keuzeNaarModel),
    belverboden: belverboden!.map(m.belverbodNaarModel),
    haken: haken!.map(m.haakNaarModel),
    voorkeuren: voorkeuren!.map(m.voorkeurNaarModel),
    contacthooks: [],
  };
}

async function verstuur(eigenaar: string, melding: Pushmelding): Promise<number> {
  const abonnementen = await rijen('select id, endpoint, p256dh, auth from public.push_abonnementen where eigenaar_id = $1', [eigenaar]);
  let gelukt = 0;
  for (const a of abonnementen) {
    try {
      await webpush.sendNotification(
        { endpoint: a.endpoint as string, keys: { p256dh: a.p256dh as string, auth: a.auth as string } },
        JSON.stringify({ titel: melding.titel, tekst: melding.tekst, tag: melding.tag, url: './' }),
        { TTL: 30 * 60, urgency: 'normal' },
      );
      await db.query('update public.push_abonnementen set laatst_gelukt_op = now() where id = $1', [a.id]);
      gelukt++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        // Abonnement bestaat niet meer (app verwijderd of toestemming ingetrokken).
        await db.query('delete from public.push_abonnementen where id = $1', [a.id]);
      } else {
        console.error(`Versturen mislukt (status ${status ?? 'onbekend'}).`);
      }
    }
  }
  return gelukt;
}

async function main() {
  await db.connect();
  const eigenaars = (await rijen('select distinct eigenaar_id from public.push_abonnementen', [])).map((r) => r.eigenaar_id as string);
  let totaal = 0;
  for (const eigenaar of eigenaars) {
    if (TEST) {
      totaal += await verstuur(eigenaar, { sleutel: 'test', titel: 'Oxpecker', tekst: 'Testmelding: je pushmeldingen werken ✓', tag: 'test' });
      continue;
    }
    const doc = (await rijen('select document from public.instellingen where eigenaar_id = $1', [eigenaar]))[0]?.document;
    const alles = await gegevensVan(eigenaar);
    const echt = gebruiktEchteData(alles, leesInstellingen(doc));
    // Met echte gegevens geldt altijd de echte datum (een oude testdatum telt dan niet).
    const inst = { ...leesInstellingen(doc), ...(echt ? { testdatum: null } : {}) };
    const meldingen = teVersturenMeldingen(kiesGegevens(alles, echt), inst, new Date());
    for (const melding of meldingen) {
      // Eerst vastleggen: zo vertrekt elke melding maar één keer, ook als de taak dubbel loopt.
      const nieuw = await db.query('insert into public.verstuurde_meldingen (eigenaar_id, sleutel) values ($1, $2) on conflict do nothing returning id', [eigenaar, melding.sleutel]);
      if (nieuw.rowCount) totaal += await verstuur(eigenaar, melding);
    }
  }
  // Logboek opruimen: ouder dan 30 dagen hoeft niet bewaard te blijven.
  await db.query("delete from public.verstuurde_meldingen where verstuurd_op < now() - interval '30 days'");
  console.log(`Klaar: ${eigenaars.length} gebruiker(s), ${totaal} melding(en) verstuurd.`);
  await db.end();
}

main().catch(async (e) => {
  console.error('Meldingentaak mislukt:', e instanceof Error ? e.message : e);
  await db.end().catch(() => {});
  process.exit(1);
});
