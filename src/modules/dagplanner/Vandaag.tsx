import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../app/context';
import { datumUur, langeDag, uurVan } from '../../core/dates';
import { volledigeNaam } from '../../domain/model';
import { afsprakenVanDag } from '../../domain/overzicht';
import { berekenBellijst, samenvattingNietOpLijst } from '../../domain/prioriteit';
import { BelKaart } from './BelKaart';

export function Vandaag() {
  const { gegevens, klok, instellingen, herlaadTestdata } = useApp();
  const vandaag = klok.vandaag();
  const contactOpId = useMemo(() => new Map(gegevens.contacten.map((c) => [c.id, c])), [gegevens.contacten]);
  const afspraken = useMemo(() => afsprakenVanDag(gegevens.afspraken, vandaag), [gegevens.afspraken, vandaag]);
  const lijst = useMemo(
    () =>
      berekenBellijst({
        contacten: gegevens.contacten,
        activiteiten: gegevens.activiteiten,
        belpogingen: gegevens.belpogingen,
        afspraken: gegevens.afspraken,
        instellingen,
        vandaag,
      }),
    [gegevens, instellingen, vandaag],
  );

  if (gegevens.contacten.length === 0) {
    return (
      <section className="leeg">
        <h1>Nog geen gegevens</h1>
        <p>Laad de fictieve testdata om de Dagplanner te bekijken.</p>
        <button className="knop primair groot" onClick={() => herlaadTestdata()}>
          Testdata laden
        </button>
      </section>
    );
  }

  const aantalTerugbellen = lijst.vandaag.filter((k) => k.groep === 'A' || k.groep === 'C').length;
  const aantalLeads = lijst.vandaag.filter((k) => k.groep === 'B').length;

  return (
    <>
      <header className="paginakop">
        <h1>Vandaag</h1>
        <p className="zacht">{langeDag(vandaag)}{klok.isTestklok && ' (testdatum)'}</p>
        <Bronstatus />
      </header>

      <section className="samenvatting kaart">
        <strong>
          {lijst.vandaag.length} te bellen · {afspraken.filter((a) => !a.afspraak.heleDag).length} afspraken
        </strong>
        <div className="klein zacht">
          {aantalTerugbellen} terugbelafspraken · {aantalLeads} nieuwe leads
          {lijst.nietOpLijst.length > 0 && ` · ${lijst.nietOpLijst.length} passen niet meer`}
        </div>
      </section>

      {lijst.waarschuwingen.map((w) => (
        <p key={w} className="foutmelding">{w}</p>
      ))}
      {lijst.pinGeweigerd.map((p) => (
        <p key={p.contact.id} className="foutmelding">{volledigeNaam(p.contact)}: {p.reden}</p>
      ))}

      <section>
        <h2>Afspraken</h2>
        {afspraken.length === 0 && <p className="zacht">Geen afspraken vandaag.</p>}
        <ul className="lijst">
          {afspraken.map(({ afspraak: a, overlapt }) => {
            const contact = a.contactId ? contactOpId.get(a.contactId) : undefined;
            return (
              <li key={a.id} className="kaart afspraak">
                <div className="tijd">
                  {a.heleDag ? 'Hele dag' : uurVan(a.start)}
                  {!a.heleDag && <div className="klein zacht">tot {uurVan(a.einde)}</div>}
                </div>
                <div className="inhoud">
                  <strong>{a.titel}</strong>
                  {a.locatie && <div className="zacht">{a.locatie}</div>}
                  <div className="labels">
                    {overlapt && <span className="label waarschuwing">Overlapt</span>}
                    {contact ? (
                      <Link to={`/contact/${contact.id}`} className="label link">
                        {volledigeNaam(contact)} →
                      </Link>
                    ) : (
                      !a.heleDag && <span className="label waarschuwing">Geen contact gekoppeld</span>
                    )}
                  </div>
                  {a.omschrijving && <div className="zacht klein">{a.omschrijving}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2>Bellijst ({lijst.vandaag.length})</h2>
        <ul className="lijst">
          {lijst.vandaag.map((k, i) => (
            <BelKaart key={k.contact.id} k={k} nummer={i + 1} />
          ))}
        </ul>

        {lijst.nietOpLijst.length > 0 && (
          <details className="groep extra">
            <summary>
              Niet op vandaag: {lijst.nietOpLijst.length}
              <div className="klein zacht">waarvan {samenvattingNietOpLijst(lijst.nietOpLijst)}</div>
            </summary>
            <ul className="lijst">
              {lijst.nietOpLijst.map((k) => (
                <BelKaart key={k.contact.id} k={k} />
              ))}
            </ul>
          </details>
        )}
      </section>

      {lijst.handmatigBeoordelen.length > 0 && (
        <section>
          <h2>Handmatig beoordelen ({lijst.handmatigBeoordelen.length})</h2>
          <p className="klein zacht">Te vaak geen antwoord op rij. De app plant hier zelf geen nieuwe poging meer.</p>
          <ul className="lijst">
            {lijst.handmatigBeoordelen.map((k) => (
              <BelKaart key={k.contact.id} k={k} />
            ))}
          </ul>
        </section>
      )}

      {lijst.nummerZoeken.length > 0 && (
        <section>
          <h2>Nummer zoeken ({lijst.nummerZoeken.length})</h2>
          <p className="klein zacht">Aan de beurt, maar er is geen bruikbaar telefoonnummer.</p>
          <ul className="lijst">
            {lijst.nummerZoeken.map((k) => (
              <li key={k.contact.id}>
                <Link to={`/contact/${k.contact.id}`} className="kaart contactrij">
                  <div>
                    <strong>{volledigeNaam(k.contact)}</strong>
                    <div className="zacht klein">{k.reden}</div>
                    {k.contact.email && <div className="klein">✉️ {k.contact.email}</div>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="klein zacht">
        Niet zichtbaar vandaag: {lijst.uitgesloten.length} contacten (belverbod, latere terugbelafspraak, afspraak vandaag of nog niet aan de beurt).{' '}
        <Link to="/contacten">Alle contacten</Link>
      </p>
    </>
  );
}

function Bronstatus() {
  const { gegevens } = useApp();
  return (
    <ul className="bronstatus">
      {gegevens.bronnen.map((b) => (
        <li key={b.id} className={b.laatsteFout ? 'fout' : ''}>
          {b.naam}:{' '}
          {b.laatsteFout ? `fout — ${b.laatsteFout}` : b.laatstSuccesvolOp ? `bijgewerkt ${datumUur(b.laatstSuccesvolOp)}` : 'nog nooit bijgewerkt'}
        </li>
      ))}
    </ul>
  );
}
