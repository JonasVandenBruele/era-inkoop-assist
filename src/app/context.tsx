import { createContext, useContext } from 'react';
import type { Klok } from '../core/clock';
import type { Gegevens, Store } from '../core/db/store';
import type { Instellingen } from '../core/settings/schema';

export interface AppStaat {
  store: Store;
  instellingen: Instellingen;
  klok: Klok;
  gegevens: Gegevens;
  gebruikerEmail: string | null;
  /** Gegevens opnieuw ophalen. */
  herlaad(): Promise<void>;
  /** Instellingen bewaren; bij een andere testdatum wordt de testdata mee verschoven. */
  wijzigInstellingen(nieuw: Instellingen): Promise<void>;
  herlaadTestdata(): Promise<void>;
  afmelden(): Promise<void>;
}

export const AppContext = createContext<AppStaat | null>(null);

export function useApp(): AppStaat {
  const s = useContext(AppContext);
  if (!s) throw new Error('useApp buiten AppContext');
  return s;
}
