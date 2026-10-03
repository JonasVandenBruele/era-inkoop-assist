import { useState } from 'react';
import { useApp } from './context';
import { langeDag } from '../core/dates';
import { PlanningInstellingen } from './PlanningInstellingen';

export function InstellingenPagina() {
  const { instellingen, wijzigInstellingen, herlaadTestdata, store, gebruikerEmail, afmelden, klok } = useApp();
  const [testdatum, setTestdatum] = useState(instellingen.testdatum ?? '');
  const [bezig, setBezig] = useState<string | null>(null);
  const [bericht, setBericht] = useState<string | null>(null);

  async function doe(wat: string, actie: () => Promise<void>, klaar: string) {
    setBezig(wat);
    setBericht(null);
    try {
      await actie();
      setBericht(klaar);
    } catch (e) {
      setBericht(`Mislukt: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBezig(null);
    }
  }

  return (
    <>
      <header className="paginakop">
        <h1>Instellingen</h1>
      </header>

      {bericht && <p className="infomelding">{bericht}</p>}

      <section className="kaart">
        <h2>Testdatum</h2>
        <p className="zacht klein">
          De app doet alsof het deze dag en dit uur is (Brusselse tijd). De testdata verschuift mee. Let op: je lokale testresultaten worden daarbij teruggezet.
        </p>
        <p>Nu: {langeDag(klok.vandaag())}{klok.isTestklok ? ' (testdatum)' : ' (echte datum)'}</p>
        <label className="formulier">
          Testdatum en -uur
          <input type="datetime-local" value={testdatum} onChange={(e) => setTestdatum(e.target.value)} />
        </label>
        <div className="knoppenrij">
          <button
            className="knop primair"
            disabled={!testdatum || bezig !== null}
            onClick={() => doe('datum', () => wijzigInstellingen({ ...instellingen, testdatum: testdatum.slice(0, 16) }), 'Testdatum ingesteld en testdata verschoven.')}
          >
            {bezig === 'datum' ? 'Bezig…' : 'Testdatum toepassen'}
          </button>
          <button
            className="knop"
            disabled={bezig !== null || instellingen.testdatum === null}
            onClick={() => doe('echt', () => wijzigInstellingen({ ...instellingen, testdatum: null }), 'De app gebruikt nu de echte datum.')}
          >
            Echte datum gebruiken
          </button>
        </div>
      </section>

      <section className="kaart">
        <h2>Testdata</h2>
        <p className="zacht klein">Zet alle fictieve contacten, afspraken en testresultaten terug naar de beginsituatie. Echte gegevens worden nooit aangeraakt.</p>
        <button className="knop" disabled={bezig !== null} onClick={() => doe('reset', herlaadTestdata, 'Testdata opnieuw geladen.')}>
          {bezig === 'reset' ? 'Bezig…' : 'Testdata opnieuw laden'}
        </button>
      </section>

      <PlanningInstellingen />

      <section className="kaart">
        <h2>Account</h2>
        {store.soort === 'supabase' ? (
          <>
            <p>Aangemeld als {gebruikerEmail}</p>
            <button className="knop" onClick={() => afmelden()}>Afmelden</button>
          </>
        ) : (
          <p className="zacht">Lokale demo zonder login. Zodra Supabase gekoppeld is, meld je je hier aan.</p>
        )}
      </section>

      <p className="zacht klein">Versie {__APP_VERSIE__}</p>
    </>
  );
}
