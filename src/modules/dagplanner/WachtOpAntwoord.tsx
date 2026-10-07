import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../app/context';
import { UITKOMST_LABEL } from '../../app/labels';
import { uurVan } from '../../core/dates';
import type { WachtOpAntwoord as Wacht } from '../../domain/dagplan';
import { eraforceOproepLink } from '../../domain/eraforce';
import { volledigeNaam } from '../../domain/model';
import { ResultaatPaneel } from './ResultaatPaneel';

/**
 * Onderaan de bellijst: wie vandaag niet opnam of een bericht kreeg (Jonas, 6/10/2026). Belt de klant terug, dan tik je hier
 * "Belt terug" of open je hem rechtstreeks in ERAForce, zonder te zoeken.
 */
export function WachtOpAntwoordBlok({ wacht }: { wacht: Wacht[] }) {
  if (wacht.length === 0) return null;
  return (
    <div className="blok wacht-blok">
      <h3>
        Wacht op antwoord <span className="zacht">({wacht.length})</span>
      </h3>
      <p className="klein zacht">Vandaag niet opgenomen of bericht gestuurd. Belt iemand terug? "Log in ERAForce" opent een ingevulde Inkomende Oproep; "Belt terug" past je lijst aan. Anders zet de app hem zelf terug op de lijst.</p>
      <ul className="lijst">
        {wacht.map((w) => (
          <WachtKaart key={w.contact.id} w={w} />
        ))}
      </ul>
    </div>
  );
}

function WachtKaart({ w }: { w: Wacht }) {
  const { klok, startOproep } = useApp();
  const [resultaat, setResultaat] = useState(false);
  const c = w.contact;
  const laatste = w.pogingen[0]!;
  const wanneer = uurVan(laatste.tijdstip);
  const tel = c.telefoons[0];
  // Belt de klant terug: een ingevulde "Inkomende Oproep"-taak in ERAForce (zoals ERA Scout).
  const logLink = eraforceOproepLink(c, import.meta.env.VITE_ERAFORCE_DOMEIN, klok.vandaag(), 'inkomend');
  const volgende = /volgende poging ([^.;]+)|rust tot ([^.;]+)/.exec(w.detail);

  return (
    <li className="kaart belkaart wacht">
      <div className="belkaart-kop">
        <div className="belkaart-naam">
          <Link to={`/contact/${c.id}`}>
            <strong>{c.aanhef ? `${c.aanhef} ` : ''}{volledigeNaam(c)}</strong>
          </Link>
          <div className="klein">
            {UITKOMST_LABEL[laatste.uitkomst]} · {wanneer}
            {w.pogingen.length > 1 && ` · ${w.pogingen.length}× vandaag`}
            {volgende && <span className="zacht"> · opnieuw {volgende[1] ?? volgende[2]}</span>}
          </div>
        </div>
      </div>
      {resultaat ? (
        <ResultaatPaneel contact={c} pogingenZonderAntwoord={w.pogingen.length} onKlaar={() => setResultaat(false)} />
      ) : (
        <div className="knoppenrij kleine-knoppen">
          <button className="knop primair" onClick={() => setResultaat(true)}>
            📲 Belt terug
          </button>
          {logLink && (
            <a className="knop" href={logLink} target="_blank" rel="noreferrer">
              📝 Log in ERAForce
            </a>
          )}
          {tel && !c.isTestdata && (
            <a className="knop" href={`tel:${tel.nummer.replace(/\s/g, '')}`} onClick={() => startOproep(c.id)}>
              📞 Opnieuw
            </a>
          )}
        </div>
      )}
    </li>
  );
}
