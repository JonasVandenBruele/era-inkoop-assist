import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { maakKlok } from '../core/clock';
import { maakDemoStore } from '../core/db/demoStore';
import { gebruiktEchteData, kiesGegevens, leegGegevens, type Gegevens, type Store } from '../core/db/store';
import { maakSupabaseStore, supabase, supabaseGeconfigureerd } from '../core/db/supabaseStore';
import type { Instellingen } from '../core/settings/schema';
import { AppContext, type AppStaat, type LopendeOproep, type Melding as MeldingType } from './context';
import { NaHetBellen } from '../modules/dagplanner/NaHetBellen';
import { verwerkBelresultaat } from '../domain/belresultaat';
import type { Contact } from '../domain/model';
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
  const [alleGegevens, setGegevens] = useState<Gegevens>(leegGegevens());
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(true);
  const [melding, setMelding] = useState<MeldingType | null>(null);
  const [dataVersie, setDataVersie] = useState(0);
  const [oproep, setOproep] = useState<LopendeOproep | null>(() => leesOproep());

  // Bij terugkeer in de app na een oproep: vraag "hoe ging het?" (maximaal 3 uur na het starten).
  useEffect(() => {
    const bijTerugkeer = () => {
      if (document.visibilityState !== 'visible') return;
      setOproep((o) => (o && !o.vraag && Date.now() - o.sinds > 3000 && Date.now() - o.sinds < 3 * 3600_000 ? bewaarOproep({ ...o, vraag: true }) : o));
    };
    document.addEventListener('visibilitychange', bijTerugkeer);
    window.addEventListener('focus', bijTerugkeer);
    return () => {
      document.removeEventListener('visibilitychange', bijTerugkeer);
      window.removeEventListener('focus', bijTerugkeer);
    };
  }, []);

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
  // Echte (ERAForce) gegevens en testdata worden nooit samen getoond; met echte gegevens geldt de echte datum.
  const echt = instellingen ? gebruiktEchteData(alleGegevens, instellingen) : false;
  const gegevens = useMemo(() => kiesGegevens(alleGegevens, echt), [alleGegevens, echt]);
  const testdatum = (import.meta.env.VITE_TESTDATUM as string | undefined) || (echt ? null : instellingen?.testdatum);
  const klok = useMemo(() => maakKlok(testdatum), [testdatum]);

  const staat = useMemo<AppStaat | null>(() => {
    if (!instellingen) return null;
    return {
      store,
      instellingen,
      klok,
      gegevens,
      gebruikerEmail: email,
      echteData: echt,
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
        setDataVersie((v) => v + 1);
        await herlaad();
      },
      async afmelden() {
        if (store.soort === 'supabase') await supabase().auth.signOut();
      },

      dataVersie,
      async registreerBelresultaat(invoer) {
        const r = verwerkBelresultaat({ ...invoer, tijdstip: klok.nu(), maakId: () => crypto.randomUUID() });
        await store.bewaarBelresultaat(r);
        await herlaad();
        return r;
      },
      async maakBelresultaatOngedaan(id) {
        await store.maakBelresultaatOngedaan(id, klok.nu());
        await herlaad();
      },
      async kies(contactId, soort, totDag) {
        const contact = gegevens.contacten.find((c) => c.id === contactId);
        const id = crypto.randomUUID();
        await store.bewaarKeuze({
          id,
          contactId,
          soort,
          voorDag: soort === 'uitstellen' ? null : klok.vandaag(),
          totDag: soort === 'uitstellen' ? (totDag ?? null) : null,
          aangemaaktOp: klok.nu(),
          ongedaanOp: null,
          isTestdata: contact?.isTestdata ?? false,
        });
        await herlaad();
        const tekst = { vastpinnen: 'Vastgepind voor vandaag', vandaag_overslaan: 'Vandaag overgeslagen — morgen weer zichtbaar', uitstellen: `Uitgesteld tot ${totDag}` }[soort];
        setMelding({
          tekst,
          ongedaan: async () => {
            await store.maakKeuzeOngedaan(id, klok.nu());
            await herlaad();
          },
        });
      },
      async herstelKeuze(id) {
        await store.maakKeuzeOngedaan(id, klok.nu());
        await herlaad();
      },
      async trekBelverbodIn(id) {
        await store.trekBelverbodIn(id, klok.nu());
        await herlaad();
      },
      async maakTijdelijkContact(n) {
        const nu = klok.nu();
        const contact: Contact = {
          id: crypto.randomUUID(),
          bron: 'lokaal',
          externId: null,
          gebeurdOp: nu,
          gewijzigdInBronOp: null,
          geimporteerdOp: nu,
          // In testmodus hoort een tijdelijk contact bij de testdata (en verdwijnt het bij een reset).
          isTestdata: !echt,
          aanhef: n.aanhef,
          voornaam: n.voornaam,
          achternaam: n.achternaam,
          telefoons: n.telefoon ? [{ nummer: n.telefoon, label: 'gsm' }] : [],
          email: null,
          straat: null,
          postcode: null,
          gemeente: n.gemeente,
          statusBron: 'nieuwe_lead',
          faseBron: null,
          tijdshorizonBron: null,
          aanspreekvormBron: null,
          herkomstContact: n.notitie,
          nietBellenBron: false,
          aangemaaktInBronOp: nu,
          isLokaalTijdelijk: true,
        };
        await store.maakContact(contact);
        await store.bewaarKeuze({ id: crypto.randomUUID(), contactId: contact.id, soort: 'vastpinnen', voorDag: klok.vandaag(), totDag: null, aangemaaktOp: nu, ongedaanOp: null, isTestdata: !echt });
        await herlaad();
        return contact;
      },
      toon: setMelding,

      async bewaarHaak(h) {
        const contact = h.contactId ? gegevens.contacten.find((c) => c.id === h.contactId) : null;
        await store.bewaarHaak({ ...h, id: crypto.randomUUID(), aangemaaktOp: klok.nu(), isTestdata: contact?.isTestdata ?? !echt });
        await herlaad();
      },
      async verwijderHaak(id) {
        await store.verwijderHaak(id);
        await herlaad();
      },
      oproep,
      startOproep(contactId, simuleer = false) {
        setOproep(bewaarOproep({ contactId, sinds: Date.now(), vraag: simuleer }));
      },
      sluitOproep() {
        setOproep(bewaarOproep(null));
      },
      async bewaarVoorkeur(v) {
        const contact = gegevens.contacten.find((c) => c.id === v.contactId);
        await store.bewaarVoorkeur({ ...v, isTestdata: contact?.isTestdata ?? false });
        await herlaad();
      },
    };
  }, [store, instellingen, klok, gegevens, echt, email, herlaad, dataVersie, oproep]);

  if (bezig || !staat) return <Melding tekst={fout ? `Er ging iets mis: ${fout}` : 'Gegevens laden…'} />;

  return (
    <AppContext.Provider value={staat}>
      <Layout fout={fout} melding={melding} sluitMelding={() => setMelding(null)}>
        <Routes>
          <Route path="/" element={<Vandaag />} />
          <Route path="/contacten" element={<Contacten />} />
          <Route path="/contact/:id" element={<ContactPagina />} />
          <Route path="/instellingen" element={<InstellingenPagina />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <NaHetBellen />
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

const OPROEP_SLEUTEL = 'dagplanner.lopendeOproep';
function leesOproep(): LopendeOproep | null {
  try {
    const t = localStorage.getItem(OPROEP_SLEUTEL);
    return t ? (JSON.parse(t) as LopendeOproep) : null;
  } catch {
    return null;
  }
}
/** Bewaart de lopende oproep ook in localStorage: iOS kan de app herladen terwijl je belt. */
function bewaarOproep(o: LopendeOproep | null): LopendeOproep | null {
  try {
    if (o) localStorage.setItem(OPROEP_SLEUTEL, JSON.stringify(o));
    else localStorage.removeItem(OPROEP_SLEUTEL);
  } catch {
    /* privémodus: enkel in het geheugen */
  }
  return o;
}
