import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/context';
import { datumUur, langeDag } from '../../core/dates';
import type { DonnaOverzicht } from '../../domain/model';
import { maakDonnaConcept } from '../../domain/donna';

/** Bewerkbaar, kopieerbaar overzicht voor Donna. Wordt nooit automatisch verstuurd. */
export function Avondoverzicht() {
  const { gegevens, klok, store, instellingen, toon, dataVersie } = useApp();
  const [dag, setDag] = useState(klok.vandaag());
  const [metReferentie, setMetReferentie] = useState(true);
  const [opgeslagen, setOpgeslagen] = useState<DonnaOverzicht | null | 'laden'>('laden');
  const [tekst, setTekst] = useState('');
  const [bezig, setBezig] = useState(false);

  const concept = useMemo(
    () =>
      maakDonnaConcept({
        dag,
        belpogingen: gegevens.belpogingen,
        contacten: gegevens.contacten,
        opvolgacties: gegevens.opvolgacties,
        afspraken: gegevens.afspraken,
        belverboden: gegevens.belverboden,
        voornaam: instellingen.gebruiker.voornaam,
        metReferentie,
      }),
    [dag, gegevens, instellingen.gebruiker.voornaam, metReferentie],
  );

  useEffect(() => {
    let actief = true;
    setOpgeslagen('laden');
    store.laadDonnaOverzicht(dag).then(
      (o) => {
        if (!actief) return;
        setOpgeslagen(o);
        setTekst(o ? o.tekst : '');
      },
      () => actief && setOpgeslagen(null),
    );
    return () => {
      actief = false;
    };
  }, [store, dag, dataVersie]);

  // Zonder opgeslagen versie toont het tekstvak altijd het actuele concept.
  useEffect(() => {
    if (opgeslagen === null) setTekst(concept.tekst);
  }, [opgeslagen, concept.tekst]);

  if (opgeslagen === 'laden') return <p className="zacht">Laden…</p>;

  const nieuweResultaten = opgeslagen ? concept.belpogingIds.filter((id) => !opgeslagen.belpogingIds.includes(id)).length : 0;
  const isTest = gegevens.belpogingen.some((p) => p.isTestdata);

  async function bewaar(status: DonnaOverzicht['status']) {
    setBezig(true);
    try {
      const nu = klok.nu();
      const o: DonnaOverzicht = {
        dag,
        tekst,
        belpogingIds: opgeslagen && opgeslagen !== 'laden' && tekst !== concept.tekst ? opgeslagen.belpogingIds : concept.belpogingIds,
        status,
        klaargezetOp: opgeslagen && opgeslagen !== 'laden' ? opgeslagen.klaargezetOp : nu,
        doorgegevenOp: status === 'doorgegeven' ? nu : null,
        isTestdata: isTest,
      };
      await store.bewaarDonnaOverzicht(o);
      setOpgeslagen(o);
      toon({ tekst: status === 'doorgegeven' ? 'Gemarkeerd als doorgegeven aan Donna.' : 'Overzicht klaargezet.' });
    } catch (e) {
      toon({ tekst: e instanceof Error ? e.message : String(e), fout: true });
    } finally {
      setBezig(false);
    }
  }

  async function kopieer() {
    try {
      await navigator.clipboard.writeText(tekst);
      toon({ tekst: 'Gekopieerd. Plak het in je bericht aan Donna.' });
    } catch {
      toon({ tekst: 'Kopiëren lukte niet. Selecteer de tekst en kopieer manueel.', fout: true });
    }
  }

  return (
    <>
      <header className="paginakop">
        <h1>Avondoverzicht</h1>
        <p className="zacht">Voor Donna — {langeDag(dag)}</p>
      </header>

      <section className="kaart formulier">
        <label>
          Dag
          <input type="date" value={dag} max={klok.vandaag()} onChange={(e) => e.target.value && setDag(e.target.value)} />
        </label>
        <p className="klein">
          {concept.aantalInhoudelijk} gesprekken · {concept.aantalGeenAntwoord} keer geen antwoord
        </p>
        <p className="klein">
          Status:{' '}
          {opgeslagen === null ? (
            <strong>nog niet klaargezet</strong>
          ) : opgeslagen.status === 'doorgegeven' ? (
            <strong>door mij doorgegeven op {datumUur(opgeslagen.doorgegevenOp!)}</strong>
          ) : (
            <strong>klaargezet op {datumUur(opgeslagen.klaargezetOp)}</strong>
          )}
        </p>
        <p className="klein zacht">
          "Doorgegeven" betekent enkel dat jij het aan Donna bezorgde. Of het in ERAForce staat, kan de app pas nagaan zodra de koppeling met de mirror er is.
        </p>
        {nieuweResultaten > 0 && (
          <p className="infomelding klein">
            Er {nieuweResultaten === 1 ? 'is 1 nieuw resultaat' : `zijn ${nieuweResultaten} nieuwe resultaten`} sinds je dit klaarzette.{' '}
            <button className="knop tekstknop" onClick={() => setTekst(concept.tekst)}>
              Opnieuw opbouwen
            </button>
            (jouw aanpassingen in de tekst gaan dan verloren)
          </p>
        )}
        <label className="vinkje">
          <input type="checkbox" checked={metReferentie} onChange={(e) => setMetReferentie(e.target.checked)} />
          Referentiecode per gesprek toevoegen (bv. [DP-7F3K]) — als Donna die mee overneemt, kan de app later bevestigen dat het in ERAForce staat
        </label>
        <label>
          Tekst (pas gerust aan)
          <textarea className="donna" rows={16} value={tekst} onChange={(e) => setTekst(e.target.value)} />
        </label>
        <div className="knoppenrij">
          <button className="knop primair groot" onClick={kopieer}>
            📋 Kopiëren
          </button>
          <button className="knop" disabled={bezig} onClick={() => bewaar('klaargezet')}>
            Klaarzetten
          </button>
          <button className="knop" disabled={bezig} onClick={() => bewaar('doorgegeven')}>
            ✓ Door mij doorgegeven
          </button>
        </div>
        {opgeslagen?.status === 'doorgegeven' && (
          <button className="knop tekstknop" onClick={() => bewaar('klaargezet')}>
            Toch nog niet doorgegeven (herstellen)
          </button>
        )}
      </section>
    </>
  );
}
