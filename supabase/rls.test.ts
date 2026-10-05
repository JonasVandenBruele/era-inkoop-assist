// Test de migraties en toegangsregels tegen een echte Postgres (PGlite, in het geheugen).
// We bootsen het stukje Supabase na dat RLS nodig heeft: schema auth, auth.uid() en de rollen.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const A = '11111111-1111-4111-a111-111111111111';
const B = '22222222-2222-4222-a222-222222222222';

const SUPABASE_NABOOTSING = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
`;

let db: PGlite;

async function als<T>(gebruiker: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${gebruiker ? 'authenticated' : 'anon'}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [gebruiker ?? '']);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_NABOOTSING);
  const map = join(import.meta.dirname, 'migrations');
  for (const bestand of readdirSync(map).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(map, bestand), 'utf8'));
  }
  await db.query('insert into auth.users (id) values ($1), ($2)', [A, B]);
});

describe('migraties en toegangsregels', () => {
  it('gebruiker A kan eigen contact aanmaken en lezen', async () => {
    await als(A, async () => {
      await db.query(`insert into public.contacten (achternaam, bron, extern_id, is_testdata) values ('Peeters', 'fictief', 'FIC-1', true)`);
      const r = await db.query<{ achternaam: string; eigenaar_id: string }>('select achternaam, eigenaar_id from public.contacten');
      expect(r.rows).toEqual([{ achternaam: 'Peeters', eigenaar_id: A }]);
    });
  });

  it('gebruiker B ziet niets van gebruiker A', async () => {
    const r = await als(B, () => db.query('select * from public.contacten'));
    expect(r.rows).toEqual([]);
  });

  it('gebruiker B kan gegevens van A niet wijzigen of verwijderen', async () => {
    await als(B, async () => {
      await db.query(`update public.contacten set achternaam = 'Gehackt'`);
      await db.query('delete from public.contacten');
    });
    const r = await als(A, () => db.query<{ achternaam: string }>('select achternaam from public.contacten'));
    expect(r.rows).toEqual([{ achternaam: 'Peeters' }]);
  });

  it('gebruiker B kan geen rij aanmaken op naam van A', async () => {
    await expect(als(B, () => db.query(`insert into public.contacten (eigenaar_id, achternaam) values ($1, 'X')`, [A]))).rejects.toThrow();
  });

  it('gebruiker B kan niet verwijzen naar een contact van A', async () => {
    const { rows } = await als(A, () => db.query<{ id: string }>('select id from public.contacten limit 1'));
    const contactVanA = rows[0]!.id;
    await expect(
      als(B, () => db.query(`insert into public.belpogingen (contact_id, uitkomst, is_inhoudelijk) values ($1, 'gesproken', true)`, [contactVanA])),
    ).rejects.toThrow();
  });

  it('niet-ingelogde bezoekers zien niets', async () => {
    await expect(als(null, () => db.query('select * from public.contacten'))).rejects.toThrow();
  });

  it('dezelfde import twee keer geeft geen dubbel record (uniek op bron + extern_id)', async () => {
    await als(A, async () => {
      await db.query(
        `insert into public.contacten (achternaam, bron, extern_id) values ('Peeters bijgewerkt', 'fictief', 'FIC-1')
         on conflict (eigenaar_id, bron, extern_id) where extern_id is not null do update set achternaam = excluded.achternaam`,
      );
      const r = await db.query<{ n: number }>(`select count(*)::int as n from public.contacten where extern_id = 'FIC-1'`);
      expect(r.rows[0]!.n).toBe(1);
    });
  });

  it('verwijderen van een contact verwijdert ook zijn belpogingen, maar laat afspraken staan zonder koppeling', async () => {
    await als(A, async () => {
      const c = await db.query<{ id: string }>(`insert into public.contacten (achternaam) values ('Tijdelijk') returning id`);
      const id = c.rows[0]!.id;
      await db.query(`insert into public.belpogingen (contact_id, uitkomst, is_inhoudelijk) values ($1, 'geen_antwoord', false)`, [id]);
      await db.query(
        `insert into public.afspraken (titel, start_op, einde_op, contact_id, koppel_status) values ('Test', now(), now() + interval '1 hour', $1, 'bevestigd')`,
        [id],
      );
      await db.query('delete from public.contacten where id = $1', [id]);
      const p = await db.query<{ n: number }>('select count(*)::int as n from public.belpogingen where contact_id = $1', [id]);
      expect(p.rows[0]!.n).toBe(0);
      const a = await db.query<{ contact_id: string | null; eigenaar_id: string }>(`select contact_id, eigenaar_id from public.afspraken where titel = 'Test'`);
      expect(a.rows[0]).toEqual({ contact_id: null, eigenaar_id: A });
    });
  });
});

describe('toegangsregels voor lokale resultaten (fase 3)', () => {
  it('gebruiker B ziet geen keuzes, belverboden, opvolgacties, dagplannen of Donna-overzichten van A', async () => {
    await als(A, async () => {
      const { rows } = await db.query<{ id: string }>(`insert into public.contacten (achternaam) values ('Lokaal') returning id`);
      const id = rows[0]!.id;
      await db.query(`insert into public.planningskeuzes (contact_id, soort, voor_dag) values ($1, 'vastpinnen', '2026-10-13')`, [id]);
      await db.query(`insert into public.belverboden (contact_id) values ($1)`, [id]);
      await db.query(`insert into public.opvolgacties (contact_id, soort, dag) values ($1, 'terugbellen', '2026-10-20')`, [id]);
      await db.query(`insert into public.dagplannen (dag, contact_ids) values ('2026-10-13', array[$1::uuid])`, [id]);
      await db.query(`insert into public.donna_overzichten (dag, tekst) values ('2026-10-13', 'Overzicht')`);
    });
    for (const t of ['planningskeuzes', 'belverboden', 'opvolgacties', 'dagplannen', 'donna_overzichten']) {
      const r = await als(B, () => db.query(`select * from public.${t}`));
      expect(r.rows, t).toEqual([]);
      const eigen = await als(A, () => db.query(`select * from public.${t}`));
      expect(eigen.rows.length, t).toBe(1);
    }
  });

  it('per gebruiker maximaal één dagplan per dag', async () => {
    await expect(als(A, () => db.query(`insert into public.dagplannen (dag, contact_ids) values ('2026-10-13', '{}')`))).rejects.toThrow();
  });

  it('uitstellen vereist een einddatum', async () => {
    await als(A, async () => {
      const { rows } = await db.query<{ id: string }>(`select id from public.contacten limit 1`);
      await expect(db.query(`insert into public.planningskeuzes (contact_id, soort) values ($1, 'uitstellen')`, [rows[0]!.id])).rejects.toThrow();
    });
  });
});

describe('toegangsregels voor contactstrategie (fase 3b)', () => {
  it('gebruiker B ziet geen haken of contactvoorkeuren van A; berichten zijn toegelaten uitkomsten', async () => {
    await als(A, async () => {
      const { rows } = await db.query<{ id: string }>(`insert into public.contacten (achternaam) values ('Haak') returning id`);
      const id = rows[0]!.id;
      await db.query(`insert into public.waardehaken (contact_id, soort, onderwerp) values ($1, 'persoonlijk', 'Verjaardag')`, [id]);
      await db.query(`insert into public.contactvoorkeuren (contact_id, kanaal) values ($1, 'mail')`, [id]);
      await db.query(`insert into public.belpogingen (contact_id, uitkomst, kanaal, is_inhoudelijk) values ($1, 'bericht_verstuurd', 'sms', false)`, [id]);
      await expect(db.query(`insert into public.belpogingen (contact_id, uitkomst, kanaal, is_inhoudelijk) values ($1, 'bericht_verstuurd', 'duif', false)`, [id])).rejects.toThrow();
    });
    for (const t of ['waardehaken', 'contactvoorkeuren']) {
      expect((await als(B, () => db.query(`select * from public.${t}`))).rows, t).toEqual([]);
      expect((await als(A, () => db.query(`select * from public.${t}`))).rows.length, t).toBe(1);
    }
  });
});

describe('toegangsregels voor pushmeldingen', () => {
  it('gebruiker B ziet geen pushabonnementen van A; gebruikers kunnen het meldingenlogboek niet beschrijven', async () => {
    await als(A, () => db.query(`insert into public.push_abonnementen (endpoint, p256dh, auth) values ('https://push.example/abc', 'p', 'a')`));
    expect((await als(B, () => db.query('select * from public.push_abonnementen'))).rows).toEqual([]);
    expect((await als(A, () => db.query('select * from public.push_abonnementen'))).rows.length).toBe(1);
    await expect(als(A, () => db.query(`insert into public.verstuurde_meldingen (eigenaar_id, sleutel) values ($1, 'x')`, [A]))).rejects.toThrow();
  });
});

describe('importgebruiker van de ERAForce-mirror', () => {
  async function alsImport<T>(fn: () => Promise<T>): Promise<T> {
    await db.exec('set role oxpecker_import');
    try {
      return await fn();
    } finally {
      await db.exec('reset role');
    }
  }

  it('vindt de eigenaar op e-mail en schrijft ERAForce-rijen voor hem', async () => {
    await db.query(`update auth.users set email = 'a@voorbeeld.be' where id = $1`, [A]);
    const eigenaar = (await alsImport(() => db.query<{ id: string }>(`select public.import_eigenaar('A@voorbeeld.be') as id`))).rows[0]!.id;
    expect(eigenaar).toBe(A);
    await alsImport(() => db.query(`insert into public.contacten (eigenaar_id, achternaam, bron, extern_id) values ($1, 'Mirror', 'eraforce_mirror', '00Q000000000001')`, [A]));
    const r = await als(A, () => db.query<{ achternaam: string }>(`select achternaam from public.contacten where bron = 'eraforce_mirror'`));
    expect(r.rows).toEqual([{ achternaam: 'Mirror' }]);
  });

  it('kan geen lokale of testgegevens lezen of wijzigen', async () => {
    const zichtbaar = (await alsImport(() => db.query<{ bron: string }>('select bron from public.contacten'))).rows.map((x) => x.bron);
    expect(new Set(zichtbaar)).toEqual(new Set(['eraforce_mirror']));
    await alsImport(() => db.query(`update public.contacten set achternaam = 'Gewijzigd' where bron <> 'eraforce_mirror'`));
    expect((await als(A, () => db.query(`select 1 from public.contacten where achternaam = 'Gewijzigd'`))).rows).toEqual([]);
    await expect(alsImport(() => db.query(`insert into public.contacten (eigenaar_id, achternaam, bron) values ($1, 'X', 'lokaal')`, [A]))).rejects.toThrow();
    await expect(alsImport(() => db.query('select * from public.belpogingen'))).rejects.toThrow();
    await expect(alsImport(() => db.query('select * from public.instellingen'))).rejects.toThrow();
  });
});
