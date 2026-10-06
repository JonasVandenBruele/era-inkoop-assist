import { describe, expect, it } from 'vitest';
import { officieleStraat, adresSleutel, adresSleutelVan, gebouwSleutel, normBus, normStraat, splitsStraatregel, vergelijkAdres } from './adres';

describe('adressen normaliseren', () => {
  it('postcode beslist, de gemeentenaam telt niet mee', () => {
    const a = adresSleutelVan({ straat: 'molenstraat 90', postcode: '3078' });
    expect(adresSleutelVan({ straat: 'Molenstr 90', postcode: '3078' })).toBe(a);
    expect(adresSleutelVan({ straat: 'Molenstr. 90', postcode: 'B-3078' })).toBe(a);
    expect(a).toBe('molenstraat|90||3078');
    expect(adresSleutelVan({ straat: 'Molenstraat 90', postcode: '3070' })).not.toBe(a);
  });

  it('afkortingen, accenten, koppeltekens en spaties', () => {
    expect(normStraat('St.-Jansstraat')).toBe(normStraat('Sint Jansstraat'));
    expect(normStraat('Sint-Jans straat')).toBe(normStraat('sint-jansstraat'));
    expect(normStraat('Brusselsestwg')).toBe('brusselsesteenweg');
    expect(normStraat('Leuvense Stwg')).toBe('leuvensesteenweg');
    expect(normStraat('HERTOG JAN II LAAN')).toBe(normStraat('Hertog Jan II-laan'));
    expect(normStraat('Av. de Tervueren')).toBe(normStraat('Avenue de Tervueren'));
    expect(normStraat('Chée de Louvain')).toBe(normStraat('Chaussée de Louvain'));
    expect(normStraat('Rue de l’Église')).toBe(normStraat("Rue de l'Eglise"));
  });

  it('bus', () => {
    expect(normBus('bus 0.1')).toBe('1');
    expect(normBus('b1')).toBe('1');
    expect(normBus('Bte 01')).toBe('1');
    expect(normBus('B')).toBe('b');
    expect(normBus('0')).toBe('0');
    expect(normBus('')).toBe('');
  });

  it('straatregel splitsen', () => {
    expect(splitsStraatregel('Kerkstraat 33')).toEqual({ straat: 'Kerkstraat', nummer: '33', bus: null });
    expect(splitsStraatregel('Molenstr. 90 bus 2')).toEqual({ straat: 'Molenstr.', nummer: '90', bus: '2' });
    expect(splitsStraatregel('Rue Haute 12/3')).toEqual({ straat: 'Rue Haute', nummer: '12', bus: '3' });
    expect(splitsStraatregel('Lindenlaan 14 B')).toEqual({ straat: 'Lindenlaan', nummer: '14B', bus: null });
    expect(splitsStraatregel('Brouwerijstraat 48 A')).toEqual({ straat: 'Brouwerijstraat', nummer: '48A', bus: null });
    expect(splitsStraatregel('Kerkstraat')).toEqual({ straat: 'Kerkstraat', nummer: null, bus: null });
  });

  it('huis zonder bus = zelfde adres; andere bus = zelfde gebouw', () => {
    const huis = { straat: 'Kerkstraat', nummer: '33', bus: null, postcode: '3070' };
    expect(vergelijkAdres(huis, { straat: 'kerkstr', nummer: '33', bus: '', postcode: '3070' })).toBe('adres');
    expect(vergelijkAdres(huis, { straat: 'Kerkstraat', nummer: '33', bus: '1', postcode: '3070' })).toBe('adres');
    expect(vergelijkAdres({ ...huis, bus: '1' }, { ...huis, bus: '2' })).toBe('gebouw');
    expect(vergelijkAdres(huis, { ...huis, nummer: '35' })).toBeNull();
    expect(vergelijkAdres(huis, { ...huis, postcode: '3071' })).toBeNull();
  });

  it('onvolledig adres geeft geen sleutel', () => {
    expect(adresSleutel({ straat: null, nummer: '3', bus: null, postcode: '3070' })).toBe('');
    expect(adresSleutel({ straat: 'Kerkstraat', nummer: null, bus: null, postcode: '3070' })).toBe('');
    expect(gebouwSleutel({ straat: 'Kerkstraat', nummer: '3', bus: '2', postcode: '3070' })).toBe('kerkstraat|3|3070');
  });

  it('officiële straatnaam uit het Adressenregister', () => {
    const lijst = ['Lodewijk van Veltemstraat', 'Molenstraat', 'Leuvensesteenweg', 'Sint-Jansstraat', 'Kerkstraat', 'Kerkhofstraat'];
    expect(officieleStraat('Lod. van Veltemstraat', lijst)).toBe('Lodewijk van Veltemstraat');
    expect(officieleStraat('molenstr', lijst)).toBe('Molenstraat');
    expect(officieleStraat('Leuvense Stwg', lijst)).toBe('Leuvensesteenweg');
    expect(officieleStraat('St Jansstraat', lijst)).toBe('Sint-Jansstraat');
    expect(officieleStraat('Bergstraat', lijst)).toBeNull();
    expect(officieleStraat('K. straat', lijst)).toBeNull();
  });
});
