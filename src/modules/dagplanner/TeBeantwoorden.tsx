import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../app/context';
import { openWhatsapp } from '../../app/whatsapp';
import { dagVan, korteDag, uurVan } from '../../core/dates';
import { eraforceTaakLink } from '../../domain/eraforce';
import type { WhatsappOpen } from '../../domain/model';

/**
 * WhatsApp: te beantwoorden (7/10/2026). Open chats op je zakelijke nummer (de klant schreef het laatst) met een
 * antwoord in jouw stijl dat klaarstaat. Bijgewerkt op de Mac, elk half uur tussen 8 en 20 uur.
 */
export function TeBeantwoorden() {
  const { gegevens } = useApp();
  const open = gegevens.whatsappOpen.filter((w) => w.nodig && !w.afgehandeldOp).sort((a, b) => a.laatsteOp.getTime() - b.laatsteOp.getTime());
  const zonder = gegevens.whatsappOpen.filter((w) => !w.nodig && !w.afgehandeldOp).length;
  if (open.length === 0) return null;
  return (
    <section>
      <h2>WhatsApp te beantwoorden ({open.length})</h2>
      <p className="klein zacht">
        De klant schreef het laatst; je antwoord staat klaar (pas gerust aan). Oudste eerst.
        {zonder > 0 && ` ${zonder} ${zonder === 1 ? 'chat heeft' : 'chats hebben'} geen antwoord nodig.`}
      </p>
      <ul className="lijst">
        {open.map((w) => (
          <WhatsappKaart key={w.id} w={w} />
        ))}
      </ul>
    </section>
  );
}

function WhatsappKaart({ w }: { w: WhatsappOpen }) {
  const { gegevens, instellingen, klok, handelWhatsappAf, toon } = useApp();
  const [tekst, setTekst] = useState(w.antwoord ?? '');
  const [geopend, setGeopend] = useState(false);
  const contact = w.contactId ? gegevens.contacten.find((c) => c.id === w.contactId) : undefined;
  const vandaag = klok.vandaag();
  const dag = dagVan(w.laatsteOp);
  const wanneer = dag === vandaag ? `vandaag ${uurVan(w.laatsteOp)}` : `${korteDag(dag)} ${uurVan(w.laatsteOp)}`;
  const logLink = contact ? eraforceTaakLink(contact, import.meta.env.VITE_ERAFORCE_DOMEIN, vandaag, 'whatsapp', tekst) : null;

  const afhandelen = async (bericht: string) => {
    try {
      await handelWhatsappAf(w.id);
      toon({ tekst: bericht });
    } catch (e) {
      toon({ tekst: e instanceof Error ? e.message : String(e), fout: true });
    }
  };

  return (
    <li className="kaart belkaart whatsapp-open">
      <div className="belkaart-kop">
        <div className="belkaart-naam">
          {contact ? (
            <Link to={`/contact/${contact.id}`}>
              <strong>{w.naam ?? `+${w.nummer}`}</strong>
            </Link>
          ) : (
            <strong>{w.naam ?? `+${w.nummer}`}</strong>
          )}
          <div className="klein zacht">
            🟢 {wanneer}
            {!contact && ' · niet in ERAForce'}
          </div>
        </div>
      </div>
      {w.reden && <p className="reden">{w.reden}</p>}
      <div className="klein">
        {w.klantBerichten.map((b, i) => (
          <p key={i} className="citaat">
            “{b.tekst}”
          </p>
        ))}
      </div>
      <label className="formulier">
        <span className="klein zacht">Antwoord (klaar, pas gerust aan)</span>
        <textarea rows={4} value={tekst} onChange={(e) => setTekst(e.target.value)} />
      </label>
      <div className="knoppenrij">
        <button
          className="knop primair belknop"
          onClick={() => {
            setGeopend(true);
            openWhatsapp(w.nummer, tekst, instellingen.whatsappApp);
          }}
        >
          🟢 Open in WhatsApp{instellingen.whatsappApp === 'business' ? ' Business' : ''}
        </button>
        {logLink ? (
          <a className={`knop ${geopend ? 'primair' : ''}`} href={logLink} target="_blank" rel="noreferrer" onClick={() => void afhandelen(`Antwoord aan ${w.naam ?? 'klant'} afgevinkt; log het in ERAForce.`)}>
            ✓ Verstuurd — log in ERAForce
          </a>
        ) : (
          <button className={`knop ${geopend ? 'primair' : ''}`} onClick={() => void afhandelen(`Antwoord aan ${w.naam ?? 'klant'} afgevinkt.`)}>
            ✓ Verstuurd
          </button>
        )}
      </div>
      <button className="knop tekstknop klein" onClick={() => void afhandelen('Verborgen tot er een nieuw bericht komt.')}>
        Geen antwoord nodig
      </button>
    </li>
  );
}
