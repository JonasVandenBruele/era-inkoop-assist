import { useState } from 'react';
import { useApp } from '../../app/context';
import type { BelUitkomst, Kanaal } from '../../domain/model';
import type { Kandidaat } from '../../domain/prioriteit';

export type GedaanKanaal = 'flyer' | 'brief' | 'bezoek';

const KEUZES: Record<GedaanKanaal, { uitkomst: BelUitkomst; kanaal: Kanaal; label: string; klasse: string; melding: string }[]> = {
  bezoek: [
    { uitkomst: 'gesproken', kanaal: 'bezoek', label: '✅ Thuis — gesproken', klasse: 'goed', melding: 'Bezoek bewaard als gesprek.' },
    { uitkomst: 'bericht_verstuurd', kanaal: 'flyer', label: '📬 Niet thuis — flyer of kaartje achtergelaten', klasse: '', melding: 'Flyer achtergelaten. Even rust; daarna stelt de app een volgende stap voor.' },
    { uitkomst: 'geen_antwoord', kanaal: 'bezoek', label: '🚪 Niet thuis — niets achtergelaten', klasse: '', melding: 'Niet thuis bewaard.' },
  ],
  flyer: [{ uitkomst: 'bericht_verstuurd', kanaal: 'flyer', label: '✓ Flyer in de bus gestoken', klasse: 'goed', melding: 'Flyer geregistreerd. Even rust; daarna stelt de app een volgende stap voor.' }],
  brief: [{ uitkomst: 'bericht_verstuurd', kanaal: 'brief', label: '✓ Brief verstuurd', klasse: 'goed', melding: 'Brief geregistreerd. Even rust; daarna stelt de app een volgende stap voor.' }],
};

/** Langsgaan, flyer of brief: Jonas doet het zelf en tikt daarna wat er gebeurde. Optioneel een korte notitie. */
export function GedaanPaneel({ k, kanaal, onKlaar }: { k: Kandidaat; kanaal: GedaanKanaal; onKlaar: () => void }) {
  const { registreerBelresultaat, maakBelresultaatOngedaan, toon } = useApp();
  const [notitie, setNotitie] = useState('');
  const [bezig, setBezig] = useState(false);
  const concept = kanaal !== 'bezoek' ? k.hook?.conceptbericht : null;

  async function bewaar(keuze: (typeof KEUZES)[GedaanKanaal][number]) {
    setBezig(true);
    try {
      const r = await registreerBelresultaat({ contact: k.contact, uitkomst: keuze.uitkomst, kanaal: keuze.kanaal, notitie: notitie.trim() || null });
      toon({ tekst: keuze.melding, ongedaan: () => maakBelresultaatOngedaan(r.belpoging.id) });
      onKlaar();
    } catch (e) {
      toon({ tekst: e instanceof Error ? e.message : String(e), fout: true });
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="resultaat formulier">
      {concept && (
        <label>
          Voorstel van tekst {kanaal === 'brief' ? 'voor de brief' : 'op de flyer of het kaartje'}
          <textarea rows={5} readOnly value={concept} />
        </label>
      )}
      <label>
        Notitie (optioneel)
        <input value={notitie} onChange={(e) => setNotitie(e.target.value)} placeholder={kanaal === 'bezoek' ? 'bv. wil volgend jaar verkopen' : ''} />
      </label>
      <div className="uitkomstknoppen">
        {KEUZES[kanaal].map((x) => (
          <button key={x.label} className={`knop groot uitkomst ${x.klasse}`} disabled={bezig} onClick={() => bewaar(x)}>
            {x.label}
          </button>
        ))}
      </div>
      <p className="klein zacht">Log wat er gezegd werd zoals altijd in ERAForce; hier tik je enkel dat het gedaan is.</p>
      <button className="knop tekstknop" onClick={onKlaar}>Annuleren</button>
    </div>
  );
}
