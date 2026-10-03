import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from './context';

export function Layout({ children, fout }: { children: ReactNode; fout: string | null }) {
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
