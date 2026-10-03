import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp, type NieuwContact } from '../../app/context';
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
      <NieuwContactFormulier />
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

/** Tijdelijk lokaal contact, bv. een lead die nog niet in ERAForce staat. Komt meteen op de lijst van vandaag. */
function NieuwContactFormulier() {
  const { maakTijdelijkContact, toon } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<NieuwContact>({ aanhef: 'Dhr.', voornaam: '', achternaam: '', telefoon: '', gemeente: '', notitie: '' });
  const [bezig, setBezig] = useState(false);
  const zet = (k: keyof NieuwContact) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });

  if (!open) {
    return (
      <button className="knop groot" onClick={() => setOpen(true)}>
        ＋ Tijdelijk contact toevoegen
      </button>
    );
  }
  return (
    <section className="kaart formulier">
      <h2>Tijdelijk contact</h2>
      <p className="klein zacht">Voor iemand die nog niet in ERAForce staat. Komt meteen op je lijst van vandaag. Gebruik voorlopig enkel verzonnen gegevens.</p>
      <div className="tweekoloms">
        <label>
          Aanhef
          <select value={v.aanhef ?? ''} onChange={zet('aanhef')}>
            <option>Dhr.</option>
            <option>Mevr.</option>
            <option>Fam.</option>
          </select>
        </label>
        <label>
          Voornaam
          <input value={v.voornaam ?? ''} onChange={zet('voornaam')} />
        </label>
      </div>
      <label>
        Achternaam *
        <input value={v.achternaam} onChange={zet('achternaam')} required />
      </label>
      <label>
        Telefoon
        <input type="tel" value={v.telefoon ?? ''} onChange={zet('telefoon')} placeholder="+32 4.. .. .. .." />
      </label>
      <label>
        Gemeente
        <input value={v.gemeente ?? ''} onChange={zet('gemeente')} />
      </label>
      <label>
        Herkomst / notitie
        <input value={v.notitie ?? ''} onChange={zet('notitie')} placeholder="bv. belde naar kantoor" />
      </label>
      <div className="knoppenrij">
        <button
          className="knop primair"
          disabled={bezig || !v.achternaam.trim()}
          onClick={async () => {
            setBezig(true);
            try {
              const c = await maakTijdelijkContact({
                aanhef: v.aanhef,
                voornaam: v.voornaam?.trim() || null,
                achternaam: v.achternaam.trim(),
                telefoon: v.telefoon?.trim() || null,
                gemeente: v.gemeente?.trim() || null,
                notitie: v.notitie?.trim() || null,
              });
              toon({ tekst: `${c.achternaam} toegevoegd en vastgepind voor vandaag.` });
              navigate(`/contact/${c.id}`);
            } catch (e) {
              toon({ tekst: e instanceof Error ? e.message : String(e), fout: true });
            } finally {
              setBezig(false);
            }
          }}
        >
          Toevoegen
        </button>
        <button className="knop tekstknop" onClick={() => setOpen(false)}>Annuleren</button>
      </div>
    </section>
  );
}
