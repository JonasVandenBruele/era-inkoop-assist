// Laadt de volledige fictieve dataset via de mappers in het echte schema en leest ze terug.
// Vangt verschillen tussen code en database (kolomnamen, types, beperkingen) op zonder Supabase-account.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { genereerTestdata } from '../fixtures/testdata';
import * as m from '../src/core/db/mappers';

const A = '11111111-1111-4111-a111-111111111111';

let db: PGlite;
const data = genereerTestdata({ testdatum: '2026-10-13T07:30', idPrefix: A });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  const map = join(import.meta.dirname, 'migrations');
  for (const f of readdirSync(map).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(join(map, f), 'utf8'));
  await db.query('insert into auth.users (id) values ($1)', [A]);

  const voegIn = async (tabel: string, rijen: object[]) => {
    const metEigenaar = rijen.map((r) => ({ ...r, eigenaar_id: A }));
    // Enkel de kolommen die de app meestuurt, zodat de rest zijn standaardwaarde krijgt (zoals bij Supabase).
    const kolommen = Object.keys(metEigenaar[0]!).join(', ');
    await db.query(`insert into public.${tabel} (${kolommen}) select ${kolommen} from json_populate_recordset(null::public.${tabel}, $1)`, [
      JSON.stringify(metEigenaar),
    ]);
  };
  await voegIn('bronnen', data.bronnen.map(m.bronNaarRij));
  await voegIn('contacten', data.contacten.map(m.contactNaarRij));
  await voegIn('panden', data.panden.map(m.pandNaarRij));
  await voegIn('contact_pand', data.contactPanden.map(m.contactPandNaarRij));
  await voegIn('bronactiviteiten', data.activiteiten.map(m.activiteitNaarRij));
  await voegIn('afspraken', data.afspraken.map(m.afspraakNaarRij));
  await voegIn('belpogingen', data.belpogingen.map(m.belpogingNaarRij));
});

const lees = async (tabel: string) => (await db.query<Record<string, unknown>>(`select * from public.${tabel} order by id`)).rows;
const opId = <T extends { id: string }>(x: T[]) => [...x].sort((a, b) => a.id.localeCompare(b.id));

describe('testdata in het databaseschema', () => {
  it('contacten komen ongewijzigd terug', async () => {
    expect((await lees('contacten')).map(m.contactNaarModel)).toEqual(opId(data.contacten));
  });
  it('panden en relaties komen ongewijzigd terug', async () => {
    expect((await lees('panden')).map(m.pandNaarModel)).toEqual(opId(data.panden));
    expect((await lees('contact_pand')).map(m.contactPandNaarModel)).toEqual(opId(data.contactPanden));
  });
  it('activiteiten komen ongewijzigd terug', async () => {
    expect((await lees('bronactiviteiten')).map(m.activiteitNaarModel)).toEqual(opId(data.activiteiten));
  });
  it('afspraken, belpogingen en bronnen komen ongewijzigd terug', async () => {
    expect((await lees('afspraken')).map(m.afspraakNaarModel)).toEqual(opId(data.afspraken));
    expect((await lees('belpogingen')).map(m.belpogingNaarModel)).toEqual(opId(data.belpogingen));
    expect((await lees('bronnen')).map(m.bronNaarModel)).toEqual(opId(data.bronnen));
  });
});

describe('een nieuwe import overschrijft geen lokale gegevens', () => {
  it('lokale belpoging, keuze, opvolgactie en belverbod blijven ongewijzigd na herimport van de bron', async () => {
    const contact = data.contacten[3]!;
    const lokaal = `
      insert into public.belpogingen (id, eigenaar_id, contact_id, uitkomst, is_inhoudelijk, notitie)
        values ('00000000-0000-4000-a000-0000000000b1', '${A}', '${contact.id}', 'terugbellen', true, 'Mijn notitie');
      insert into public.opvolgacties (eigenaar_id, contact_id, soort, dag, belpoging_id)
        values ('${A}', '${contact.id}', 'terugbellen', '2026-10-20', '00000000-0000-4000-a000-0000000000b1');
      insert into public.planningskeuzes (eigenaar_id, contact_id, soort, voor_dag) values ('${A}', '${contact.id}', 'vastpinnen', '2026-10-13');
      insert into public.belverboden (eigenaar_id, contact_id, reden) values ('${A}', '${contact.id}', 'Mijn keuze');
    `;
    await db.exec(lokaal);
    const tel = async () =>
      (
        await db.query<{ n: number }>(
          `select (select count(*) from public.belpogingen) + (select count(*) from public.opvolgacties)
             + (select count(*) from public.planningskeuzes) + (select count(*) from public.belverboden) as n`,
        )
      ).rows[0]!.n;
    const voor = await tel();

    // Herimport: dezelfde bronrecords, met gewijzigde inhoud, via upsert op (eigenaar, bron, extern_id).
    const gewijzigd = data.contacten.map((c) => ({ ...m.contactNaarRij(c), tijdshorizon_bron: 'gewijzigd in bron', eigenaar_id: A }));
    const kolommen = Object.keys(gewijzigd[0]!).filter((k) => k !== 'id');
    await db.query(
      `insert into public.contacten (${kolommen.join(', ')}) select ${kolommen.join(', ')} from json_populate_recordset(null::public.contacten, $1)
       on conflict (eigenaar_id, bron, extern_id) where extern_id is not null do update set ${kolommen.map((k) => `${k} = excluded.${k}`).join(', ')}`,
      [JSON.stringify(gewijzigd)],
    );

    expect(await tel()).toBe(Number(voor));
    const c = await db.query<{ tijdshorizon_bron: string; n: number }>(
      `select tijdshorizon_bron, (select count(*)::int from public.contacten) as n from public.contacten where id = $1`,
      [contact.id],
    );
    expect(c.rows[0]).toEqual({ tijdshorizon_bron: 'gewijzigd in bron', n: data.contacten.length });
    const notitie = await db.query<{ notitie: string }>(`select notitie from public.belpogingen where id = '00000000-0000-4000-a000-0000000000b1'`);
    expect(notitie.rows[0]!.notitie).toBe('Mijn notitie');
  });
});
