import { describe, expect, it } from 'vitest';
import { marktsignaalNaarModel } from './mappers';

describe('datumkolommen', () => {
  it('node-pg geeft een Date op lokale middernacht: geen dag te vroeg (taak op 19/11 bleef 18/11)', () => {
    const rij = { id: 'x', contact_id: 'c', bron: 'immoweb', extern_id: '1', status: 'te_koop', eerst_gezien_op: '2026-10-06T17:00:00Z', laatst_gezien_op: '2026-10-06T17:00:00Z' };
    expect(marktsignaalNaarModel({ ...rij, online_sinds: new Date(2026, 10, 19) }).onlineSinds).toBe('2026-11-19');
    expect(marktsignaalNaarModel({ ...rij, online_sinds: '2026-11-19' }).onlineSinds).toBe('2026-11-19');
  });
});
