import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './app/App';

// Aparte demo-build van de verkoopmodule (VITE_APP=verkoop-demo): dezelfde code, eigen gegevens en configuratie.
// In de gewone app is de module niet actief en wordt ze niet geladen.
// De vergelijking is bij het bouwen al gekend, zodat de demo-code niet in de gewone app terechtkomt.
const VerkoopDemoApp =
  import.meta.env.VITE_APP === 'verkoop-demo' ? lazy(() => import('./modules/verkoop/VerkoopDemoApp').then((m) => ({ default: m.VerkoopDemoApp }))) : null;
// Montserrat: gratis alternatief voor ERA's huislettertype Gotham, in de app gebundeld (geen verzoek naar Google).
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/700.css';
import '@fontsource/montserrat/800.css';
import '@fontsource/montserrat/900.css';
import './app/styles.css';

// HashRouter: werkt op GitHub Pages zonder serverconfiguratie (adressen zoals .../#/contact/123).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      {VerkoopDemoApp ? (
        <Suspense fallback={<main className="pagina gecentreerd">Demo laden…</main>}>
          <VerkoopDemoApp />
        </Suspense>
      ) : (
        <App />
      )}
    </HashRouter>
  </StrictMode>,
);
