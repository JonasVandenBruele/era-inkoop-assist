import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../../app/context';
import { ACTIVITEIT_LABEL, FASE_LABEL, ROL_LABEL, STATUS_LABEL, UITKOMST_LABEL } from '../../app/labels';
import { datumUur, korteDag } from '../../core/dates';
import { volledigeNaam, type Belpoging } from '../../domain/model';
import { historiek, laatsteInhoudelijkContact } from '../../domain/overzicht';
import { pogingenSindsContact } from '../../domain/prioriteit';
import { KeuzeKnoppen, ResultaatPaneel } from './ResultaatPaneel';
import { HakenEnVoorkeur } from './HakenEnVoorkeur';

export function ContactPagina() {
  const { id } = useParams();
  const { gegevens, klok, trekBelverbodIn, herstelKeuze, startOproep } = useApp();
  const [resultaat, setResultaat] = useState(false);
  const contact = gegevens.contacten.find((c) => c.id === id);

  const panden = useMemo(() => {
    if (!contact) return [];
    return gegevens.contactPanden
      .filter((cp) => cp.contactId === contact.id)
      .map((cp) => {
        const pand = gegevens.panden.find((p) => p.id === cp.pandId)!;
        const andere = gegevens.contactPanden
          .filter((x) => x.pandId === cp.pandId && x.contactId !== contact.id)
          .map((x) => ({ rol: x.rol, contact: gegevens.contacten.find((c) => c.id === x.contactId)! }));
        return { rol: cp.rol, pand, andere };
      });
  }, [contact, gegevens]);

  if (!contact) {
    return (
      <section className="leeg">
        <p>Contact niet gevonden.</p>
        <Link to="/">Terug naar Vandaag</Link>
      </section>
    );
  }

  const items = historiek(contact.id, gegevens.activiteiten, gegevens.belpogingen);
  const laatste = laatsteInhoudelijkContact(contact.id, gegevens.activiteiten, gegevens.belpogingen);
  const openTaken = gegevens.activiteiten.filter((a) => a.contactId === contact.id && a.type === 'taak' && !a.taakAfgerond);
  const pogingen = pogingenSindsContact(contact.id, gegevens.belpogingen, laatste).length;
  const belverboden = gegevens.belverboden.filter((b) => b.contactId === contact.id && !b.ingetrokkenOp);
  const opvolgacties = gegevens.opvolgacties.filter((o) => o.contactId === contact.id && o.status === 'open' && o.dag >= klok.vandaag());
  const keuzes = gegevens.keuzes.filter(
    (k) => k.contactId === contact.id && !k.ongedaanOp && (k.soort === 'uitstellen' ? k.totDag! > klok.vandaag() : k.voorDag === klok.vandaag()),
  );

  return (
    <>
      <Link to="/" className="terug">← Vandaag</Link>
      <header className="paginakop">
        <h1>{contact.aanhef ? `${contact.aanhef} ` : ''}{volledigeNaam(contact)}</h1>
        <div className="labels">
          <span className="label">{STATUS_LABEL[contact.statusBron]}</span>
          {contact.faseBron ? <span className={`label fase-${contact.faseBron}`}>{FASE_LABEL[contact.faseBron]}</span> : <span className="label">Fase onbekend</span>}
          {contact.nietBellenBron && <span className="label gevaar">Niet meer bellen</span>}
          {contact.isTestdata && <span className="label test">Testdata</span>}
          {contact.isLokaalTijdelijk && <span className="label lokaal">Tijdelijk lokaal contact</span>}
        </div>
      </header>

      <section className="kaart">
        <h2>Contact</h2>
        {contact.telefoons.length === 0 && <p className="waarschuwingstekst">Geen telefoonnummer bekend.</p>}
        {contact.telefoons.map((t) =>
          contact.isTestdata ? (
            <p key={t.nummer}>
              📞 {t.nummer} <span className="zacht klein">(verzonnen — bellen uitgeschakeld voor testdata)</span>
            </p>
          ) : (
            <a key={t.nummer} className="knop primair groot" href={`tel:${t.nummer.replace(/\s/g, '')}`} onClick={() => startOproep(contact.id)}>
              📞 Bel {t.nummer}
            </a>
          ),
        )}
        {contact.email && <p>✉️ {contact.email}</p>}
        {contact.straat && <p>🏠 {contact.straat}, {contact.postcode} {contact.gemeente}</p>}
        <dl className="feiten">
          <dt>Laatste gesprek</dt>
          <dd>{laatste ? `${datumUur(laatste.tijdstip)} (${laatste.herkomst === 'lokaal' ? 'jouw resultaat' : 'bron'})` : 'nog niet bereikt'}</dd>
          <dt>Tijdshorizon</dt>
          <dd>{contact.tijdshorizonBron ?? 'onbekend'}</dd>
          <dt>Aanspreekvorm</dt>
          <dd>{contact.aanspreekvormBron ?? 'onbekend (standaard u)'}</dd>
          <dt>Herkomst</dt>
          <dd>{contact.herkomstContact ?? 'onbekend'}</dd>
        </dl>
      </section>

      <section className="kaart">
        <h2>Acties</h2>
        {resultaat ? (
          <ResultaatPaneel contact={contact} pogingenZonderAntwoord={pogingen} onKlaar={() => setResultaat(false)} />
        ) : (
          <>
            <button className="knop primair groot" onClick={() => setResultaat(true)}>
              Belresultaat ingeven
            </button>
            <KeuzeKnoppen contactId={contact.id} toonVastpinnen />
          </>
        )}
        {(belverboden.length > 0 || opvolgacties.length > 0 || keuzes.length > 0) && (
          <ul className="lijst compact lokaal-lijst">
            {belverboden.map((b) => (
              <li key={b.id}>
                <span className="label lokaal">Jij</span> ⛔ Niet meer bellen{b.reden ? ` — ${b.reden}` : ''}{' '}
                <button className="knop tekstknop" onClick={() => trekBelverbodIn(b.id!)}>Intrekken</button>
              </li>
            ))}
            {opvolgacties.map((o) => (
              <li key={o.id}>
                <span className="label lokaal">Jij</span> {o.soort === 'terugbellen' ? '🔁 Terugbellen' : '➡️ Vervolgstap'} op {korteDag(o.dag)}
                {o.uur ? ` om ${o.uur}` : ''}{o.omschrijving ? ` — ${o.omschrijving}` : ''}
              </li>
            ))}
            {keuzes.map((k) => (
              <li key={k.id}>
                <span className="label lokaal">Jij</span>{' '}
                {k.soort === 'vastpinnen' ? '📌 Vastgepind vandaag' : k.soort === 'vandaag_overslaan' ? '⏭ Vandaag overgeslagen' : `⏸ Uitgesteld tot ${korteDag(k.totDag!)}`}{' '}
                <button className="knop tekstknop" onClick={() => herstelKeuze(k.id)}>Herstellen</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <HakenEnVoorkeur contact={contact} />

      {openTaken.length > 0 && (
        <section className="kaart">
          <h2>Open taken</h2>
          <ul className="lijst compact">
            {openTaken.map((t) => (
              <li key={t.id}>
                <strong>{t.vervaltOp ? korteDag(t.vervaltOp) : 'zonder datum'}{t.vervaltUur ? ` om ${t.vervaltUur}` : ''}</strong> — {t.tekst}
              </li>
            ))}
          </ul>
        </section>
      )}

      {panden.length > 0 && (
        <section className="kaart">
          <h2>Panden ({panden.length})</h2>
          <ul className="lijst compact">
            {panden.map(({ rol, pand, andere }) => (
              <li key={pand.id}>
                <strong>{pand.straat}, {pand.gemeente}</strong> <span className="zacht">· {pand.type} · {ROL_LABEL[rol]}</span>
                {pand.omschrijving && <div className="zacht klein">{pand.omschrijving}</div>}
                {andere.length > 0 && (
                  <div className="klein">
                    Ook betrokken:{' '}
                    {andere.map((a, i) => (
                      <span key={a.contact.id}>
                        {i > 0 && ', '}
                        <Link to={`/contact/${a.contact.id}`}>{volledigeNaam(a.contact)}</Link> ({ROL_LABEL[a.rol]})
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="kaart">
        <h2>Historiek</h2>
        <ul className="historiek">
          {items.map((item) =>
            item.soort === 'activiteit' ? (
              <li key={item.activiteit.id}>
                <div className="klein">
                  <span className="label bron">Bron</span> {ACTIVITEIT_LABEL[item.activiteit.type]}
                  {item.activiteit.auteur && ` · ${item.activiteit.auteur}`} · {datumUur(item.tijdstip)}
                  {item.activiteit.taakAfgerond && ' · afgerond'}
                </div>
                <div>{item.activiteit.tekst}</div>
              </li>
            ) : (
              <li key={item.belpoging.id} className={item.belpoging.ongedaanOp ? 'ongedaan' : ''}>
                <div className="klein">
                  <span className="label lokaal">Jij</span> {UITKOMST_LABEL[item.belpoging.uitkomst]}
                  {item.belpoging.kanaal && item.belpoging.kanaal !== 'telefoon' && ` (${POGING_KANAAL[item.belpoging.kanaal]})`} · {datumUur(item.tijdstip)}
                  {!item.belpoging.isInhoudelijk && ' · telt niet als gesprek'}
                  {item.belpoging.ongedaanOp && ' · ongedaan gemaakt'}
                </div>
                {item.belpoging.notitie && <div>{item.belpoging.notitie}</div>}
              </li>
            ),
          )}
        </ul>
      </section>

      <section className="kaart klein zacht">
        <h2>Herkomst van deze gegevens</h2>
        <p>
          Bron: {contact.bron} · extern ID: {contact.externId ?? '—'}
          <br />
          Gewijzigd in bron: {contact.gewijzigdInBronOp ? datumUur(contact.gewijzigdInBronOp) : 'onbekend'} · geïmporteerd: {datumUur(contact.geimporteerdOp)}
        </p>
      </section>
    </>
  );
}

const POGING_KANAAL: Record<Exclude<NonNullable<Belpoging['kanaal']>, 'telefoon'>, string> = {
  sms: 'sms',
  whatsapp: 'WhatsApp',
  mail: 'mail',
  flyer: 'flyer',
  brief: 'brief',
  bezoek: 'langsgegaan',
};
