import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../app/context';
import { FASE_LABEL } from '../../app/labels';
import { dagVan, relatief, uurVan } from '../../core/dates';
import { volledigeNaam } from '../../domain/model';
import { standaardOpeningszin } from '../../domain/openingszin';
import { GROEP_LABEL, type Kandidaat } from '../../domain/prioriteit';
import { KeuzeKnoppen, ResultaatPaneel } from './ResultaatPaneel';
import { BerichtPaneel } from './BerichtPaneel';
import { haakLabel } from '../../domain/haken';
import { eraforceLink } from '../../domain/eraforce';

export function BelKaart({ k, nummer, opLijst = true }: { k: Kandidaat; nummer?: number; opLijst?: boolean }) {
  const { gegevens, instellingen, klok, startOproep } = useApp();
  const [uitleg, setUitleg] = useState(false);
  const [paneel, setPaneel] = useState<'geen' | 'resultaat' | 'meer' | 'sms' | 'whatsapp' | 'mail'>('geen');
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
  const gekoppeld = gegevens.koppelingen.find((x) => x.contactId === c.id)?.salesforceId ?? instellingen.eraforce.testIdVoorIedereen;
  const erafLink = instellingen.eraforce.belViaEraforce ? eraforceLink(c, import.meta.env.VITE_ERAFORCE_DOMEIN, gekoppeld) : null;
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
          {k.groep === 'A' && k.terugbel?.uur && <span className="label groeplabel groep-A">{k.terugbel.uur}</span>}
          {!opLijst && <span className={`label groeplabel groep-${k.groep}`}>{GROEP_LABEL[k.groep]}</span>}
          {k.fase && <span className={`label fase-${k.fase}`}>{FASE_LABEL[k.fase]}</span>}
        </div>
      </div>

      <p className="reden">{k.reden}</p>
      {k.terugbel && (
        <p className="klein zacht">
          📅 {k.terugbel.herkomst === 'bron' ? (c.bron === 'eraforce_mirror' ? 'Uit je ERAForce-opvolgtaak' : 'Uit de opvolgtaak in de bron') : 'Jouw afspraak in de Dagplanner'}
          {k.terugbel.tekst && <>: <span className="citaat">“{kort(k.terugbel.tekst, 80)}”</span></>}
        </p>
      )}
      {geenAntwoordVandaag > 0 && <p className="label waarschuwing">Vandaag al {geenAntwoordVandaag}× geen antwoord — later nog eens proberen</p>}
      {(k.advies.kanaal !== 'bellen' || k.advies.opmerking) && (
        <p className={`advies advies-${k.advies.kanaal}`}>
          {{ bellen: '📞', bericht: '💬', mail: '✉️' }[k.advies.kanaal]} <strong>Advies:</strong> {k.advies.reden}
          {k.advies.opmerking && <span className="zacht"> · {k.advies.opmerking}</span>}
        </p>
      )}
      {k.haken.filter((h) => h.soort !== 'algemeen').length > 0 && (
        <ul className="haken">
          {k.haken
            .filter((h) => h.soort !== 'algemeen')
            .map((h) => (
              <li key={h.id}>
                {h.soort === 'persoonlijk' ? '🙂' : '💡'} {haakLabel(h)}
                {h.soort === 'persoonlijk' && <span className="zacht"> — tip voor jou, niet in de tekst</span>}
              </li>
            ))}
        </ul>
      )}

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
      ) : paneel === 'sms' || paneel === 'whatsapp' || paneel === 'mail' ? (
        <BerichtPaneel k={k} start={paneel} onKlaar={() => setPaneel('geen')} />
      ) : (
        <>
          <div className="knoppenrij">
            {opLijst && k.advies.kanaal === 'bericht' && (
              <button className="knop primair belknop" onClick={() => setPaneel('sms')}>
                💬 Bericht
              </button>
            )}
            {opLijst && k.advies.kanaal === 'mail' && (
              <button className="knop primair belknop" onClick={() => setPaneel('mail')}>
                ✉️ Mail
              </button>
            )}
            {opLijst && k.advies.kanaal === 'bellen' && erafLink && (
              <a
                className="knop primair belknop"
                href={erafLink}
                onClick={() => instellingen.eraforce.vraagNaBellenViaEraforce && startOproep(c.id)}
                title="Opent de prospect in ERAForce; bel daar via More → Maf Call"
              >
                📞 Bel via ERAForce
              </a>
            )}
            {opLijst &&
              k.advies.kanaal === 'bellen' &&
              !erafLink &&
              (tel && !c.isTestdata ? (
                <a className="knop primair belknop" href={`tel:${tel.nummer.replace(/\s/g, '')}`} onClick={() => startOproep(c.id)}>
                  📞 Bel
                </a>
              ) : (
                <button className="knop primair belknop" title="Testdata: er wordt niet echt gebeld" onClick={() => startOproep(c.id, true)}>
                  📞 Bel (test)
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
              <div className="knoppenrij kleine-knoppen">
                {k.advies.kanaal !== 'bellen' && tel && (
                  c.isTestdata ? (
                    <button className="knop" onClick={() => startOproep(c.id, true)}>📞 Toch bellen (simulatie)</button>
                  ) : (
                    <a className="knop" href={`tel:${tel.nummer.replace(/\s/g, '')}`} onClick={() => startOproep(c.id)}>📞 Toch bellen</a>
                  )
                )}
                {k.advies.kanaal !== 'bericht' && tel && <button className="knop" onClick={() => setPaneel('sms')}>💬 Bericht</button>}
                {k.advies.kanaal !== 'mail' && c.email && <button className="knop" onClick={() => setPaneel('mail')}>✉️ Mail</button>}
              </div>
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
