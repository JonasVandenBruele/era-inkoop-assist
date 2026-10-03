import { useMemo, useState } from 'react';
import { useApp } from '../../app/context';
import { uurVan } from '../../core/dates';
import { berichtLink, berichtTekst } from '../../domain/berichten';
import { berichtNuGepast } from '../../domain/kanaaladvies';
import type { Kandidaat } from '../../domain/prioriteit';

type BerichtKanaal = 'sms' | 'whatsapp' | 'mail';

/**
 * Bericht of mail opstellen met een voorgestelde tekst. De app opent Berichten, WhatsApp of Mail;
 * Jonas verstuurt zelf en tikt daarna "verstuurd". Er wordt nooit automatisch iets verstuurd.
 */
export function BerichtPaneel({ k, start, onKlaar }: { k: Kandidaat; start: BerichtKanaal; onKlaar: () => void }) {
  const { instellingen, klok, registreerBelresultaat, maakBelresultaatOngedaan, toon } = useApp();
  const c = k.contact;
  const tel = c.telefoons[0]?.nummer ?? null;
  const beschikbaar: BerichtKanaal[] = [...(tel ? (['sms', 'whatsapp'] as const) : []), ...(c.email ? (['mail'] as const) : [])];
  const [kanaal, setKanaal] = useState<BerichtKanaal>(beschikbaar.includes(start) ? start : (beschikbaar[0] ?? 'sms'));
  const voorstel = useMemo(
    () => berichtTekst({ kandidaat: k, kanaal, voornaamGebruiker: instellingen.gebruiker.voornaam, organisatie: instellingen.gebruiker.organisatie }),
    [k, kanaal, instellingen.gebruiker],
  );
  const [tekst, setTekst] = useState<string | null>(null);
  const [onderwerp, setOnderwerp] = useState<string | null>(null);
  const [geopend, setGeopend] = useState(false);
  const [bezig, setBezig] = useState(false);

  if (beschikbaar.length === 0) {
    return (
      <div className="resultaat">
        <p className="foutmelding">Geen gsm-nummer of e-mailadres bekend.</p>
        <button className="knop tekstknop" onClick={onKlaar}>Sluiten</button>
      </div>
    );
  }

  const huidigeTekst = tekst ?? voorstel.tekst;
  const huidigOnderwerp = onderwerp ?? voorstel.onderwerp ?? '';
  const nuGepast = kanaal === 'mail' || berichtNuGepast(instellingen, klok.vandaag(), uurVan(klok.nu()));
  const adres = kanaal === 'mail' ? c.email! : tel!;
  // Verzonnen testnummers nooit echt openen; testmailadressen eindigen op .test en komen nergens aan.
  const openenUit = c.isTestdata && kanaal !== 'mail';
  const appNaam = { sms: 'Berichten', whatsapp: 'WhatsApp', mail: 'Mail' }[kanaal];

  async function bewaar() {
    setBezig(true);
    try {
      const r = await registreerBelresultaat({ contact: c, uitkomst: 'bericht_verstuurd', kanaal, notitie: huidigeTekst.slice(0, 500) });
      toon({ tekst: `${kanaal === 'mail' ? 'Mail' : 'Bericht'} aan ${c.achternaam} geregistreerd. Even rust; daarna stelt de app weer bellen voor.`, ongedaan: () => maakBelresultaatOngedaan(r.belpoging.id) });
      onKlaar();
    } catch (e) {
      toon({ tekst: e instanceof Error ? e.message : String(e), fout: true });
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="resultaat formulier">
      <div className="kanaalkeuze" role="tablist">
        {beschikbaar.map((b) => (
          <button key={b} role="tab" aria-selected={b === kanaal} className={`knop ${b === kanaal ? 'primair' : ''}`} onClick={() => { setKanaal(b); setTekst(null); setOnderwerp(null); setGeopend(false); }}>
            {{ sms: '💬 Sms', whatsapp: '🟢 WhatsApp', mail: '✉️ Mail' }[b]}
          </button>
        ))}
      </div>
      {!nuGepast && <p className="label waarschuwing">Buiten de rustige uren ({instellingen.contact.berichtenVanaf}–{instellingen.contact.berichtenTot}{instellingen.contact.geenBerichtenOpZondag ? ', niet op zondag' : ''}). Liefst later versturen.</p>}
      {kanaal === 'mail' && (
        <label>
          Onderwerp
          <input value={huidigOnderwerp} onChange={(e) => setOnderwerp(e.target.value)} />
        </label>
      )}
      <label>
        Tekst (pas gerust aan)
        <textarea rows={kanaal === 'mail' ? 9 : 5} value={huidigeTekst} onChange={(e) => setTekst(e.target.value)} />
      </label>
      <div className="knoppenrij">
        {openenUit ? (
          <button className="knop primair groot" disabled title="Testdata: verzonnen nummer">Open in {appNaam} (testdata)</button>
        ) : (
          <a className="knop primair groot" href={berichtLink(kanaal, adres, { onderwerp: huidigOnderwerp, tekst: huidigeTekst })} target="_blank" rel="noreferrer" onClick={() => setGeopend(true)}>
            Open in {appNaam}
          </a>
        )}
        <button
          className="knop"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(huidigeTekst);
              toon({ tekst: 'Tekst gekopieerd.' });
            } catch {
              toon({ tekst: 'Kopiëren lukte niet.', fout: true });
            }
          }}
        >
          📋 Kopieer
        </button>
      </div>
      <button className={`knop groot ${geopend ? 'primair' : ''}`} disabled={bezig} onClick={bewaar}>
        ✓ Verstuurd — registreren
      </button>
      <p className="klein zacht">De app verstuurt zelf niets. Tik pas op "Verstuurd" als je het bericht echt verstuurd hebt.</p>
      <button className="knop tekstknop" onClick={onKlaar}>Annuleren</button>
    </div>
  );
}
