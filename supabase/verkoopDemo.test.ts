// Gedeelde demo-opslag van de verkoopmodule: gescheiden van productie, enkel met toegangscode, met versiecontrole.
import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const A = '11111111-1111-4111-a111-111111111111';
const CODE = 'test-code-1234';

let db: PGlite;

async function alsAnon<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec('set role anon');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

const bewaar = (wijzigingen: unknown[], code = CODE) =>
  alsAnon(() => db.query<{ r: { soort: string; id: string }[] }>('select public.verkoop_demo_bewaar($1, $2, $3::jsonb) as r', [code, 'm-test', JSON.stringify(wijzigingen)]));
const laad = (code = CODE) => alsAnon(() => db.query<{ soort: string; id: string; versie: number; data: unknown }>('select * from public.verkoop_demo_laad($1)', [code]));

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
  `);
  const map = join(import.meta.dirname, 'migrations');
  for (const bestand of readdirSync(map).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(map, bestand), 'utf8'));
  }
  // Testcode naast de echte (waarvan enkel de hash in de migratie staat).
  const hash = createHash('sha256').update(CODE).digest('hex');
  await db.query(`insert into verkoop_demo.toegang (code_hash, omgeving) values ($1, 'test')`, [hash]);
  // Een productierij, om te bewijzen dat de demo er nooit aan komt.
  await db.query('insert into auth.users (id) values ($1)', [A]);
  await db.query(`insert into public.contacten (eigenaar_id, achternaam, bron, is_testdata) values ($1, 'Productie', 'eraforce_mirror', false)`, [A]);
});

describe('gedeelde demo-opslag verkoopmodule', () => {
  it('weigert een ongeldige toegangscode', async () => {
    await expect(laad('fout')).rejects.toThrow(/Ongeldige toegangscode/);
    await expect(bewaar([{ soort: 'actie', id: 'x', data: {}, verwachte_versie: null }], 'fout')).rejects.toThrow(/Ongeldige toegangscode/);
  });

  it('de app kan de demotabellen niet rechtstreeks lezen', async () => {
    await expect(alsAnon(() => db.query('select * from verkoop_demo.records'))).rejects.toThrow(/permission denied/);
    await expect(alsAnon(() => db.query('select * from verkoop_demo.toegang'))).rejects.toThrow(/permission denied/);
  });

  it('bewaart en laadt records met versies', async () => {
    const r = await bewaar([{ soort: 'actie', id: 'a1', data: { voortgang: 'nog_contacteren' }, verwachte_versie: null }]);
    expect(r.rows[0]!.r).toEqual([]);
    const l = await laad();
    expect(l.rows).toMatchObject([{ soort: 'actie', id: 'a1', versie: 1 }]);
  });

  it('gelijktijdige wijziging: de tweede met een verouderde versie wordt geweigerd en niets wordt overschreven', async () => {
    await bewaar([{ soort: 'actie', id: 'a2', data: { claim: null }, verwachte_versie: null }]);
    const nicolas = await bewaar([{ soort: 'actie', id: 'a2', data: { claim: 'm-nicolas' }, verwachte_versie: 1 }]);
    const sofie = await bewaar([{ soort: 'actie', id: 'a2', data: { claim: 'm-sofie' }, verwachte_versie: 1 }]);
    expect(nicolas.rows[0]!.r).toEqual([]);
    expect(sofie.rows[0]!.r).toEqual([{ soort: 'actie', id: 'a2' }]);
    const l = await laad();
    expect(l.rows.find((x) => x.id === 'a2')).toMatchObject({ versie: 2, data: { claim: 'm-nicolas' } });
  });

  it('alles of niets: bij één conflict wordt niets bewaard', async () => {
    const r = await bewaar([
      { soort: 'contactmoment', id: 'cm-x', data: {}, verwachte_versie: null },
      { soort: 'actie', id: 'a2', data: { claim: 'm-sofie' }, verwachte_versie: 1 },
    ]);
    expect(r.rows[0]!.r).toEqual([{ soort: 'actie', id: 'a2' }]);
    expect((await laad()).rows.some((x) => x.id === 'cm-x')).toBe(false);
  });

  it('weigert onbekende soorten', async () => {
    await expect(bewaar([{ soort: 'contacten', id: 'x', data: {}, verwachte_versie: null }])).rejects.toThrow(/Ongeldige wijziging/);
  });

  it('een andere code ziet de records van deze omgeving niet', async () => {
    const tweede = 'tweede-code';
    await db.query(`insert into verkoop_demo.toegang (code_hash, omgeving) values ($1, 'ander')`, [createHash('sha256').update(tweede).digest('hex')]);
    expect((await laad(tweede)).rows).toEqual([]);
  });

  it('reset wist enkel de demoresultaten, niet de productiegegevens', async () => {
    await alsAnon(() => db.query('select public.verkoop_demo_reset($1, $2)', [CODE, 'm-test']));
    expect((await laad()).rows).toEqual([]);
    const prod = await db.query<{ n: number }>(`select count(*)::int as n from public.contacten where achternaam = 'Productie'`);
    expect(prod.rows[0]!.n).toBe(1);
  });
});
