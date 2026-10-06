// Fictieve nummers en berichten (geen echte klantgegevens).
import { describe, expect, it } from 'vitest';
import { aanspreekvormVan, coreDataDatum, dagTekst, detecteerTaal, nummerUitJid, nummersVan, perDag, waNummer } from './whatsapp';

describe('WhatsApp → Oxpecker', () => {
  it('nummers in de vorm van WhatsApp', () => {
    expect(waNummer('0470 12 34 56')).toBe('32470123456');
    expect(waNummer('+32 470 12 34 56')).toBe('32470123456');
    expect(waNummer('0032470123456')).toBe('32470123456');
    expect(waNummer('+31 6 12345678')).toBe('31612345678');
    expect(waNummer('123')).toBeNull();
    expect(nummersVan([{ nummer: '0470 12 34 56', label: 'gsm' }, { nummer: '+32470123456', label: 'vast' }])).toEqual(['32470123456']);
  });

  it('enkel 1-op-1-chats met een nummer', () => {
    expect(nummerUitJid('32470123456@s.whatsapp.net')).toBe('32470123456');
    expect(nummerUitJid('32470123456-1600000000@g.us')).toBeNull();
    expect(nummerUitJid('123456789012345@lid')).toBeNull();
    expect(nummerUitJid(null)).toBeNull();
  });

  it('Core Data-tijd', () => {
    expect(coreDataDatum(0).toISOString()).toBe('2001-01-01T00:00:00.000Z');
  });

  it('per dag samenvatten, zonder inhoud', () => {
    const t = (iso: string, vanMij: boolean) => ({ tijd: new Date(iso), vanMij, tekst: 'geheim' });
    const dagen = perDag([t('2026-10-05T08:00:00Z', true), t('2026-10-05T09:00:00Z', false), t('2026-10-06T07:00:00Z', true), t('2026-10-05T22:30:00Z', true)]);
    // 22:30 UTC is al 6/10 in Brussel (00:30).
    expect(dagen.map((d) => [d.dag, d.vanMij, d.vanKlant])).toEqual([
      ['2026-10-06', 2, 0],
      ['2026-10-05', 1, 1],
    ]);
    expect(dagTekst(dagen[0]!)).toBe('WhatsApp: 2 van jou (nog geen reactie)');
    expect(dagTekst(dagen[1]!)).toBe('WhatsApp: 1 van jou, 1 van de klant');
    expect(dagen.map(dagTekst).join(' ')).not.toContain('geheim');
  });

  it('taal en aanspreking uit de berichten', () => {
    expect(detecteerTaal(['Bonjour Marie, pourriez-vous me rappeler? Merci, Jonas', 'Oui je vous rappelle'])).toBe('fr');
    expect(detecteerTaal(['Hi Gary, thank you for your message, give me a call'])).toBe('en');
    expect(detecteerTaal(['Dag Sigrid, zou je me even kunnen terugbellen? Bedankt!'])).toBe('nl');
    expect(detecteerTaal(['ok', null])).toBeNull();
    expect(aanspreekvormVan(['Dag Frank, wanneer zou het voor u passen? Mvg'])).toBe('u');
    expect(aanspreekvormVan(['Hi Bart, neem je tijd, geef me gerust een belletje'])).toBe('je');
    expect(aanspreekvormVan(['Top!'])).toBeNull();
  });
});
