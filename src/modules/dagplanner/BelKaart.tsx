import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../app/context';
import { FASE_LABEL } from '../../app/labels';
import { dagVan, relatief, uurVan } from '../../core/dates';
import { volledigeNaam } from '../../domain/model';
import { standaardOpeningszin } from '../../domain/openingszin';
import { GROEP_LABEL, type Kandidaat } from '../../domain/prioriteit';
import { KeuzeKnoppen, ResultaatPaneel } from './ResultaatPaneel';

export function BelKaart({ k, nummer, opLijst = true }: { k: Kandidaat; nummer?: number; opLijst?: boolean }) {
  const { gegevens, instellingen, klok } = useApp();
  const [uitleg, setUitleg] = useState(false);
  const [paneel, setPaneel] = useState<'geen' | 'resultaat' | 'meer'>('geen');
  const c = k.contact;

  const pand = gegevens.contactPanden
    .filter((cp) => cp.contactId === c.id)
    .map((cp) => gegevens.panden.find((p) => p.id === cp.pandId))
    .find(Boolean);
  const adres = pand ? `${pand.straat}, ${pand.gemeente}` : c.straat ? `${c.straat}, ${c.gemeente}` : (c.gemeente ?? 'adres onbekend');
  const vandaag = klok.vandaag();
  const zin = standaardOpeningszin({
    kandidaat: k,
    voornaamGebruiker: instellingen.gebruiker.voornaam,
    organisatie: instellingen.gebruiker.organisatie,
    uur: Number(uurVan(klok.nu()).slice(0, 2)),
    vandaag,
  });
  const tel = c.telefoons[0];
  const geenAntwoordVandaag = gegevens.belpogingen.filter((p) => p.contactId === c.id && !p.ongedaanOp && p.uitkomst === 'geen_antwoord' && dagVan(p.tijdstip) === vandaag).length;

  return (
    <li className={`kaart belkaart groep-${k.groep}`}>
      <div className="belkaart-kop">
        {nummer !== undefined && <span className="volgnummer">{nummer}</span>}
        <div className="belkaart-naam">
          <Link to={`/contact/${c.id}`}>
            <strong>{c.aanhef ? `${c.aanhef} ` : ''}{volledigeNaam(c)}</strong>
          </Link>
          <div className="zacht klein">{adres}</div>
        </div>
        <div className="labels rechts">
          <span className={`label groeplabel groep-${k.groep}`}>{GROEP_LABEL[k.groep]}</span>
          {k.fase ? <span className={`label fase-${k.fase}`}>{FASE_LABEL[k.fase]}</span> : <span className="label">Fase ?</span>}
        </div>
      </div>

      <p className="reden">{k.reden}</p>
      {geenAntwoordVandaag > 0 && <p className="label waarschuwing">Vandaag al {geenAntwoordVandaag}× geen antwoord — later nog eens proberen</p>}

      <p className="klein zacht">
        {k.laatste ? (
          <>
            Laatste gesprek {relatief(dagVan(k.laatste.tijdstip), vandaag)} ({k.laatste.herkomst === 'lokaal' ? 'jij' : 'bron'})
            {k.laatste.tekst && <>: <span className="citaat">“{kort(k.laatste.tekst)}”</span></>}
          </>
        ) : (
          'Nog geen inhoudelijk gesprek.'
        )}
      </p>

      {opLijst && (
        <p className="openingszin">
          <span className="klein zacht">Openingszin (standaard)</span>
          <br />
          {zin}
        </p>
      )}

      {paneel === 'resultaat' ? (
        <ResultaatPaneel contact={c} pogingenZonderAntwoord={k.pogingenZonderAntwoord} onKlaar={() => setPaneel('geen')} />
      ) : (
        <>
          <div className="knoppenrij">
            {opLijst &&
              (tel && !c.isTestdata ? (
                <a className="knop primair belknop" href={`tel:${tel.nummer.replace(/\s/g, '')}`}>
                  📞 Bel
                </a>
              ) : (
                <button className="knop primair belknop" disabled title="Testdata: verzonnen nummer">
                  📞 Bel (testdata)
                </button>
              ))}
            <button className="knop" onClick={() => setPaneel('resultaat')}>
              Resultaat
            </button>
            <button className="knop" onClick={() => setPaneel(paneel === 'meer' ? 'geen' : 'meer')} aria-expanded={paneel === 'meer'}>
              ⋯
            </button>
          </div>
          {paneel === 'meer' && (
            <div className="meer">
              <KeuzeKnoppen contactId={c.id} toonVastpinnen={!opLijst} />
              <button className="knop tekstknop" onClick={() => setUitleg(!uitleg)} aria-expanded={uitleg}>
                {uitleg ? 'Verberg uitleg' : 'Waarom staat dit contact hier?'}
              </button>
            </div>
          )}
        </>
      )}

      {uitleg && (
        <div className="uitleg">
          <p className="klein">
            <strong>{GROEP_LABEL[k.groep]}</strong>
            {k.groep === 'D' ? ' — volgorde op score:' : ' — gaat voor op de opvolging op score. Ter info de score:'}
          </p>
          <table>
            <tbody>
              {k.onderdelen.map((o) => (
                <tr key={o.label}>
                  <td>{o.label}</td>
                  <td className="punten">+{o.punten}</td>
                </tr>
              ))}
              <tr className="totaal">
                <td>Totaal</td>
                <td className="punten">{k.score}</td>
              </tr>
            </tbody>
          </table>
          {k.terugbel && (
            <p className="klein zacht">
              Terugbelafspraak ({k.terugbel.herkomst === 'bron' ? 'bron' : 'jij'}): {k.terugbel.tekst}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function kort(t: string, max = 120): string {
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}
