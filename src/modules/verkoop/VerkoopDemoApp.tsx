// Demo van de verkoopmodule: dezelfde schermen en logica als later met echte gegevens, maar met de fictieve bron
// (fixtures/verkoop.ts) en een aparte demo-opslag. Geen login: een toegangscode uit de gedeelde link + een demoprofiel.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { MEDEWERKERS } from '../../../fixtures/verkoop';
import { demoBron } from '../../adapters/verkoop/bron';
import { dagVan } from '../../core/dates';
import { maakGedeeldeOpslag, OngeldigeCode } from '../../core/verkoop/gedeeldeOpslag';
import { maakLokaleOpslag, type VerkoopOpslag } from '../../core/verkoop/opslag';
import { bouwStaat, type OpgeslagenRecord, type Wijziging } from '../../domain/verkoop/staat';
import { VerkoopContext, type VerkoopApp } from './context';
import { VandaagBellen } from './VandaagBellen';
import { Koperspool } from './Koperspool';
import { Aanbod } from './Aanbod';
import { PandPagina } from './PandPagina';
import { KandidaatPagina } from './KandidaatPagina';
import { Kantoor } from './Kantoor';
import { Rondleiding } from './Rondleiding';
import { Icoon, ICONEN } from './ui';
import './verkoop.css';

const CODE_SLEUTEL = 'oxpecker.verkoopdemo.code';
const PROFIEL_SLEUTEL = 'oxpecker.verkoopdemo.profiel';
const VERVERS_MS = 15_000;

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const sleutel = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const gedeeldMogelijk = Boolean(url && sleutel);

function lees(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function schrijf(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* privémodus: enkel voor deze sessie */
  }
}

/** Haalt de toegangscode uit de link (…/#code=xxxx-xxxx-xxxx) en verwijdert ze meteen uit de adresbalk. */
function codeUitLink(): string | null {
  const m = /[#&?]code=([a-z0-9-]{6,40})/i.exec(window.location.hash);
  if (!m) return null;
  window.history.replaceState(null, '', `${window.location.pathname}#/`);
  return m[1]!.toLowerCase();
}

export function VerkoopDemoApp() {
  const [code, setCode] = useState<string | null>(() => {
    const uitLink = codeUitLink();
    if (uitLink) schrijf(CODE_SLEUTEL, uitLink);
    return uitLink ?? lees(CODE_SLEUTEL);
  });
  const [codeFout, setCodeFout] = useState<string | null>(null);
  const [profiel, setProfiel] = useState<string | null>(() => lees(PROFIEL_SLEUTEL));

  const opslag = useMemo<VerkoopOpslag | null>(() => {
    if (!gedeeldMogelijk) return maakLokaleOpslag();
    return code ? maakGedeeldeOpslag(url!, sleutel!, code) : null;
  }, [code]);

  if (!opslag) return <CodeScherm fout={codeFout} kies={(c) => { schrijf(CODE_SLEUTEL, c); setCodeFout(null); setCode(c); }} />;
  const ik = MEDEWERKERS.find((m) => m.id === profiel);
  if (!ik) return <ProfielScherm kies={(id) => { schrijf(PROFIEL_SLEUTEL, id); setProfiel(id); }} />;
  return (
    <DemoMetOpslag
      key={`${code}|${ik.id}`}
      opslag={opslag}
      ikId={ik.id}
      ongeldig={() => {
        schrijf(CODE_SLEUTEL, null);
        setCodeFout('Deze toegangscode werkt niet (meer). Vraag de link opnieuw op.');
        setCode(null);
      }}
      wisselProfiel={() => {
        schrijf(PROFIEL_SLEUTEL, null);
        setProfiel(null);
      }}
    />
  );
}

function DemoMetOpslag({ opslag, ikId, ongeldig, wisselProfiel }: { opslag: VerkoopOpslag; ikId: string; ongeldig: () => void; wisselProfiel: () => void }) {
  const [records, setRecords] = useState<OpgeslagenRecord[] | null>(null);
  const [laatstGeladen, setLaatstGeladen] = useState<Date | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tekst: string; fout: boolean } | null>(null);
  const [nu, setNu] = useState(() => new Date());
  const bezig = useRef(false);
  const opnieuw = useRef(false);

  const herlaad = useCallback(async () => {
    // Loopt er al een laadbeurt, dan volgt er meteen nog één: na een bewaring zijn de getoonde gegevens altijd vers.
    if (bezig.current) {
      opnieuw.current = true;
      while (bezig.current) await new Promise((r) => setTimeout(r, 50));
      if (!opnieuw.current) return;
    }
    bezig.current = true;
    opnieuw.current = false;
    try {
      const r = await opslag.laad();
      setRecords(r);
      setNu(new Date());
      setLaatstGeladen(new Date());
      setFout(null);
    } catch (e) {
      if (e instanceof OngeldigeCode) return ongeldig();
      // De laatst geladen gegevens blijven bruikbaar; de actualiteit staat zichtbaar bovenaan.
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      bezig.current = false;
    }
  }, [opslag, ongeldig]);

  useEffect(() => {
    herlaad();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') herlaad();
    }, VERVERS_MS);
    const zichtbaar = () => document.visibilityState === 'visible' && herlaad();
    document.addEventListener('visibilitychange', zichtbaar);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', zichtbaar);
    };
  }, [herlaad]);

  const vandaag = dagVan(nu);
  // Vervangbare bron: later de ERAForce-mirror (na akkoord), nu de fictieve demodataset. Eén keer per dag opnieuw.
  const basis = useMemo(() => demoBron.laad(new Date()), [vandaag]);
  const staat = useMemo(() => (records ? bouwStaat(basis, records, nu) : null), [basis, records, nu]);
  const ik = MEDEWERKERS.find((m) => m.id === ikId)!;

  const app = useMemo<VerkoopApp | null>(() => {
    if (!staat) return null;
    return {
      staat,
      ik,
      opslagSoort: opslag.soort,
      laatstGeladen,
      fout,
      herlaad,
      wisselProfiel,
      toon: (tekst, isFout = false) => setToast({ tekst, fout: isFout }),
      async bewaar(w: Wijziging[], melding?: string) {
        if (!w.length) {
          if (melding) setToast({ tekst: melding, fout: false });
          return true;
        }
        try {
          const r = await opslag.bewaar(w, ik.id);
          await herlaad();
          if (!r.ok) {
            setToast({ tekst: 'Een collega wijzigde dit net. De gegevens zijn bijgewerkt; bekijk en probeer opnieuw.', fout: true });
            return false;
          }
          if (melding) setToast({ tekst: melding, fout: false });
          return true;
        } catch (e) {
          if (e instanceof OngeldigeCode) ongeldig();
          setToast({ tekst: `Niet bewaard: ${e instanceof Error ? e.message : String(e)}`, fout: true });
          return false;
        }
      },
      async reset() {
        await opslag.reset(ik.id);
        await herlaad();
        setToast({ tekst: 'Demo opnieuw ingesteld: alle demoresultaten zijn gewist.', fout: false });
      },
    };
  }, [staat, ik, opslag, laatstGeladen, fout, herlaad, wisselProfiel, ongeldig]);

  if (!app) {
    return (
      <Kader>
        <main className="pagina gecentreerd">
          <p>{fout ? `Demo kon niet laden: ${fout}` : 'Demo laden…'}</p>
          {fout && (
            <button className="knop" onClick={herlaad}>
              Opnieuw proberen
            </button>
          )}
        </main>
      </Kader>
    );
  }

  return (
    <VerkoopContext.Provider value={app}>
      <Kader ik={ik.voornaam} wissel={wisselProfiel}>
        {(fout || app.opslagSoort !== 'gedeeld') && (
          <div className={fout ? 'foutmelding vk-balk' : 'infomelding vk-balk'} role="status">
            {fout
              ? `Geen verbinding met de demo-opslag. Je ziet de gegevens van ${laatstGeladen ? laatstGeladen.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }) : 'eerder'}. ${fout}`
              : 'Lokale demo: resultaten blijven enkel in deze browser (geen gedeelde opslag geconfigureerd).'}
          </div>
        )}
        <main className="pagina">
          <Routes>
            <Route path="/" element={<VandaagBellen />} />
            <Route path="/pool" element={<Koperspool />} />
            <Route path="/aanbod" element={<Aanbod />} />
            <Route path="/pand/:id" element={<PandPagina />} />
            <Route path="/kandidaat/:id" element={<KandidaatPagina />} />
            <Route path="/kantoor" element={<Kantoor />} />
            <Route path="/rondleiding" element={<Rondleiding />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        {toast && <Toast {...toast} sluit={() => setToast(null)} />}
        <nav className="onderbalk" aria-label="Hoofdmenu">
          <NavLink to="/" end>
            <Icoon pad={ICONEN.telefoon} />
            Bellen
          </NavLink>
          <NavLink to="/pool">
            <Icoon pad={ICONEN.mensen} />
            Koperspool
          </NavLink>
          <NavLink to="/aanbod">
            <Icoon pad={ICONEN.huis} />
            Aanbod
          </NavLink>
          <NavLink to="/kantoor">
            <Icoon pad={ICONEN.kantoor} />
            Kantoor
          </NavLink>
        </nav>
      </Kader>
    </VerkoopContext.Provider>
  );
}

function Kader({ children, ik, wissel }: { children: ReactNode; ik?: string; wissel?: () => void }) {
  const navigeer = useNavigate();
  const { pathname } = useLocation();
  // Een nieuw scherm begint bovenaan (zoals op een gewone website).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="app vk">
      <div className="testdata-strook vk-demostrook" role="status">
        DEMOMODUS — fictieve gegevens · bellen, berichten en bezoeken worden gesimuleerd
      </div>
      <header className="appbalk vk-appbalk">
        <img className="appmerk" src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width="32" height="32" />
        <span className="appnaam">Oxpecker</span>
        <span className="appondertitel">Verkoop · demo</span>
        <span className="vk-ruimte" />
        {wissel && (
          <>
            <button className="knop tekstknop vk-hulp" onClick={() => navigeer('/rondleiding')} aria-label="Demonstratieroute">
              ?
            </button>
            <button className="vk-profielknop" onClick={wissel} aria-label={`Ingelogd als ${ik} (demo). Profiel wisselen`}>
              {ik} ▾
            </button>
          </>
        )}
      </header>
      {children}
    </div>
  );
}

function Toast({ tekst, fout, sluit }: { tekst: string; fout: boolean; sluit: () => void }) {
  useEffect(() => {
    const t = setTimeout(sluit, fout ? 8000 : 4500);
    return () => clearTimeout(t);
  }, [tekst, fout, sluit]);
  return (
    <div className={`toast ${fout ? 'fout' : ''}`} role="status" aria-live="polite">
      <span>{tekst}</span>
      <button className="knop tekstknop sluit" onClick={sluit} aria-label="Sluiten">
        ✕
      </button>
    </div>
  );
}

function CodeScherm({ fout, kies }: { fout: string | null; kies: (c: string) => void }) {
  const [waarde, setWaarde] = useState('');
  return (
    <div className="app vk">
      <div className="testdata-strook vk-demostrook">DEMOMODUS — fictieve gegevens</div>
      <main className="pagina login">
        <div className="login-merk">
          <span className="appnaam">Oxpecker</span>
          <span className="appondertitel">Verkoop · demo</span>
        </div>
        <p>Open de demo met de link die je kreeg, of vul de toegangscode in.</p>
        {fout && <p className="foutmelding">{fout}</p>}
        <form
          className="formulier"
          onSubmit={(e) => {
            e.preventDefault();
            if (waarde.trim()) kies(waarde.trim().toLowerCase());
          }}
        >
          <label>
            Toegangscode
            <input value={waarde} onChange={(e) => setWaarde(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} placeholder="xxxx-xxxx-xxxx" />
          </label>
          <button className="knop primair groot" type="submit">
            Demo openen
          </button>
        </form>
      </main>
    </div>
  );
}

function ProfielScherm({ kies }: { kies: (id: string) => void }) {
  return (
    <div className="app vk">
      <div className="testdata-strook vk-demostrook">DEMOMODUS — fictieve gegevens</div>
      <main className="pagina login">
        <div className="login-merk">
          <span className="appnaam">Oxpecker</span>
          <span className="appondertitel">Verkoop · demo</span>
        </div>
        <h1>Wie ben je?</h1>
        <p className="zacht">Kies een demoprofiel. Je kunt later altijd wisselen (rechtsboven). Er wordt geen account aangemaakt.</p>
        <div className="vk-profielen">
          {MEDEWERKERS.map((m) => (
            <button key={m.id} className={`knop groot ${m.id === 'm-sofie' ? '' : 'primair'}`} onClick={() => kies(m.id)}>
              {m.voornaam}
              <span className="vk-profielrol">{m.id === 'm-sofie' ? 'fictieve collega' : m.rol}</span>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
