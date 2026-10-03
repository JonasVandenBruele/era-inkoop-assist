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
function controleer<T>(r: { data: T | null; error: { message: string; code?: string } | null }, wat: string): T {
  if (r.error) {
    if (r.error.code === '42P01' || /does not exist|schema cache/i.test(r.error.message)) {
      throw new Error(`${wat} mislukt: de database mist een update. Voer de nieuwste migratie uit in de Supabase SQL Editor.`);
    }
    throw new Error(`${wat} mislukt: ${r.error.message}`);
  }
  return r.data as T;
}

/** Testdata-tabellen in volgorde van afhankelijkheid (ouders eerst). */
const BRONTABELLEN = ['bronnen', 'contacten', 'panden', 'contact_pand', 'bronactiviteiten', 'afspraken', 'belpogingen'] as const;
const LOKALE_TABELLEN = ['belverboden', 'opvolgacties', 'planningskeuzes', 'dagplannen', 'donna_overzichten'] as const;

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
      const tabellen = ['contacten', 'panden', 'contact_pand', 'bronactiviteiten', 'afspraken', 'belpogingen', 'bronnen', 'opvolgacties', 'planningskeuzes', 'belverboden'];
      const [contacten, panden, contactPanden, activiteiten, afspraken, belpogingen, bronnen, opvolgacties, keuzes, belverboden] = await Promise.all(tabellen.map(alles));
      return {
        contacten: contacten!.map(m.contactNaarModel),
        panden: panden!.map(m.pandNaarModel),
        contactPanden: contactPanden!.map(m.contactPandNaarModel),
        activiteiten: activiteiten!.map(m.activiteitNaarModel),
        afspraken: afspraken!.map(m.afspraakNaarModel),
        belpogingen: belpogingen!.map(m.belpogingNaarModel),
        bronnen: bronnen!.map(m.bronNaarModel),
        opvolgacties: opvolgacties!.map(m.opvolgactieNaarModel),
        keuzes: keuzes!.map(m.keuzeNaarModel),
        belverboden: belverboden!.map(m.belverbodNaarModel),
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
      for (const tabel of [...LOKALE_TABELLEN, ...[...BRONTABELLEN].reverse()]) {
        controleer(await sb.from(tabel).delete().eq('is_testdata', true), `Opruimen van ${tabel}`);
      }
      // 2. Nieuwe testdata voor deze datum, met ID's die uniek zijn voor deze gebruiker.
      const t = genereerTestdata({ testdatum, idPrefix: gebruikerId });
      const rijen: Record<(typeof BRONTABELLEN)[number], object[]> = {
        bronnen: t.bronnen.map(m.bronNaarRij),
        contacten: t.contacten.map(m.contactNaarRij),
        panden: t.panden.map(m.pandNaarRij),
        contact_pand: t.contactPanden.map(m.contactPandNaarRij),
        bronactiviteiten: t.activiteiten.map(m.activiteitNaarRij),
        afspraken: t.afspraken.map(m.afspraakNaarRij),
        belpogingen: t.belpogingen.map(m.belpogingNaarRij),
      };
      for (const tabel of BRONTABELLEN) {
        // upsert: een onderbroken vorige poging geeft geen dubbele rijen.
        controleer(await sb.from(tabel).upsert(rijen[tabel]), `Laden van testdata in ${tabel}`);
      }
    },

    async bewaarBelresultaat(r) {
      controleer(await sb.from('belpogingen').insert(m.belpogingNaarRij(r.belpoging)), 'Bewaren van belresultaat');
      if (r.opvolgacties.length) controleer(await sb.from('opvolgacties').insert(r.opvolgacties.map(m.opvolgactieNaarRij)), 'Bewaren van opvolgactie');
      if (r.afspraken.length) controleer(await sb.from('afspraken').insert(r.afspraken.map(m.afspraakNaarRij)), 'Bewaren van afspraak');
      if (r.belverboden.length) controleer(await sb.from('belverboden').insert(r.belverboden.map(m.belverbodNaarRij)), 'Bewaren van belverbod');
    },

    async maakBelresultaatOngedaan(belpogingId, op) {
      const t = op.toISOString();
      controleer(await sb.from('opvolgacties').update({ status: 'vervallen' }).eq('belpoging_id', belpogingId), 'Ongedaan maken (opvolgactie)');
      controleer(await sb.from('belverboden').update({ ingetrokken_op: t }).eq('belpoging_id', belpogingId).is('ingetrokken_op', null), 'Ongedaan maken (belverbod)');
      controleer(await sb.from('afspraken').delete().eq('belpoging_id', belpogingId).eq('bron', 'lokaal'), 'Ongedaan maken (afspraak)');
      controleer(await sb.from('belpogingen').update({ ongedaan_op: t }).eq('id', belpogingId), 'Ongedaan maken');
    },

    async bewaarKeuze(k) {
      controleer(await sb.from('planningskeuzes').insert(m.keuzeNaarRij(k)), 'Bewaren van keuze');
    },

    async maakKeuzeOngedaan(id, op) {
      controleer(await sb.from('planningskeuzes').update({ ongedaan_op: op.toISOString() }).eq('id', id), 'Herstellen van keuze');
    },

    async trekBelverbodIn(id, op) {
      controleer(await sb.from('belverboden').update({ ingetrokken_op: op.toISOString() }).eq('id', id), 'Intrekken van belverbod');
    },

    async maakContact(c) {
      controleer(await sb.from('contacten').insert(m.contactNaarRij(c)), 'Aanmaken van contact');
    },

    async laadDagplan(dag) {
      const r = controleer(await sb.from('dagplannen').select('*').eq('dag', dag).maybeSingle(), 'Laden van dagplan');
      return r ? m.dagplanNaarModel(r as Record<string, unknown>) : null;
    },

    async bewaarDagplan(p) {
      // ignoreDuplicates: als er al een plan voor die dag bestaat (bv. op een ander toestel), blijft dat staan.
      controleer(await sb.from('dagplannen').upsert(m.dagplanNaarRij(p), { onConflict: 'eigenaar_id,dag', ignoreDuplicates: true }), 'Vastleggen van dagplan');
    },

    async laadDonnaOverzicht(dag) {
      const r = controleer(await sb.from('donna_overzichten').select('*').eq('dag', dag).maybeSingle(), 'Laden van Donna-overzicht');
      return r ? m.donnaNaarModel(r as Record<string, unknown>) : null;
    },

    async bewaarDonnaOverzicht(o) {
      controleer(await sb.from('donna_overzichten').upsert(m.donnaNaarRij(o), { onConflict: 'eigenaar_id,dag' }), 'Bewaren van Donna-overzicht');
    },
  };
}
