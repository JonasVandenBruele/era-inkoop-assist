import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { maakKlok } from '../core/clock';
import { maakDemoStore } from '../core/db/demoStore';
import { leegGegevens, type Gegevens, type Store } from '../core/db/store';
import { maakSupabaseStore, supabase, supabaseGeconfigureerd } from '../core/db/supabaseStore';
import type { Instellingen } from '../core/settings/schema';
import { AppContext, type AppStaat } from './context';
import { Layout } from './Layout';
import { Login } from './Login';
import { InstellingenPagina } from './InstellingenPagina';
import { Vandaag } from '../modules/dagplanner/Vandaag';
import { ContactPagina } from '../modules/dagplanner/ContactPagina';
import { Contacten } from '../modules/dagplanner/Contacten';

export function App() {
  const [sessie, setSessie] = useState<Session | null | 'laden'>(supabaseGeconfigureerd ? 'laden' : null);

  useEffect(() => {
    if (!supabaseGeconfigureerd) return;
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => setSessie(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSessie(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const gebruikerId = sessie && sessie !== 'laden' ? sessie.user.id : null;
  // Eén store per gebruiker; niet opnieuw maken bij elke tokenvernieuwing.
  const store = useMemo(() => (gebruikerId ? maakSupabaseStore(gebruikerId) : maakDemoStore()), [gebruikerId]);

  if (sessie === 'laden') return <Melding tekst="Even laden…" />;
  if (supabaseGeconfigureerd && !sessie) return <Login />;

  return <IngelogdeApp key={gebruikerId ?? 'demo'} store={store} email={sessie ? (sessie.user.email ?? null) : null} />;
}

function IngelogdeApp({ store, email }: { store: Store; email: string | null }) {
  const [instellingen, setInstellingen] = useState<Instellingen | null>(null);
  const [gegevens, setGegevens] = useState<Gegevens>(leegGegevens());
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(true);

  const herlaad = useCallback(async () => {
    try {
      setFout(null);
      setGegevens(await store.laadGegevens());
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    }
  }, [store]);

  useEffect(() => {
    (async () => {
      try {
        setInstellingen(await store.laadInstellingen());
        await herlaad();
      } catch (e) {
        setFout(e instanceof Error ? e.message : String(e));
      } finally {
        setBezig(false);
      }
    })();
  }, [store, herlaad]);

  // Een vaste testdatum uit de omgeving (VITE_TESTDATUM) gaat voor op de instelling.
  // De klok wordt enkel opnieuw gemaakt als de testdatum wijzigt, zodat de tijd binnen de testdag verder tikt.
  const testdatum = (import.meta.env.VITE_TESTDATUM as string | undefined) || instellingen?.testdatum;
  const klok = useMemo(() => maakKlok(testdatum), [testdatum]);

  const staat = useMemo<AppStaat | null>(() => {
    if (!instellingen) return null;
    return {
      store,
      instellingen,
      klok,
      gegevens,
      gebruikerEmail: email,
      herlaad,
      async wijzigInstellingen(nieuw) {
        const testdatumGewijzigd = nieuw.testdatum !== instellingen.testdatum;
        await store.bewaarInstellingen(nieuw);
        setInstellingen(nieuw);
        if (testdatumGewijzigd && nieuw.testdatum) await store.herlaadTestdata(nieuw.testdatum);
        await herlaad();
      },
      async herlaadTestdata() {
        await store.herlaadTestdata(instellingen.testdatum ?? klok.nu().toISOString().slice(0, 16));
        await herlaad();
      },
      async afmelden() {
        if (store.soort === 'supabase') await supabase().auth.signOut();
      },
    };
  }, [store, instellingen, klok, gegevens, email, herlaad]);

  if (bezig || !staat) return <Melding tekst={fout ? `Er ging iets mis: ${fout}` : 'Gegevens laden…'} />;

  return (
    <AppContext.Provider value={staat}>
      <Layout fout={fout}>
        <Routes>
          <Route path="/" element={<Vandaag />} />
          <Route path="/contacten" element={<Contacten />} />
          <Route path="/contact/:id" element={<ContactPagina />} />
          <Route path="/instellingen" element={<InstellingenPagina />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </AppContext.Provider>
  );
}

function Melding({ tekst }: { tekst: string }) {
  return (
    <main className="pagina gecentreerd">
      <p>{tekst}</p>
    </main>
  );
}
