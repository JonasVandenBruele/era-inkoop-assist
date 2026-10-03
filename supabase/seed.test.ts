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
    create schema auth; create table auth.users (id uuid primary key);
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
