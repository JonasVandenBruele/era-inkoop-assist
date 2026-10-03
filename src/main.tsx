import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './app/App';
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
      <App />
    </HashRouter>
  </StrictMode>,
);
