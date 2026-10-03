import { useState } from 'react';
import { useApp } from '../../app/context';
import { korteDag } from '../../core/dates';
import type { BelUitkomst, Contact } from '../../domain/model';
import { volgendePogingDag } from '../../domain/prioriteit';
import { plusWerkdagen } from '../../domain/werkdagen';
import { OngeldigBelresultaat } from '../../domain/belresultaat';

const KNOPPEN: { uitkomst: BelUitkomst; label: string; klasse: string }[] = [
  { uitkomst: 'gesproken', label: '✅ Gesproken', klasse: 'goed' },
  { uitkomst: 'geen_antwoord', label: '📵 Geen antwoord', klasse: '' },
  { uitkomst: 'terugbellen', label: '🔁 Terugbellen op datum', klasse: '' },
  { uitkomst: 'afspraak', label: '📅 Afspraak gemaakt', klasse: 'goed' },
  { uitkomst: 'niet_meer_bellen', label: '⛔ Niet meer bellen', klasse: 'gevaar' },
];

/** Belresultaat ingeven met zo weinig mogelijk tikken. "Geen antwoord" bewaart meteen. */
export function ResultaatPaneel({ contact, pogingenZonderAntwoord, onKlaar }: { contact: Contact; pogingenZonderAntwoord: number; onKlaar: () => void }) {
  const { registreerBelresultaat, maakBelresultaatOngedaan, toon, klok, instellingen } = useApp();
  const vandaag = klok.vandaag();
  const [uitkomst, setUitkomst] = useState<BelUitkomst | null>(null);
  const [notitie, setNotitie] = useState('');
  const [volgendeStap, setVolgendeStap] = useState('');
  const [vervolgDag, setVervolgDag] = useState('');
  const [terugbelDag, setTerugbelDag] = useState(plusWerkdagen(vandaag, 1));
  const [terugbelUur, setTerugbelUur] = useState('');
  const [teltAlsGesprek, setTeltAlsGesprek] = useState(true);
  const [afspraakDag, setAfspraakDag] = useState(plusWerkdagen(vandaag, 1));
  const [afspraakUur, setAfspraakUur] = useState('10:00');
  const [duur, setDuur] = useState(60);
  const [bevestigVerbod, setBevestigVerbod] = useState(false);
  const [reactieKanaal, setReactieKanaal] = useState<'sms' | 'whatsapp' | 'mail'>('sms');
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  async function bewaar(gekozen: BelUitkomst) {
    setBezig(true);
    setFout(null);
    try {
      const r = await registreerBelresultaat({
        contact,
        uitkomst: gekozen,
        kanaal: gekozen === 'reactie' ? reactieKanaal : 'telefoon',
        notitie,
        volgendeStap,
        vervolgDag: vervolgDag || null,
        terugbelDag,
        terugbelUur: terugbelUur || null,
        teltAlsGesprek,
        afspraak: { dag: afspraakDag, start: afspraakUur, duurMinuten: duur },
        reden: notitie,
      });
      let tekst = `Gesprek met ${contact.achternaam} bewaard.`;
      if (gekozen === 'geen_antwoord') {
        const volgende = volgendePogingDag(pogingenZonderAntwoord + 1, vandaag, instellingen);
        tekst = volgende
          ? `Geen antwoord bewaard. Volgende poging: ${korteDag(volgende)}.`
          : `Geen antwoord bewaard. Dat is ${pogingenZonderAntwoord + 1}× op rij — staat nu bij "Handmatig beoordelen".`;
      } else if (gekozen === 'terugbellen') tekst = `Terugbellen op ${korteDag(terugbelDag)}${terugbelUur ? ` om ${terugbelUur}` : ''} bewaard.`;
      else if (gekozen === 'afspraak') tekst = `Afspraak op ${korteDag(afspraakDag)} om ${afspraakUur} bewaard (enkel in de app, niet in je ERAForce-agenda).`;
      else if (gekozen === 'niet_meer_bellen') tekst = 'Belverbod bewaard. Dit contact verschijnt niet meer op de lijst.';
      toon({ tekst, ongedaan: () => maakBelresultaatOngedaan(r.belpoging.id) });
      onKlaar();
    } catch (e) {
      setFout(e instanceof OngeldigBelresultaat || e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(false);
    }
  }

  if (!uitkomst) {
    return (
      <div className="resultaat">
        <div className="uitkomstknoppen">
          {KNOPPEN.map((k) => (
            <button
              key={k.uitkomst}
              className={`knop groot uitkomst ${k.klasse}`}
              disabled={bezig}
              onClick={() => (k.uitkomst === 'geen_antwoord' ? bewaar('geen_antwoord') : setUitkomst(k.uitkomst))}
            >
              {k.label}
            </button>
          ))}
        </div>
        {fout && <p className="foutmelding">{fout}</p>}
        <button className="knop tekstknop" onClick={onKlaar}>Annuleren</button>
      </div>
    );
  }

  return (
    <div className="resultaat formulier">
      <p className="reden">{KNOPPEN.find((k) => k.uitkomst === uitkomst)!.label}</p>

      {uitkomst === 'terugbellen' && (
        <>
          <div className="tweekoloms">
            <label>
              Dag
              <input type="date" min={vandaag} value={terugbelDag} onChange={(e) => setTerugbelDag(e.target.value)} />
            </label>
            <label>
              Uur (optioneel)
              <input type="time" value={terugbelUur} onChange={(e) => setTerugbelUur(e.target.value)} />
            </label>
          </div>
          <label className="vinkje">
            <input type="checkbox" checked={teltAlsGesprek} onChange={(e) => setTeltAlsGesprek(e.target.checked)} />
            Ik sprak de persoon zelf (telt als gesprek)
          </label>
        </>
      )}

      {uitkomst === 'reactie' && (
        <label>
          Via
          <select value={reactieKanaal} onChange={(e) => setReactieKanaal(e.target.value as 'sms' | 'whatsapp' | 'mail')}>
            <option value="sms">Sms</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="mail">Mail</option>
          </select>
        </label>
      )}

      {uitkomst === 'afspraak' && (
        <div className="tweekoloms">
          <label>
            Dag
            <input type="date" min={vandaag} value={afspraakDag} onChange={(e) => setAfspraakDag(e.target.value)} />
          </label>
          <label>
            Uur
            <input type="time" value={afspraakUur} onChange={(e) => setAfspraakUur(e.target.value)} />
          </label>
          <label>
            Duur (min.)
            <input type="number" inputMode="numeric" min={15} step={15} value={duur} onChange={(e) => setDuur(Number(e.target.value))} />
          </label>
        </div>
      )}

      <label>
        {uitkomst === 'niet_meer_bellen' ? 'Reden (optioneel)' : 'Korte notitie (optioneel)'}
        <textarea rows={2} value={notitie} onChange={(e) => setNotitie(e.target.value)} />
      </label>

      {uitkomst === 'gesproken' && (
        <>
          <label>
            Volgende stap (optioneel)
            <input value={volgendeStap} onChange={(e) => setVolgendeStap(e.target.value)} placeholder="bv. referenties mailen" />
          </label>
          <label>
            Op dag (optioneel)
            <input type="date" min={vandaag} value={vervolgDag} onChange={(e) => setVervolgDag(e.target.value)} />
          </label>
        </>
      )}

      {fout && <p className="foutmelding">{fout}</p>}

      <div className="knoppenrij">
        {uitkomst === 'niet_meer_bellen' && !bevestigVerbod ? (
          <button className="knop gevaar groot" onClick={() => setBevestigVerbod(true)}>
            Niet meer bellen…
          </button>
        ) : (
          <button className={`knop groot ${uitkomst === 'niet_meer_bellen' ? 'gevaar' : 'primair'}`} disabled={bezig} onClick={() => bewaar(uitkomst)}>
            {bezig ? 'Bewaren…' : uitkomst === 'niet_meer_bellen' ? 'Ja, dit contact nooit meer bellen' : 'Bewaren'}
          </button>
        )}
      </div>
      {uitkomst === 'niet_meer_bellen' && bevestigVerbod && (
        <p className="klein zacht">Dit is iets anders dan "vandaag overslaan": het contact verschijnt niet meer, tot je het belverbod intrekt.</p>
      )}
      <button className="knop tekstknop" onClick={() => setUitkomst(null)}>← Ander resultaat</button>
    </div>
  );
}

/** Vandaag overslaan, uitstellen tot datum of vastpinnen. */
export function KeuzeKnoppen({ contactId, toonVastpinnen }: { contactId: string; toonVastpinnen: boolean }) {
  const { kies, klok, toon } = useApp();
  const [uitstellen, setUitstellen] = useState(false);
  const [totDag, setTotDag] = useState(plusWerkdagen(klok.vandaag(), 5));
  const doe = async (f: () => Promise<void>) => {
    try {
      await f();
    } catch (e) {
      toon({ tekst: e instanceof Error ? e.message : String(e), fout: true });
    }
  };

  if (uitstellen) {
    return (
      <div className="knoppenrij">
        <input type="date" min={klok.vandaag()} value={totDag} onChange={(e) => setTotDag(e.target.value)} aria-label="Uitstellen tot" />
        <button className="knop primair" onClick={() => doe(() => kies(contactId, 'uitstellen', totDag))}>
          Uitstellen
        </button>
        <button className="knop tekstknop" onClick={() => setUitstellen(false)}>Annuleren</button>
      </div>
    );
  }
  return (
    <div className="knoppenrij kleine-knoppen">
      {toonVastpinnen && (
        <button className="knop" onClick={() => doe(() => kies(contactId, 'vastpinnen'))}>
          📌 Op lijst vandaag
        </button>
      )}
      <button className="knop" onClick={() => doe(() => kies(contactId, 'vandaag_overslaan'))}>
        Vandaag overslaan
      </button>
      <button className="knop" onClick={() => setUitstellen(true)}>
        Uitstellen…
      </button>
    </div>
  );
}
