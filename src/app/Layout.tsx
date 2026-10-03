import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useApp, type Melding } from './context';

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
      {fout && (
        <div className="foutmelding" role="alert">
          {fout}
        </div>
      )}
      <main className="pagina">{children}</main>
      {melding && <Toast melding={melding} sluit={sluitMelding} />}
      <nav className="onderbalk" aria-label="Hoofdmenu">
        <NavLink to="/" end>
          <span aria-hidden>📅</span>
          Vandaag
        </NavLink>
        <NavLink to="/contacten">
          <span aria-hidden>👥</span>
          Contacten
        </NavLink>
        <NavLink to="/instellingen">
          <span aria-hidden>⚙️</span>
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
