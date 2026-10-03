import { useState } from 'react';
import { useApp } from '../../app/context';
import { plusDagen } from '../../core/dates';
import { haakLabel, hakenVoorContact, isGevoelig } from '../../domain/haken';
import type { Contact, Contactvoorkeur, HaakSoort } from '../../domain/model';

/** Ossenpikker op de contactpagina: waardehaken en contactvoorkeur. */
export function HakenEnVoorkeur({ contact }: { contact: Contact }) {
  const { gegevens, klok } = useApp();
  const haken = hakenVoorContact({
    contact,
    panden: gegevens.panden,
    contactPanden: gegevens.contactPanden,
    haken: gegevens.haken,
    activiteiten: gegevens.activiteiten,
    vandaag: klok.vandaag(),
  });

  return (
    <section className="kaart">
      <h2>Hooks en voorkeur</h2>
      <p className="klein zacht">Altijd aanwezig, nooit opdringerig: geef bij elk contact iets nuttigs. Tip: kijk zelf even op sociale media of in de buurt en noteer hier wat bruikbaar is.</p>
      <HakenLijst haken={haken} />
      <NieuweHaak contact={contact} />
      <VoorkeurFormulier contact={contact} huidig={gegevens.voorkeuren.find((v) => v.contactId === contact.id) ?? null} />
    </section>
  );
}

function HakenLijst({ haken }: { haken: ReturnType<typeof hakenVoorContact> }) {
  const { verwijderHaak, toon } = useApp();
  if (haken.length === 0) return <p className="klein">Nog geen geldige hooks.</p>;
  return (
    <ul className="lijst compact lokaal-lijst">
      {haken.map((h) => (
        <li key={h.id}>
          {h.soort === 'persoonlijk' ? '🙂' : h.soort === 'algemeen' ? '📰' : '💡'} {haakLabel(h)}
          {h.afgeleid && <span className="zacht klein"> · automatisch uit het dossier</span>}
          {!h.contactId && !h.afgeleid && <span className="zacht klein"> · geldt voor {h.gemeente ? `iedereen in de ${h.straat ?? ''} (${h.gemeente})` : 'alle contacten'}</span>}
          {h.bron && !h.afgeleid && <span className="zacht klein"> · bron: {h.bron}</span>}
          {!h.afgeleid && (
            <button
              className="knop tekstknop"
              onClick={async () => {
                await verwijderHaak(h.id);
                toon({ tekst: 'Hook verwijderd.' });
              }}
            >
              Verwijderen
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function NieuweHaak({ contact }: { contact: Contact }) {
  const { bewaarHaak, gegevens, klok, toon } = useApp();
  const [open, setOpen] = useState(false);
  const [soort, setSoort] = useState<HaakSoort>('persoonlijk');
  const [onderwerp, setOnderwerp] = useState('');
  const [bron, setBron] = useState('');
  const [geldigTot, setGeldigTot] = useState(plusDagen(klok.vandaag(), 30));
  const [voorStraat, setVoorStraat] = useState(false);
  const pand = gegevens.contactPanden.filter((cp) => cp.contactId === contact.id).map((cp) => gegevens.panden.find((p) => p.id === cp.pandId)).find(Boolean);
  const gevoelig = isGevoelig(onderwerp);

  if (!open) return <button className="knop" onClick={() => setOpen(true)}>＋ Hook toevoegen</button>;

  return (
    <div className="formulier resultaat">
      <label>
        Soort
        <select value={soort} onChange={(e) => setSoort(e.target.value as HaakSoort)}>
          <option value="persoonlijk">🙂 Persoonlijk (enkel tip voor jou)</option>
          <option value="buurt">💡 Buurt (bv. verkoop in de straat)</option>
          <option value="dossier">💡 Dossier (bv. verbouwing klaar)</option>
          <option value="algemeen">📰 Algemeen (voor alle contacten)</option>
        </select>
      </label>
      <label>
        Wat?
        <input value={onderwerp} onChange={(e) => setOnderwerp(e.target.value)} placeholder={soort === 'persoonlijk' ? 'bv. verjaardag 14/10' : 'bv. woning nr. 12 verkocht'} />
      </label>
      {gevoelig && <p className="foutmelding klein">Dit lijkt een gevoelig onderwerp. Zulke onderwerpen gebruikt de app nooit als hook.</p>}
      {soort === 'buurt' && pand && (
        <label className="vinkje">
          <input type="checkbox" checked={voorStraat} onChange={(e) => setVoorStraat(e.target.checked)} />
          Geldt voor iedereen met een pand in de {pand.straat.replace(/\s+\d.*$/, '')} ({pand.gemeente})
        </label>
      )}
      {soort !== 'persoonlijk' && (
        <label>
          Bron (optioneel)
          <input value={bron} onChange={(e) => setBron(e.target.value)} placeholder="bv. Immoweb, buurman, krant" />
        </label>
      )}
      <label>
        Geldig tot
        <input type="date" min={klok.vandaag()} value={geldigTot} onChange={(e) => setGeldigTot(e.target.value)} />
      </label>
      <div className="knoppenrij">
        <button
          className="knop primair"
          disabled={!onderwerp.trim() || gevoelig}
          onClick={async () => {
            try {
              const straatHaak = soort === 'buurt' && voorStraat && pand;
              await bewaarHaak({
                contactId: soort === 'algemeen' || straatHaak ? null : contact.id,
                pandId: null,
                straat: straatHaak ? pand.straat.replace(/\s+\d.*$/, '') : null,
                gemeente: straatHaak ? pand.gemeente : null,
                soort,
                onderwerp: onderwerp.trim(),
                detail: null,
                bron: soort === 'persoonlijk' ? 'zelf ingegeven' : bron.trim() || null,
                geldigVanaf: klok.vandaag(),
                geldigTot: geldigTot || null,
                gevoelig: false,
              });
              toon({ tekst: 'Hook bewaard.' });
              setOnderwerp('');
              setOpen(false);
            } catch (e) {
              toon({ tekst: e instanceof Error ? e.message : String(e), fout: true });
            }
          }}
        >
          Bewaren
        </button>
        <button className="knop tekstknop" onClick={() => setOpen(false)}>Annuleren</button>
      </div>
    </div>
  );
}

function VoorkeurFormulier({ contact, huidig }: { contact: Contact; huidig: Contactvoorkeur | null }) {
  const { bewaarVoorkeur, toon } = useApp();
  const [kanaal, setKanaal] = useState<Contactvoorkeur['kanaal']>(huidig?.kanaal ?? 'geen');
  const [nietVoor, setNietVoor] = useState(huidig?.nietVoor ?? '');
  const [nietNa, setNietNa] = useState(huidig?.nietNa ?? '');
  const [notitie, setNotitie] = useState(huidig?.notitie ?? '');
  const gewijzigd = kanaal !== (huidig?.kanaal ?? 'geen') || nietVoor !== (huidig?.nietVoor ?? '') || nietNa !== (huidig?.nietNa ?? '') || notitie !== (huidig?.notitie ?? '');

  return (
    <div className="formulier voorkeur">
      <h3>Contactvoorkeur</h3>
      <label>
        Liefst via
        <select value={kanaal} onChange={(e) => setKanaal(e.target.value as Contactvoorkeur['kanaal'])}>
          <option value="geen">Geen voorkeur (app beslist)</option>
          <option value="bellen">📞 Bellen</option>
          <option value="bericht">💬 Berichtje</option>
          <option value="mail">✉️ Mail</option>
        </select>
      </label>
      <div className="tweekoloms">
        <label>
          Niet bellen vóór
          <input type="time" value={nietVoor} onChange={(e) => setNietVoor(e.target.value)} />
        </label>
        <label>
          Niet bellen na
          <input type="time" value={nietNa} onChange={(e) => setNietNa(e.target.value)} />
        </label>
      </div>
      <label>
        Notitie
        <input value={notitie} onChange={(e) => setNotitie(e.target.value)} placeholder="bv. werkt in ploegen" />
      </label>
      <button
        className="knop"
        disabled={!gewijzigd}
        onClick={async () => {
          try {
            await bewaarVoorkeur({ contactId: contact.id, kanaal, nietVoor: nietVoor || null, nietNa: nietNa || null, notitie: notitie.trim() || null });
            toon({ tekst: 'Voorkeur bewaard. Het kanaaladvies houdt er voortaan rekening mee.' });
          } catch (e) {
            toon({ tekst: e instanceof Error ? e.message : String(e), fout: true });
          }
        }}
      >
        Voorkeur bewaren
      </button>
    </div>
  );
}
