/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSIE__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_TESTDATUM?: string;
  /** Salesforce-domein van ERAForce, bv. xxx.lightning.force.com (repo-variabele, niet in de code). */
  readonly VITE_ERAFORCE_DOMEIN?: string;
}
