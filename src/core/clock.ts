// Eén instelbare klok voor álle datumlogica. Gebruik nooit rechtstreeks `new Date()` in logica.
import { dagVan, vanBrusselsLokaal, type DagKey } from './dates';

export interface Klok {
  nu(): Date;
  vandaag(): DagKey;
  /** true als de klok op een vaste testdatum staat. */
  isTestklok: boolean;
}

export function systeemKlok(): Klok {
  return {
    nu: () => new Date(),
    vandaag: () => dagVan(new Date()),
    isTestklok: false,
  };
}

/**
 * Vaste testklok op een Brusselse lokale tijd, bv. "2026-10-13T07:30".
 * De tijd loopt mee vanaf het moment van aanmaken, zodat "nu" binnen de testdag verder tikt.
 */
export function testKlok(lokaal: string, meelopen = true): Klok {
  const vast = vanBrusselsLokaal(lokaal).getTime();
  const gestart = Date.now();
  const nu = () => new Date(meelopen ? vast + (Date.now() - gestart) : vast);
  return { nu, vandaag: () => dagVan(nu()), isTestklok: true };
}

/** Kies de klok: testdatum (instelling of omgevingsvariabele) of de echte tijd. */
export function maakKlok(testdatum: string | null | undefined): Klok {
  return testdatum ? testKlok(testdatum) : systeemKlok();
}
