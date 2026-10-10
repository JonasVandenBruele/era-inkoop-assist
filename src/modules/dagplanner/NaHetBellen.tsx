import { useState } from 'react';
import { useApp } from '../../app/context';
import { korteDag, plusDagen } from '../../core/dates';
import { volledigeNaam } from '../../domain/model';
import { eraforceOpvolgLink, eraforceOproepLink } from '../../domain/eraforce';
import { laatsteInhoudelijkContact } from '../../domain/overzicht';
import { pogingenSindsContact, volgendePogingDag } from '../../domain/prioriteit';
import { plusWerkdagen } from '../../domain/werkdagen';

/**
 * Na het bellen (zoals ERA Scout, 7/10/2026): "Log in ERAForce" opent een ingevulde oproeptaak op de prospect, daar typ je
 * enkel de evaluatie. "Opvolgtaak plannen" (8/10/2026) opent een tweede, open taak met de gekozen dag als vervaldatum.
 * Daarna (optioneel) één tik voor de app, zodat je lijst zich meteen aanpast.
 */
export function NaHetBellen() {
  const { oproep, sluitOproep, gegevens, registreerBelresultaat, maakBelresultaatOngedaan, toon, klok, instellingen } = useApp();
  const [terugbellen, setTerugbellen] = useState(false);
  const [terugbelDag, setTerugbelDag] = useState(plusWerkdagen(klok.vandaag(), 1));
  const [bezig, setBezig] = useState(false);
  const [gelogd, setGelogd] = useState(false);
  const [opvolgDag, setOpvolgDag] = useState<string | null>(null);
  const [eigenDag, setEigenDag] = useState(false);
  const [opvolgGeopend, setOpvolgGeopend] = useState<string | null>(null);
  if (!oproep?.vraag) return null;
  const contact = gegevens.contacten.find((c) => c.id === oproep.contactId);
  if (!contact) return null;

  const vandaag = klok.vandaag();
  const logLink = eraforceOproepLink(contact, import.meta.env.VITE_ERAFORCE_DOMEIN, vandaag);
  const opvolgLink = opvolgDag ? eraforceOpvolgLink(contact, import.meta.env.VITE_ERAFORCE_DOMEIN, opvolgDag) : null;
  const kanOpvolgen = eraforceOpvolgLink(contact, import.meta.env.VITE_ERAFORCE_DOMEIN, vandaag) !== null;
  const snelkeuzes: { label: string; dag: string }[] = [
    { label: 'Morgen', dag: plusWerkdagen(vandaag, 1) },
    { label: '1 week', dag: plusDagen(vandaag, 7) },
    { label: '2 weken', dag: plusDagen(vandaag, 14) },
    { label: '1 maand', dag: plusDagen(vandaag, 30) },
  ];
  function kiesOpvolgDag(dag: string) {
    setOpvolgDag(dag);
    setTerugbelDag(dag);
  }

  async function log(uitkomst: 'gesproken' | 'geen_antwoord' | 'terugbellen') {
    setBezig(true);
    try {
      const laatste = laatsteInhoudelijkContact(contact!.id, gegevens.activiteiten, gegevens.belpogingen);
      const pogingen = pogingenSindsContact(contact!.id, gegevens.belpogingen, laatste).filter((p) => (p.kanaal ?? 'telefoon') === 'telefoon').length;
      // Een geopende opvolgtaak is de volgende stap: meteen lokaal bewaren, zodat de lijst niet wacht op de mirror.
      const vervolg = uitkomst === 'gesproken' && opvolgGeopend ? opvolgGeopend : null;
      const r = await registreerBelresultaat({
        contact: contact!,
        uitkomst,
        terugbelDag: uitkomst === 'terugbellen' ? terugbelDag : null,
        vervolgDag: vervolg,
        volgendeStap: vervolg ? 'Telefonische opvolging (taak in ERAForce)' : null,
      });
      let tekst = '';
      if (uitkomst === 'gesproken')
        tekst = vervolg
          ? `Gesprek met ${contact!.achternaam} bewaard, opvolging op ${korteDag(vervolg)}.`
          : `Gesprek met ${contact!.achternaam} bewaard. Log de inhoud zoals altijd in ERAForce.`;
      else if (uitkomst === 'terugbellen') tekst = `Terugbellen op ${korteDag(terugbelDag)} bewaard.`;
      else {
        const volgende = volgendePogingDag(pogingen + 1, klok.vandaag(), instellingen);
        tekst = volgende ? `Geen antwoord bewaard. Volgende poging: ${korteDag(volgende)}.` : 'Geen antwoord bewaard. Staat nu bij "Handmatig beoordelen".';
        if (pogingen + 1 >= instellingen.contact.berichtNaGeenAntwoord && volgende) tekst += ' De app stelt dan een berichtje voor.';
      }
      toon({ tekst, ongedaan: () => maakBelresultaatOngedaan(r.belpoging.id) });
      sluitOproep();
    } catch (e) {
      toon({ tekst: e instanceof Error ? e.message : String(e), fout: true });
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="blad-achtergrond" role="dialog" aria-modal="true" aria-label="Hoe ging het gesprek?">
      <div className="blad">
        <p className="reden">Hoe ging het met {volledigeNaam(contact)}?</p>
        {logLink && (
          <a className={`knop groot belknop ${gelogd ? '' : 'primair'}`} href={logLink} target="_blank" rel="noreferrer" onClick={() => setGelogd(true)}>
            {gelogd ? '✓ Taak geopend in ERAForce' : '📝 Log in ERAForce'}
          </a>
        )}
        {kanOpvolgen && (
          <div className="opvolging">
            <p className="reden">📅 Opvolgtaak plannen</p>
            <div className="opvolgkeuze">
              {snelkeuzes.map((k) => (
                <button key={k.label} className={`knop ${!eigenDag && opvolgDag === k.dag ? 'primair' : ''}`} aria-pressed={!eigenDag && opvolgDag === k.dag} onClick={() => { setEigenDag(false); kiesOpvolgDag(k.dag); }}>
                  {k.label}
                </button>
              ))}
              <button className={`knop ${eigenDag ? 'primair' : ''}`} aria-pressed={eigenDag} onClick={() => { setEigenDag(true); kiesOpvolgDag(opvolgDag ?? plusWerkdagen(vandaag, 1)); }}>
                📆 Dag
              </button>
            </div>
            {eigenDag && (
              <input type="date" aria-label="Dag van de opvolging" min={plusDagen(vandaag, 1)} value={opvolgDag ?? ''} onChange={(e) => e.target.value && kiesOpvolgDag(e.target.value)} />
            )}
            {opvolgLink && opvolgDag && (
              <a
                className={`knop groot belknop ${opvolgGeopend === opvolgDag ? '' : 'primair'}`}
                href={opvolgLink}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpvolgGeopend(opvolgDag)}
              >
                {opvolgGeopend === opvolgDag ? `✓ Opvolgtaak op ${korteDag(opvolgDag)} geopend` : `📅 Opvolgtaak op ${korteDag(opvolgDag)} in ERAForce`}
              </a>
            )}
          </div>
        )}
        {!terugbellen ? (
          <div className="uitkomstknoppen">
            <button className="knop groot uitkomst goed" disabled={bezig} onClick={() => log('gesproken')}>✅ Gesproken</button>
            <button className="knop groot uitkomst" disabled={bezig} onClick={() => log('geen_antwoord')}>📵 Geen antwoord</button>
            <button className="knop groot uitkomst" disabled={bezig} onClick={() => setTerugbellen(true)}>🔁 Terugbellen op…</button>
            <button className="knop tekstknop" onClick={sluitOproep}>Later / niet loggen</button>
          </div>
        ) : (
          <div className="formulier">
            <label>
              Terugbellen op
              <input type="date" min={klok.vandaag()} value={terugbelDag} onChange={(e) => setTerugbelDag(e.target.value)} />
            </label>
            <button className="knop primair groot" disabled={bezig} onClick={() => log('terugbellen')}>Bewaren</button>
            <button className="knop tekstknop" onClick={() => setTerugbellen(false)}>← Terug</button>
          </div>
        )}
        <p className="klein zacht">
          {logLink ? '"Log in ERAForce" opent een ingevulde taak (Uitgaande Oproep, vandaag); typ je evaluatie en bewaar. ' : ''}
          {kanOpvolgen ? 'De opvolgtaak is een open taak "Telefonische opvolging" op de gekozen dag; enkel nog bewaren. ' : ''}
          De andere knoppen zijn optioneel: zo past je lijst zich meteen aan.
        </p>
      </div>
    </div>
  );
}
