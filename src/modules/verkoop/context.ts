import { createContext, useContext, useRef } from 'react';
import type { Medewerker } from '../../domain/verkoop/model';
import type { VerkoopStaat, Wijziging } from '../../domain/verkoop/staat';

export interface VerkoopApp {
  staat: VerkoopStaat;
  ik: Medewerker;
  opslagSoort: 'geheugen' | 'lokaal' | 'gedeeld';
  laatstGeladen: Date | null;
  fout: string | null;
  /** Bewaart met versiecontrole. false = niet bewaard (conflict of fout); de app toont dan zelf een melding. */
  bewaar(w: Wijziging[], melding?: string): Promise<boolean>;
  herlaad(): Promise<void>;
  toon(tekst: string, fout?: boolean): void;
  wisselProfiel(): void;
  reset(): Promise<void>;
}

export const VerkoopContext = createContext<VerkoopApp | null>(null);

export function useVerkoop(): VerkoopApp {
  const v = useContext(VerkoopContext);
  if (!v) throw new Error('useVerkoop buiten VerkoopContext');
  return v;
}

/**
 * Zet de versies vast op het moment dat een formulier of blad opent. Bewaren gebeurt dan tegen die versies: wijzigde een
 * collega intussen iets (ook al is het scherm al ververst), dan volgt een conflict in plaats van stil overschrijven.
 * Eigen tussentijdse bewaringen (bv. de claim) worden met `geef` doorgerekend.
 */
export function useVastgezet(staat: VerkoopStaat): { staat: VerkoopStaat; geef: (w: Wijziging[]) => void } {
  const ref = useRef<Map<string, number> | null>(null);
  ref.current ??= new Map(staat.versies);
  const versies = ref.current;
  return {
    staat: { ...staat, versies },
    geef: (w) => {
      for (const x of w) versies.set(`${x.soort}/${x.id}`, (x.verwachteVersie ?? 0) + 1);
    },
  };
}
