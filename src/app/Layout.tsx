import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useApp, type Melding } from './context';
import { MERK } from './merk';

export function Layout({ children, fout, melding, sluitMelding }: { children: ReactNode; fout: string | null; melding: Melding | null; sluitMelding: () => void }) {
  const { store, gegevens, klok } = useApp();
  const heeftTestdata = gegevens.contacten.some((c) => c.isTestdata) || store.soort === 'demo';

  return (
    <div className="app">
      {heeftTestdata && (
        <div className="testdata-strook" role="status">
          TESTDATA — alle namen en nummers zijn verzonnen
          {store.soort === 'demo' && ' · lokale demo zonder login'}
          {klok.isTestklok && ' · testdatum actief'}
        </div>
      )}
      <header className={`appbalk ${heeftTestdata ? '' : 'zonder-strook'}`}>
        <span className="appnaam">{MERK.naam}</span>
        <span className="appondertitel">{MERK.ondertitel}</span>
      </header>
      {fout && (
        <div className="foutmelding" role="alert">
          {fout}
        </div>
      )}
      <main className="pagina">{children}</main>
      {melding && <Toast melding={melding} sluit={sluitMelding} />}
      <nav className="onderbalk" aria-label="Hoofdmenu">
        <NavLink to="/" end>
          <Icoon pad="M4 6h16v14H4zM4 10h16M9 3v4M15 3v4" />
          Vandaag
        </NavLink>
        <NavLink to="/contacten">
          <Icoon pad="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6" />
          Contacten
        </NavLink>
        <NavLink to="/instellingen">
          <Icoon pad="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          Instellingen
        </NavLink>
      </nav>
    </div>
  );
}

function Toast({ melding, sluit }: { melding: Melding; sluit: () => void }) {
  const [bezig, setBezig] = useState(false);
  useEffect(() => {
    const t = setTimeout(sluit, melding.ongedaan ? 10_000 : 5_000);
    return () => clearTimeout(t);
  }, [melding, sluit]);

  return (
    <div className={`toast ${melding.fout ? 'fout' : ''}`} role="status" aria-live="polite">
      <span>{melding.tekst}</span>
      {melding.ongedaan && (
        <button
          className="knop tekstknop"
          disabled={bezig}
          onClick={async () => {
            setBezig(true);
            try {
              await melding.ongedaan!();
            } finally {
              sluit();
            }
          }}
        >
          Ongedaan maken
        </button>
      )}
      <button className="knop tekstknop sluit" onClick={sluit} aria-label="Sluiten">
        ✕
      </button>
    </div>
  );
}

/** Eenvoudig lijnicoon (24×24), neemt de tekstkleur over. */
function Icoon({ pad }: { pad: string }) {
  return (
    <svg className="icoon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={pad} />
    </svg>
  );
}
