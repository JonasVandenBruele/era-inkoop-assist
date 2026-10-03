import { useState } from 'react';
import { useApp } from './context';
import { InstellingenSchema, STANDAARD_INSTELLINGEN, type Instellingen } from '../core/settings/schema';

type Veld = { label: string; uitleg?: string; lees: (i: Instellingen) => number; zet: (i: Instellingen, v: number) => Instellingen };

const VELDEN: Veld[] = [
  { label: 'Ritme warm (dagen)', lees: (i) => i.ritmeDagen.warm, zet: (i, v) => ({ ...i, ritmeDagen: { ...i.ritmeDagen, warm: v } }) },
  { label: 'Ritme lauw (dagen)', lees: (i) => i.ritmeDagen.lauw, zet: (i, v) => ({ ...i, ritmeDagen: { ...i.ritmeDagen, lauw: v } }) },
  { label: 'Ritme koud (dagen)', lees: (i) => i.ritmeDagen.koud, zet: (i, v) => ({ ...i, ritmeDagen: { ...i.ritmeDagen, koud: v } }) },
  { label: 'Maximum per dag', lees: (i) => i.maxPerDag, zet: (i, v) => ({ ...i, maxPerDag: v }) },
  { label: 'Nieuwe lead tot (dagen)', uitleg: 'Zo lang krijgt een onbereikte lead voorrang.', lees: (i) => i.nieuweLeadDagen, zet: (i, v) => ({ ...i, nieuweLeadDagen: v }) },
  { label: 'Punten per ritme-eenheid', uitleg: '25 = op tijd geeft 25 punten, dubbel zo laat 50.', lees: (i) => i.gewichten.ritmePerVerhouding, zet: (i, v) => ({ ...i, gewichten: { ...i.gewichten, ritmePerVerhouding: v } }) },
  { label: 'Maximum ritmepunten', lees: (i) => i.gewichten.ritmeMax, zet: (i, v) => ({ ...i, gewichten: { ...i.gewichten, ritmeMax: v } }) },
  { label: 'Punten fase warm', lees: (i) => i.gewichten.faseWarm, zet: (i, v) => ({ ...i, gewichten: { ...i.gewichten, faseWarm: v } }) },
  { label: 'Punten fase lauw', lees: (i) => i.gewichten.faseLauw, zet: (i, v) => ({ ...i, gewichten: { ...i.gewichten, faseLauw: v } }) },
  { label: 'Punten horizon < 3 maanden', lees: (i) => i.gewichten.horizonKort, zet: (i, v) => ({ ...i, gewichten: { ...i.gewichten, horizonKort: v } }) },
  { label: 'Punten horizon 3–12 maanden', lees: (i) => i.gewichten.horizonMiddel, zet: (i, v) => ({ ...i, gewichten: { ...i.gewichten, horizonMiddel: v } }) },
  { label: 'Punten eigen vervolgstap', lees: (i) => i.gewichten.eigenVervolgstap, zet: (i, v) => ({ ...i, gewichten: { ...i.gewichten, eigenVervolgstap: v } }) },
  { label: 'Max. belpogingen zonder antwoord op rij', lees: (i) => i.geenAntwoord.maxPogingenOpRij, zet: (i, v) => ({ ...i, geenAntwoord: { ...i.geenAntwoord, maxPogingenOpRij: v } }) },
  { label: 'Punten voor een hook', uitleg: 'Een concrete hook (buurt, dossier, persoonlijk) geeft voorrang.', lees: (i) => i.gewichten.waardehaak, zet: (i, v) => ({ ...i, gewichten: { ...i.gewichten, waardehaak: v } }) },
  { label: 'Bericht voorstellen na … keer geen antwoord', lees: (i) => i.contact.berichtNaGeenAntwoord, zet: (i, v) => ({ ...i, contact: { ...i.contact, berichtNaGeenAntwoord: v } }) },
  { label: 'Werkdagen rust na een bericht', lees: (i) => i.contact.werkdagenNaBericht, zet: (i, v) => ({ ...i, contact: { ...i.contact, werkdagenNaBericht: v } }) },
];

export function PlanningInstellingen() {
  const { instellingen, wijzigInstellingen } = useApp();
  const [concept, setConcept] = useState<Instellingen>(instellingen);
  const [bericht, setBericht] = useState<{ fout: boolean; tekst: string } | null>(null);
  const gewijzigd = JSON.stringify(concept) !== JSON.stringify(instellingen);

  async function bewaar(nieuw: Instellingen) {
    const r = InstellingenSchema.safeParse(nieuw);
    if (!r.success) {
      setBericht({ fout: true, tekst: 'Niet bewaard: controleer de waarden (enkel positieve gehele getallen).' });
      return;
    }
    try {
      await wijzigInstellingen(r.data);
      setConcept(r.data);
      setBericht({ fout: false, tekst: 'Bewaard. De bellijst is herberekend.' });
    } catch (e) {
      setBericht({ fout: true, tekst: `Niet bewaard: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  return (
    <section className="kaart">
      <h2>Planning</h2>
      <p className="zacht klein">Wijzigingen gelden meteen voor de bellijst. De app past deze waarden nooit zelf aan.</p>
      <label className="formulier">
        Jouw voornaam (voor de openingszin)
        <input value={concept.gebruiker.voornaam} onChange={(e) => setConcept({ ...concept, gebruiker: { ...concept.gebruiker, voornaam: e.target.value } })} />
      </label>
      <div className="instellingenrooster">
        {VELDEN.map((v) => (
          <label key={v.label}>
            <span>{v.label}</span>
            {v.uitleg && <span className="klein zacht">{v.uitleg}</span>}
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={v.lees(concept)}
              onChange={(e) => setConcept(v.zet(concept, e.target.value === '' ? 0 : Number(e.target.value)))}
            />
          </label>
        ))}
      </div>
      {bericht && <p className={bericht.fout ? 'foutmelding' : 'infomelding'}>{bericht.tekst}</p>}
      <div className="knoppenrij">
        <button className="knop primair" disabled={!gewijzigd} onClick={() => bewaar(concept)}>
          Bewaren
        </button>
        <button
          className="knop"
          onClick={() =>
            bewaar({
              ...concept,
              ritmeDagen: STANDAARD_INSTELLINGEN.ritmeDagen,
              maxPerDag: STANDAARD_INSTELLINGEN.maxPerDag,
              nieuweLeadDagen: STANDAARD_INSTELLINGEN.nieuweLeadDagen,
              gewichten: STANDAARD_INSTELLINGEN.gewichten,
              geenAntwoord: STANDAARD_INSTELLINGEN.geenAntwoord,
              contact: STANDAARD_INSTELLINGEN.contact,
            })
          }
        >
          Standaardwaarden
        </button>
      </div>
    </section>
  );
}
