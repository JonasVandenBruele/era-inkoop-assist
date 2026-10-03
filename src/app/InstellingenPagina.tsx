import { useState } from 'react';
import { useApp } from './context';
import { langeDag } from '../core/dates';
import { PlanningInstellingen } from './PlanningInstellingen';
import { salesforceIdUitLink } from '../domain/eraforce';

export function InstellingenPagina() {
  const { instellingen, wijzigInstellingen, herlaadTestdata, store, gebruikerEmail, afmelden, klok } = useApp();
  const [testdatum, setTestdatum] = useState(instellingen.testdatum ?? '');
  const [testLink, setTestLink] = useState('');
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
        <h2>ERAForce</h2>
        <p className="zacht klein">
          Contacten uit ERAForce krijgen een knop "Bel via ERAForce": die opent de prospect in de Salesforce-app, waar je via More → Maf Call belt en
          meteen je evaluatie invult. Werkt zodra de ERAForce-gegevens gekoppeld zijn; testcontacten bellen gewoon (gesimuleerd).
        </p>
        <label className="vinkje">
          <input
            type="checkbox"
            checked={instellingen.eraforce.belViaEraforce}
            onChange={(e) => doe('eraf', () => wijzigInstellingen({ ...instellingen, eraforce: { ...instellingen.eraforce, belViaEraforce: e.target.checked } }), 'Bewaard.')}
          />
          Bellen via ERAForce (Maf Call)
        </label>
        <label className="vinkje">
          <input
            type="checkbox"
            checked={instellingen.eraforce.vraagNaBellenViaEraforce}
            onChange={(e) => doe('eraf', () => wijzigInstellingen({ ...instellingen, eraforce: { ...instellingen.eraforce, vraagNaBellenViaEraforce: e.target.checked } }), 'Bewaard.')}
          />
          Na bellen via ERAForce toch nog "hoe ging het?" vragen (voor een meteen bijgewerkte lijst)
        </label>
        {!import.meta.env.VITE_ERAFORCE_DOMEIN && <p className="klein zacht">ERAForce-domein nog niet ingesteld.</p>}

        <h3>Testlink voor alle contacten (tijdelijk)</h3>
        <p className="zacht klein">
          Tot de ERAForce-mirror er is: plak de link van één prospect, dan opent "Bel via ERAForce" bij elk contact die prospect. Verdwijnt zodra de mirror er is.
        </p>
        {instellingen.eraforce.testIdVoorIedereen ? (
          <p>
            Actief ✓{' '}
            <button
              className="knop tekstknop"
              onClick={() => doe('eraf', () => wijzigInstellingen({ ...instellingen, eraforce: { ...instellingen.eraforce, testIdVoorIedereen: null } }), 'Testlink verwijderd.')}
            >
              Verwijderen
            </button>
          </p>
        ) : (
          <div className="formulier">
            <input value={testLink} onChange={(e) => setTestLink(e.target.value)} placeholder="https://…lightning.force.com/lightning/r/Lead/…/view" aria-label="Testlink" />
            {testLink && !salesforceIdUitLink(testLink) && <p className="foutmelding klein">Daar vind ik geen ERAForce-ID in.</p>}
            <button
              className="knop"
              disabled={!salesforceIdUitLink(testLink)}
              onClick={() =>
                doe('eraf', () => wijzigInstellingen({ ...instellingen, eraforce: { ...instellingen.eraforce, testIdVoorIedereen: salesforceIdUitLink(testLink) } }), 'Testlink actief voor alle contacten.')
              }
            >
              Testlink bewaren
            </button>
          </div>
        )}
      </section>

      <section className="kaart">
        <h2>Mail</h2>
        <label className="formulier">
          Mail openen in
          <select
            value={instellingen.mailApp}
            onChange={(e) => doe('mail', () => wijzigInstellingen({ ...instellingen, mailApp: e.target.value as 'outlook' | 'standaard' }), 'Bewaard.')}
          >
            <option value="outlook">Outlook</option>
            <option value="standaard">Standaard-mailapp (Apple Mail)</option>
          </select>
        </label>
      </section>

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
