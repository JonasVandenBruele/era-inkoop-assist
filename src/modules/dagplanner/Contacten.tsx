import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../app/context';
import { FASE_LABEL, STATUS_LABEL } from '../../app/labels';
import { dagVan, relatief } from '../../core/dates';
import { volledigeNaam, type ContactStatus } from '../../domain/model';
import { heeftTelefoon, laatsteInhoudelijkContact } from '../../domain/overzicht';
import { berekenBellijst } from '../../domain/prioriteit';

const STATUS_VOLGORDE: ContactStatus[] = ['nieuwe_lead', 'prospect', 'langetermijn'];

/** Alle contacten, met zoeken. Toont ook waarom iemand vandaag niet op de lijst staat. */
export function Contacten() {
  const { gegevens, klok, instellingen } = useApp();
  const [zoek, setZoek] = useState('');
  const vandaag = klok.vandaag();

  const statusVandaag = useMemo(() => {
    const l = berekenBellijst({ ...gegevens, instellingen, vandaag });
    const m = new Map<string, string>();
    l.vandaag.forEach((k) => m.set(k.contact.id, 'Op de bellijst van vandaag'));
    l.nietOpLijst.forEach((k) => m.set(k.contact.id, 'Aan de beurt, past niet meer op vandaag'));
    l.nummerZoeken.forEach((k) => m.set(k.contact.id, 'Nummer zoeken'));
    l.handmatigBeoordelen.forEach((k) => m.set(k.contact.id, 'Handmatig beoordelen'));
    l.uitgesloten.forEach((u) => m.set(u.contact.id, u.detail));
    return m;
  }, [gegevens, instellingen, vandaag]);

  const groepen = useMemo(() => {
    const z = zoek.trim().toLowerCase();
    return STATUS_VOLGORDE.map((status) => ({
      status,
      contacten: gegevens.contacten
        .filter((c) => c.statusBron === status)
        .filter((c) => !z || `${volledigeNaam(c)} ${c.gemeente ?? ''} ${c.straat ?? ''}`.toLowerCase().includes(z))
        .map((c) => ({ contact: c, laatste: laatsteInhoudelijkContact(c.id, gegevens.activiteiten, gegevens.belpogingen) }))
        .sort((a, b) => volledigeNaam(a.contact).localeCompare(volledigeNaam(b.contact))),
    }));
  }, [gegevens, zoek]);

  return (
    <>
      <header className="paginakop">
        <h1>Contacten</h1>
      </header>
      <input type="search" placeholder="Zoek op naam, straat of gemeente" value={zoek} onChange={(e) => setZoek(e.target.value)} aria-label="Zoeken" />
      {groepen.map((g) => (
        <details key={g.status} open={Boolean(zoek) || g.status === 'nieuwe_lead'} className="groep">
          <summary>
            {STATUS_LABEL[g.status]} <span className="zacht">({g.contacten.length})</span>
          </summary>
          <ul className="lijst">
            {g.contacten.map(({ contact: c, laatste }) => (
              <li key={c.id}>
                <Link to={`/contact/${c.id}`} className="kaart contactrij">
                  <div>
                    <strong>{c.aanhef ? `${c.aanhef} ` : ''}{volledigeNaam(c)}</strong>
                    <div className="zacht klein">
                      {c.gemeente ?? 'gemeente onbekend'} · {laatste ? `laatste gesprek ${relatief(dagVan(laatste.tijdstip), vandaag)}` : 'nog niet bereikt'}
                    </div>
                    <div className="klein">{statusVandaag.get(c.id)}</div>
                  </div>
                  <div className="labels rechts">
                    {c.faseBron && <span className={`label fase-${c.faseBron}`}>{FASE_LABEL[c.faseBron]}</span>}
                    {c.nietBellenBron && <span className="label gevaar">Niet bellen</span>}
                    {!heeftTelefoon(c) && <span className="label waarschuwing">Geen nummer</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </>
  );
}
