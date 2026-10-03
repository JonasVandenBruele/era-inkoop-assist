import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { genereerTestdata } from '../../../fixtures/testdata';
import { leesInstellingen, type Instellingen } from '../settings/schema';
import * as m from './mappers';
import type { Gegevens, Store } from './store';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const sleutel = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseGeconfigureerd = Boolean(url && sleutel);

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!url || !sleutel) throw new Error('Supabase is niet geconfigureerd (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  client ??= createClient(url, sleutel, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

/** Gooit een begrijpelijke fout als Supabase iets weigert. */
function controleer<T>(r: { data: T | null; error: { message: string } | null }, wat: string): T {
  if (r.error) throw new Error(`${wat} mislukt: ${r.error.message}`);
  return r.data as T;
}

/** Testdata-tabellen in volgorde van afhankelijkheid (ouders eerst). */
const VOLGORDE = ['bronnen', 'contacten', 'panden', 'contact_pand', 'bronactiviteiten', 'afspraken', 'belpogingen'] as const;

export function maakSupabaseStore(gebruikerId: string): Store {
  const sb = supabase();

  const alles = async (tabel: string) => {
    // Kleine dataset (één gebruiker): alles in één keer, met een ruime bovengrens.
    const r = await sb.from(tabel).select('*').limit(10000);
    return controleer(r, `Laden van ${tabel}`) as Record<string, unknown>[];
  };

  return {
    soort: 'supabase',

    async laadGegevens(): Promise<Gegevens> {
      const [contacten, panden, contactPanden, activiteiten, afspraken, belpogingen, bronnen] = await Promise.all(
        ['contacten', 'panden', 'contact_pand', 'bronactiviteiten', 'afspraken', 'belpogingen', 'bronnen'].map(alles),
      );
      return {
        contacten: contacten!.map(m.contactNaarModel),
        panden: panden!.map(m.pandNaarModel),
        contactPanden: contactPanden!.map(m.contactPandNaarModel),
        activiteiten: activiteiten!.map(m.activiteitNaarModel),
        afspraken: afspraken!.map(m.afspraakNaarModel),
        belpogingen: belpogingen!.map(m.belpogingNaarModel),
        bronnen: bronnen!.map(m.bronNaarModel),
      };
    },

    async laadInstellingen() {
      const r = await sb.from('instellingen').select('document').maybeSingle();
      return leesInstellingen(controleer(r, 'Laden van instellingen')?.document);
    },

    async bewaarInstellingen(i: Instellingen) {
      const r = await sb.from('instellingen').upsert({ eigenaar_id: gebruikerId, document: i, bijgewerkt_op: new Date().toISOString() });
      controleer(r, 'Bewaren van instellingen');
    },

    async herlaadTestdata(testdatum: string) {
      // 1. Enkel testrijen verwijderen (kinderen eerst). Echte gegevens blijven staan.
      for (const tabel of [...VOLGORDE].reverse()) {
        controleer(await sb.from(tabel).delete().eq('is_testdata', true), `Opruimen van ${tabel}`);
      }
      // 2. Nieuwe testdata voor deze datum, met ID's die uniek zijn voor deze gebruiker.
      const t = genereerTestdata({ testdatum, idPrefix: gebruikerId });
      const rijen: Record<(typeof VOLGORDE)[number], object[]> = {
        bronnen: t.bronnen.map(m.bronNaarRij),
        contacten: t.contacten.map(m.contactNaarRij),
        panden: t.panden.map(m.pandNaarRij),
        contact_pand: t.contactPanden.map(m.contactPandNaarRij),
        bronactiviteiten: t.activiteiten.map(m.activiteitNaarRij),
        afspraken: t.afspraken.map(m.afspraakNaarRij),
        belpogingen: t.belpogingen.map(m.belpogingNaarRij),
      };
      for (const tabel of VOLGORDE) {
        // upsert: een onderbroken vorige poging geeft geen dubbele rijen.
        controleer(await sb.from(tabel).upsert(rijen[tabel]), `Laden van testdata in ${tabel}`);
      }
    },
  };
}
