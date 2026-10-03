import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../app/context';
import { UITKOMST_LABEL } from '../../app/labels';
import { datumUur, korteDag, langeDag, uurVan } from '../../core/dates';
import { volledigeNaam, type Dagplan } from '../../domain/model';
import { afsprakenVanDag } from '../../domain/overzicht';
import { berekenBellijst, samenvattingNietOpLijst } from '../../domain/prioriteit';
import { dagWeergave } from '../../domain/dagplan';
import { BelKaart } from './BelKaart';

export function Vandaag() {
  const { gegevens, klok, instellingen, herlaadTestdata, store, dataVersie } = useApp();
  const vandaag = klok.vandaag();
  const contactOpId = useMemo(() => new Map(gegevens.contacten.map((c) => [c.id, c])), [gegevens.contacten]);
  const afspraken = useMemo(() => afsprakenVanDag(gegevens.afspraken, vandaag), [gegevens.afspraken, vandaag]);
  const uur = uurVan(klok.nu());
  const lijst = useMemo(() => berekenBellijst({ ...gegevens, instellingen, vandaag, uur }), [gegevens, instellingen, vandaag, uur]);

  // Dagplan: de volgorde van de eerste opening van de dag blijft behouden.
  const [plan, setPlan] = useState<Dagplan | null | 'laden'>('laden');
  useEffect(() => {
    let actief = true;
    setPlan('laden');
    store.laadDagplan(vandaag).then(
      (p) => actief && setPlan(p),
      () => actief && setPlan(null),
    );
    return () => {
      actief = false;
    };
  }, [store, vandaag, dataVersie]);

  const weergave = useMemo(
    () => (plan === 'laden' ? null : dagWeergave(lijst, plan, gegevens.belpogingen, gegevens.contacten, vandaag)),
    [lijst, plan, gegevens.belpogingen, gegevens.contacten, vandaag],
  );

  useEffect(() => {
    if (!weergave?.nieuwPlan || gegevens.contacten.length === 0) return;
    const nieuw: Dagplan = { dag: vandaag, contactIds: weergave.nieuwPlan, aangemaaktOp: klok.nu(), isTestdata: gegevens.contacten.some((c) => c.isTestdata) };
    setPlan(nieuw);
    store.bewaarDagplan(nieuw).catch(() => {
      /* niet blokkerend: zonder opgeslagen plan werkt de lijst gewoon verder */
    });
  }, [weergave?.nieuwPlan, gegevens.contacten, vandaag, klok, store]);

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
  if (!weergave) return <p className="zacht">Bellijst laden…</p>;

  const actief = weergave.actief;
  const aantalTerugbellen = actief.filter((k) => k.groep === 'A' || k.groep === 'C').length;
  const aantalLeads = actief.filter((k) => k.groep === 'B').length;

  return (
    <>
      <header className="paginakop">
        <h1>Vandaag</h1>
        <p className="zacht">{langeDag(vandaag)}{klok.isTestklok && ' (testdatum)'}</p>
        <Bronstatus />
      </header>

      <section className="samenvatting kaart">
        <strong>
          {actief.length} te bellen · {weergave.gebeld.length} gebeld · {afspraken.filter((a) => !a.afspraak.heleDag).length} afspraken
        </strong>
        <div className="klein zacht">
          {aantalTerugbellen} terugbelafspraken · {aantalLeads} nieuwe leads
          {weergave.nietOpLijst.length > 0 && ` · ${weergave.nietOpLijst.length} passen niet meer`}
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
                    {a.bron === 'lokaal' && <span className="label lokaal">Jij (niet in ERAForce)</span>}
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
        <h2>Bellijst ({actief.length})</h2>
        {actief.length === 0 && <p className="infomelding">Alles van je lijst is gebeld. 🎉 Wil je meer bellen? Kies hieronder bij "Niet op vandaag".</p>}
        <ul className="lijst">
          {actief.map((k, i) => (
            <BelKaart key={k.contact.id} k={k} nummer={i + 1} />
          ))}
        </ul>

        {weergave.nietOpLijst.length > 0 && (
          <details className="groep extra">
            <summary>
              Niet op vandaag: {weergave.nietOpLijst.length}
              <div className="klein zacht">waarvan {samenvattingNietOpLijst(weergave.nietOpLijst)}</div>
            </summary>
            <ul className="lijst">
              {weergave.nietOpLijst.map((k) => (
                <BelKaart key={k.contact.id} k={k} opLijst={false} />
              ))}
            </ul>
          </details>
        )}
      </section>

      {weergave.gebeld.length > 0 && <GebeldVandaag gebeld={weergave.gebeld} />}

      {lijst.handmatigBeoordelen.length > 0 && (
        <section>
          <h2>Handmatig beoordelen ({lijst.handmatigBeoordelen.length})</h2>
          <p className="klein zacht">Te vaak geen antwoord op rij. De app plant hier zelf geen nieuwe poging meer: kies zelf (opnieuw proberen, uitstellen of niet meer bellen).</p>
          <ul className="lijst">
            {lijst.handmatigBeoordelen.map((k) => (
              <BelKaart key={k.contact.id} k={k} opLijst={false} />
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

      <KeuzesVandaag />

      <p className="klein zacht">
        Niet zichtbaar vandaag: {lijst.uitgesloten.length} contacten (belverbod, latere terugbelafspraak, afspraak vandaag of nog niet aan de beurt).{' '}
        <Link to="/contacten">Alle contacten</Link>
      </p>
    </>
  );
}

function GebeldVandaag({ gebeld }: { gebeld: ReturnType<typeof dagWeergave>['gebeld'] }) {
  const { maakBelresultaatOngedaan, toon } = useApp();
  return (
    <section>
      <h2>Gebeld vandaag ({gebeld.length})</h2>
      <ul className="lijst">
        {gebeld.map(({ contact, pogingen }) => {
          const laatste = pogingen[0]!;
          return (
            <li key={contact.id} className="kaart gebeld">
              <div>
                <Link to={`/contact/${contact.id}`}>
                  <strong>{volledigeNaam(contact)}</strong>
                </Link>
                <div className="klein">
                  {UITKOMST_LABEL[laatste.uitkomst]} om {uurVan(laatste.tijdstip)}
                  {pogingen.length > 1 && ` · ${pogingen.length} pogingen vandaag`}
                </div>
                {laatste.notitie && <div className="klein zacht">{laatste.notitie}</div>}
              </div>
              <button
                className="knop tekstknop"
                onClick={async () => {
                  await maakBelresultaatOngedaan(laatste.id);
                  toon({ tekst: `${UITKOMST_LABEL[laatste.uitkomst]} bij ${volledigeNaam(contact)} ongedaan gemaakt.` });
                }}
              >
                Ongedaan
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Keuzes die vandaag invloed hebben, met herstelknop. Maakt "overslaan" en "niet meer bellen" duidelijk verschillend. */
function KeuzesVandaag() {
  const { gegevens, klok, herstelKeuze, trekBelverbodIn } = useApp();
  const vandaag = klok.vandaag();
  const naam = (id: string) => {
    const c = gegevens.contacten.find((x) => x.id === id);
    return c ? volledigeNaam(c) : 'Onbekend contact';
  };
  const keuzes = gegevens.keuzes.filter(
    (k) => !k.ongedaanOp && ((k.soort !== 'uitstellen' && k.voorDag === vandaag) || (k.soort === 'uitstellen' && k.totDag! > vandaag)),
  );
  const verboden = gegevens.belverboden.filter((b) => !b.ingetrokkenOp && !b.belpogingId);
  if (keuzes.length === 0 && verboden.length === 0) return null;

  const omschrijving = (k: (typeof keuzes)[number]) =>
    k.soort === 'vastpinnen' ? '📌 Vastgepind vandaag' : k.soort === 'vandaag_overslaan' ? '⏭ Enkel vandaag overgeslagen' : `⏸ Uitgesteld tot ${korteDag(k.totDag!)}`;

  return (
    <section>
      <h2>Jouw keuzes</h2>
      <ul className="lijst">
        {keuzes.map((k) => (
          <li key={k.id} className="kaart gebeld">
            <div>
              <strong>{naam(k.contactId)}</strong>
              <div className="klein">{omschrijving(k)}</div>
            </div>
            <button className="knop tekstknop" onClick={() => herstelKeuze(k.id)}>
              Herstellen
            </button>
          </li>
        ))}
        {verboden.map((b) => (
          <li key={b.id} className="kaart gebeld">
            <div>
              <strong>{naam(b.contactId)}</strong>
              <div className="klein">⛔ Niet meer bellen{b.aangemaaktOp ? ` (sinds ${datumUur(b.aangemaaktOp)})` : ''}</div>
            </div>
            <button className="knop tekstknop" onClick={() => trekBelverbodIn(b.id!)}>
              Intrekken
            </button>
          </li>
        ))}
      </ul>
    </section>
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
