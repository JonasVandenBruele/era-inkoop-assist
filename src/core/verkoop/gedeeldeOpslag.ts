// Gedeelde demo-opslag in Supabase. Volledig gescheiden van de productiegegevens:
//  - eigen schema verkoop_demo, niet rechtstreeks bereikbaar (geen tabelrechten voor de app);
//  - enkel drie functies (laden, bewaren, reset), die een geldige toegangscode vragen;
//  - de functies kunnen niets anders lezen of schrijven dan de demo-records van die code.
// Er wordt geen gebruikerslogin en geen productiesleutel gebruikt: enkel het publieke projectadres en de publieke sleutel,
// die ook al in de gepubliceerde app staan.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { OpgeslagenRecord, Wijziging } from '../../domain/verkoop/staat';
import type { BewaarResultaat, VerkoopOpslag } from './opslag';

export class OngeldigeCode extends Error {
  constructor() {
    super('Deze toegangscode is niet (meer) geldig.');
  }
}

interface RuwRecord {
  soort: string;
  id: string;
  data: unknown;
  versie: number;
  bijgewerkt_op: string;
  bijgewerkt_door: string | null;
}

export function maakGedeeldeOpslag(url: string, sleutel: string, code: string): VerkoopOpslag {
  // Geen sessie bewaren: deze client meldt nooit iemand aan en mag de login van de gewone app niet raken.
  const sb: SupabaseClient = createClient(url, sleutel, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'oxpecker-verkoopdemo' } });
  const fout = (e: { message: string; code?: string }) => {
    if (/ongeldige toegangscode/i.test(e.message)) return new OngeldigeCode();
    return new Error(`Demo-opslag niet bereikbaar: ${e.message}`);
  };
  return {
    soort: 'gedeeld',
    async laad() {
      const { data, error } = await sb.rpc('verkoop_demo_laad', { p_code: code });
      if (error) throw fout(error);
      return ((data as RuwRecord[] | null) ?? []).map(
        (r) => ({ soort: r.soort, id: r.id, data: r.data, versie: r.versie, bijgewerktOp: r.bijgewerkt_op, bijgewerktDoor: r.bijgewerkt_door }) as OpgeslagenRecord,
      );
    },
    async bewaar(w: Wijziging[], door: string): Promise<BewaarResultaat> {
      const { data, error } = await sb.rpc('verkoop_demo_bewaar', {
        p_code: code,
        p_door: door,
        p_wijzigingen: w.map((x) => ({ soort: x.soort, id: x.id, data: x.data, verwachte_versie: x.verwachteVersie })),
      });
      if (error) throw fout(error);
      const conflicten = (data as { soort: string; id: string }[] | null) ?? [];
      return conflicten.length ? { ok: false, conflicten } : { ok: true };
    },
    async reset(door: string) {
      const { error } = await sb.rpc('verkoop_demo_reset', { p_code: code, p_door: door });
      if (error) throw fout(error);
    },
  };
}
