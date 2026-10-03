import { useState } from 'react';
import { useApp } from '../../app/context';
import { eraforceLink, salesforceIdUitLink } from '../../domain/eraforce';
import type { Contact } from '../../domain/model';

/** "Open in ERAForce" en, zolang er geen mirror is, het contact zelf koppelen door de link uit de Salesforce-app te plakken. */
export function EraforceKoppeling({ contactId, bron, externId }: { contactId: string; bron: Contact['bron']; externId: string | null }) {
  const { gegevens, koppelAanEraforce, toon, instellingen } = useApp();
  const domein = import.meta.env.VITE_ERAFORCE_DOMEIN;
  const gekoppeld = gegevens.koppelingen.find((k) => k.contactId === contactId)?.salesforceId ?? null;
  const link = eraforceLink({ bron, externId }, domein, gekoppeld ?? instellingen.eraforce.testIdVoorIedereen);
  const [open, setOpen] = useState(false);
  const [plak, setPlak] = useState('');
  const id = salesforceIdUitLink(plak);

  if (!domein) return null;
  if (link) {
    return (
      <div className="eraforce">
        <a className="knop primair groot" href={link}>
          Open in ERAForce (bel via Maf Call)
        </a>
        {gekoppeld && (
          <button
            className="knop tekstknop"
            onClick={async () => {
              await koppelAanEraforce(contactId, null);
              toon({ tekst: 'Koppeling met ERAForce verwijderd.' });
            }}
          >
            Ontkoppelen
          </button>
        )}
      </div>
    );
  }
  if (!open) {
    return (
      <button className="knop" onClick={() => setOpen(true)}>
        🔗 Koppel aan ERAForce
      </button>
    );
  }
  return (
    <div className="formulier resultaat">
      <p className="klein zacht">
        Open de prospect in de Salesforce-app, tik op het deelicoon en kopieer de link. Plak die hier. Enkel het ID wordt bewaard.
      </p>
      <label>
        Link uit ERAForce
        <input value={plak} onChange={(e) => setPlak(e.target.value)} placeholder="https://…lightning.force.com/lightning/r/Lead/…/view" />
      </label>
      {plak && !id && <p className="foutmelding klein">Daar vind ik geen ERAForce-ID in.</p>}
      <div className="knoppenrij">
        <button
          className="knop primair"
          disabled={!id}
          onClick={async () => {
            try {
              await koppelAanEraforce(contactId, id);
              toon({ tekst: 'Gekoppeld. "Bel via ERAForce" opent nu deze prospect.' });
              setOpen(false);
            } catch (e) {
              toon({ tekst: e instanceof Error ? e.message : String(e), fout: true });
            }
          }}
        >
          Koppelen
        </button>
        <button className="knop tekstknop" onClick={() => setOpen(false)}>Annuleren</button>
      </div>
    </div>
  );
}
