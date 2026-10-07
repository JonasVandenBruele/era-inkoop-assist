import { useState } from 'react';
import { useApp } from '../../app/context';
import { korteDag } from '../../core/dates';
import { volledigeNaam } from '../../domain/model';
import { eraforceOproepLink } from '../../domain/eraforce';
import { laatsteInhoudelijkContact } from '../../domain/overzicht';
import { pogingenSindsContact, volgendePogingDag } from '../../domain/prioriteit';
import { plusWerkdagen } from '../../domain/werkdagen';

/**
 * Na het bellen (zoals ERA Scout, 7/10/2026): "Log in ERAForce" opent een ingevulde oproeptaak op de prospect, daar typ je
 * enkel de evaluatie. Daarna (optioneel) één tik voor de app, zodat je lijst zich meteen aanpast.
 */
export function NaHetBellen() {
  const { oproep, sluitOproep, gegevens, registreerBelresultaat, maakBelresultaatOngedaan, toon, klok, instellingen } = useApp();
  const [terugbellen, setTerugbellen] = useState(false);
  const [terugbelDag, setTerugbelDag] = useState(plusWerkdagen(klok.vandaag(), 1));
  const [bezig, setBezig] = useState(false);
  const [gelogd, setGelogd] = useState(false);
  if (!oproep?.vraag) return null;
  const contact = gegevens.contacten.find((c) => c.id === oproep.contactId);
  if (!contact) return null;

  const logLink = eraforceOproepLink(contact, import.meta.env.VITE_ERAFORCE_DOMEIN, klok.vandaag());

  async function log(uitkomst: 'gesproken' | 'geen_antwoord' | 'terugbellen') {
    setBezig(true);
    try {
      const laatste = laatsteInhoudelijkContact(contact!.id, gegevens.activiteiten, gegevens.belpogingen);
      const pogingen = pogingenSindsContact(contact!.id, gegevens.belpogingen, laatste).filter((p) => (p.kanaal ?? 'telefoon') === 'telefoon').length;
      const r = await registreerBelresultaat({ contact: contact!, uitkomst, terugbelDag: uitkomst === 'terugbellen' ? terugbelDag : null });
      let tekst = '';
      if (uitkomst === 'gesproken') tekst = `Gesprek met ${contact!.achternaam} bewaard. Log de inhoud zoals altijd in ERAForce.`;
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
          De andere knoppen zijn optioneel: zo past je lijst zich meteen aan.
        </p>
      </div>
    </div>
  );
}
