import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../app/context';
import { FASE_LABEL } from '../../app/labels';
import { dagVan, korteDag, relatief, uurVan } from '../../core/dates';
import { volledigeNaam } from '../../domain/model';
import { standaardOpeningszin } from '../../domain/openingszin';
import { GROEP_LABEL, type Kandidaat } from '../../domain/prioriteit';
import { KeuzeKnoppen, ResultaatPaneel } from './ResultaatPaneel';
import { BerichtPaneel } from './BerichtPaneel';
import { haakLabel } from '../../domain/haken';
import { eraforceLink } from '../../domain/eraforce';
import { aanknopingspunt } from '../../domain/aanknopingspunt';
import { KANAAL_ICOON } from '../../domain/kanaaladvies';
import { GedaanPaneel, type GedaanKanaal } from './GedaanPaneel';
import { signaalTekst } from '../../domain/marktsignaal';
import { berichtTekst } from '../../domain/berichten';

/** Route naar het adres in Apple Kaarten (opent de app op de iPhone). */
const routeLink = (adres: string) => `https://maps.apple.com/?daddr=${encodeURIComponent(adres)}`;

export function BelKaart({ k, nummer, opLijst = true }: { k: Kandidaat; nummer?: number; opLijst?: boolean }) {
  const { gegevens, instellingen, klok, startOproep, handelMarktsignaalAf, toon } = useApp();
  const [uitleg, setUitleg] = useState(false);
  const [paneel, setPaneel] = useState<'geen' | 'resultaat' | 'meer' | 'sms' | 'whatsapp' | 'mail' | GedaanKanaal>('geen');
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
  const punt = aanknopingspunt(k.terugbel, k.laatste);
  const hook = k.hook;
  const contactAdres = c.straat && c.gemeente ? `${c.straat}, ${c.postcode ? `${c.postcode} ` : ''}${c.gemeente}` : null;
  const kanaal = k.advies.kanaal;
  const bericht = berichtTekst({ kandidaat: k, kanaal: kanaal === 'mail' ? 'mail' : kanaal === 'whatsapp' ? 'whatsapp' : 'sms', voornaamGebruiker: instellingen.gebruiker.voornaam, organisatie: instellingen.gebruiker.organisatie });
  const voorstel = { tekst: bericht.tekst, vanHook: Boolean(hook?.conceptbericht && bericht.tekst === hook.conceptbericht) };
  const erafLink = instellingen.eraforce.belViaEraforce ? eraforceLink(c, import.meta.env.VITE_ERAFORCE_DOMEIN) : null;
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
      {k.signaal && (
        <div className="tekoop-signaal">
          <p>
            <strong>🏷️ {signaalTekst(k.signaal)}</strong>
          </p>
          <p className="klein">
            {k.signaal.url && (
              <a href={k.signaal.url} target="_blank" rel="noreferrer">
                Bekijk de advertentie
              </a>
            )}
            {k.signaal.url && ' · '}
            <button
              className="knop tekstknop klein"
              onClick={async () => {
                try {
                  await handelMarktsignaalAf(k.signaal!.id);
                  toon({ tekst: `${c.achternaam}: te koop gezet afgehandeld.` });
                } catch (e) {
                  toon({ tekst: e instanceof Error ? e.message : String(e), fout: true });
                }
              }}
            >
              Niets sturen
            </button>
          </p>
        </div>
      )}
      {hook && (
        <div className="hook">
          <p>
            <strong>💡 Hook: {hook.onderwerp}</strong>
            <span className="klein zacht"> · Claude</span>
          </p>
          {hook.detail && <p className="klein">{hook.detail}</p>}
          {hook.bronlinks.length > 0 && (
            <p className="klein">
              {hook.bronlinks.map((b, i) => (
                <span key={b.url}>
                  {i > 0 && ' · '}
                  <a href={b.url} target="_blank" rel="noreferrer">{kort(b.titel, 60)}</a>
                </span>
              ))}
            </p>
          )}
        </div>
      )}
      {(punt.taak || punt.gesprek) && (
        <div className="aanknopingspunt klein">
          {punt.taak && (
            <p>
              📌 {k.terugbel?.herkomst === 'lokaal' ? 'Jouw afspraak' : 'Taak in ERAForce'}: <span className="citaat">“{punt.taak}”</span>
            </p>
          )}
          {punt.gesprek && (
            <p>
              🗣️ Gesprek {korteDag(punt.gesprek.dag)} ({relatief(punt.gesprek.dag, vandaag)}): <span className="citaat">“{punt.gesprek.fragment}”</span>
            </p>
          )}
        </div>
      )}
      {geenAntwoordVandaag > 0 && <p className="label waarschuwing">Vandaag al {geenAntwoordVandaag}× geen antwoord — later nog eens proberen</p>}
      {(k.advies.kanaal !== 'bellen' || k.advies.opmerking) && (
        <p className={`advies advies-${k.advies.kanaal}`}>
          {KANAAL_ICOON[k.advies.kanaal]} <strong>Advies:</strong> {k.advies.reden}
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

      {!punt.gesprek && <p className="klein zacht">
        {k.laatste ? (
          <>
            Laatste gesprek {relatief(dagVan(k.laatste.tijdstip), vandaag)} ({k.laatste.herkomst === 'lokaal' ? 'jij' : 'bron'})
            {k.laatste.tekst && <>: <span className="citaat">“{kort(k.laatste.tekst)}”</span></>}
          </>
        ) : (
          'Nog geen inhoudelijk gesprek.'
        )}
      </p>}

      {/* Openingszin enkel bij bellen of langsgaan; bij een bericht het voorgestelde bericht (Jonas, 7/10/2026). */}
      {opLijst && (kanaal === 'bellen' || kanaal === 'bezoek') && (
        <p className="openingszin">
          <span className="klein zacht">Openingszin {hook?.openingszin ? '(hook)' : '(standaard)'}</span>
          <br />
          {zin}
        </p>
      )}
      {opLijst && (kanaal === 'bericht' || kanaal === 'whatsapp' || kanaal === 'mail') && (
        <p className="openingszin">
          <span className="klein zacht">Bericht {voorstel.vanHook ? '(hook)' : '(standaard)'} — pas aan bij het versturen</span>
          <br />
          {voorstel.tekst}
        </p>
      )}

      {paneel === 'resultaat' ? (
        <ResultaatPaneel contact={c} pogingenZonderAntwoord={k.pogingenZonderAntwoord} onKlaar={() => setPaneel('geen')} />
      ) : paneel === 'sms' || paneel === 'whatsapp' || paneel === 'mail' ? (
        <BerichtPaneel k={k} start={paneel} onKlaar={() => setPaneel('geen')} />
      ) : paneel === 'flyer' || paneel === 'brief' || paneel === 'bezoek' ? (
        <GedaanPaneel k={k} kanaal={paneel} onKlaar={() => setPaneel('geen')} />
      ) : (
        <>
          <div className="knoppenrij">
            {opLijst && (kanaal === 'bericht' || kanaal === 'whatsapp') && (
              <button className="knop primair belknop" onClick={() => setPaneel(kanaal === 'whatsapp' ? 'whatsapp' : 'sms')}>
                {kanaal === 'whatsapp' ? '🟢 WhatsApp' : '💬 Bericht'}
              </button>
            )}
            {opLijst && kanaal === 'bezoek' && (
              <>
                {contactAdres && (
                  <a className="knop primair belknop" href={routeLink(contactAdres)} target="_blank" rel="noreferrer">
                    🚪 Route
                  </a>
                )}
                <button className="knop" onClick={() => setPaneel('bezoek')}>✓ Gedaan</button>
              </>
            )}
            {opLijst && (kanaal === 'flyer' || kanaal === 'brief') && (
              <button className="knop primair belknop" onClick={() => setPaneel(kanaal)}>
                {kanaal === 'flyer' ? '📬 Flyer gestoken' : '✉️ Brief verstuurd'}
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
            {(kanaal === 'bellen' || kanaal === 'bericht' || kanaal === 'whatsapp' || kanaal === 'mail' || !opLijst) && (
              <button className="knop" onClick={() => setPaneel('resultaat')}>
                Resultaat
              </button>
            )}
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
                {kanaal !== 'bericht' && tel && <button className="knop" onClick={() => setPaneel('sms')}>💬 Bericht</button>}
                {kanaal !== 'whatsapp' && tel && <button className="knop" onClick={() => setPaneel('whatsapp')}>🟢 WhatsApp</button>}
                {kanaal !== 'mail' && c.email && <button className="knop" onClick={() => setPaneel('mail')}>✉️ Mail</button>}
                {kanaal !== 'bezoek' && contactAdres && <button className="knop" onClick={() => setPaneel('bezoek')}>🚪 Langsgegaan</button>}
                {kanaal !== 'flyer' && contactAdres && <button className="knop" onClick={() => setPaneel('flyer')}>📬 Flyer gestoken</button>}
                {kanaal !== 'brief' && contactAdres && <button className="knop" onClick={() => setPaneel('brief')}>✉️ Brief verstuurd</button>}
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
