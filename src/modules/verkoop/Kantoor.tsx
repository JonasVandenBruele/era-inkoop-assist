// Kantooroverzicht: open acties, interesse en geplande bezoeken per pand; filters; instellingen; demo opnieuw instellen.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CAMPAGNE_LABEL, UITKOMST_LABEL } from '../../domain/verkoop/acties';
import { laatsteCampagne } from '../../domain/verkoop/bellijst';
import { koopbereidheidTekst } from '../../domain/verkoop/intentie';
import { isOpen } from '../../domain/verkoop/kandidatenlijst';
import { naamVan, type Voortgang } from '../../domain/verkoop/model';
import { medewerkerNaam, wijziging } from '../../domain/verkoop/staat';
import { dagVan } from '../../core/dates';
import { useVastgezet, useVerkoop } from './context';
import { Blad, Details, VOORTGANG_LABEL, VoortgangLabel, dagTekst, pandTitel } from './ui';

export function Kantoor() {
  const { staat, laatstGeladen, opslagSoort } = useVerkoop();
  const [pand, setPand] = useState('');
  const [wie, setWie] = useState('');
  const [kb, setKb] = useState('');
  const [aanleiding, setAanleiding] = useState('');
  const [vg, setVg] = useState('open');
  const pandActies = staat.acties.filter((a) => a.pandId);
  const perPand = [...staat.panden.values()]
    .map((p) => {
      const a = pandActies.filter((x) => x.pandId === p.id);
      return { p, open: a.filter(isOpen).length, interesse: a.filter((x) => x.interesse === 'ja').length, bezoeken: a.filter((x) => x.voortgang === 'bezoek_gepland') };
    })
    .filter((x) => x.open + x.interesse + x.bezoeken.length > 0);

  const gefilterd = staat.acties
    .filter((a) => !pand || a.pandId === pand)
    .filter((a) => !wie || a.uitvoerderId === wie)
    .filter((a) => !kb || (staat.kwalificaties.get(a.contactId)?.poolStatus ?? 'geen') === kb)
    .filter((a) => !aanleiding || (laatsteCampagne(staat, a)?.soort ?? a.soort) === aanleiding)
    .filter((a) => (vg === 'open' ? isOpen(a) : vg === 'alle' ? true : a.voortgang === vg))
    .sort((a, b) => (b.laatsteContactOp ?? b.aangemaaktOp).localeCompare(a.laatsteContactOp ?? a.aangemaaktOp));

  return (
    <>
      <div className="paginakop">
        <h1>Kantoor</h1>
        <p className="zacht">Gedeelde werkvoorraad van het kantoor.</p>
        <p className="zacht klein">
          Bron: {staat.basis.bronNaam} · laatste synchronisatie {staat.basis.laatsteSync ? new Date(staat.basis.laatsteSync).toLocaleString('nl-BE', { dateStyle: 'short', timeStyle: 'short' }) : 'onbekend'} · demo-opslag {opslagSoort === 'gedeeld' ? 'online, gedeeld' : 'lokaal'}
          {laatstGeladen && `, bijgewerkt ${laatstGeladen.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}`}
        </p>
        <Link className="knop" to="/rondleiding">
          Demonstratieroute
        </Link>
      </div>

      <section className="blok">
        <h3>Per pand</h3>
        {perPand.length === 0 && <p className="zacht">Nog geen acties.</p>}
        <ul className="lijst">
          {perPand.map(({ p, open, interesse, bezoeken }) => (
            <li key={p.id}>
              <Link to={`/pand/${p.id}`} className="kaart vk-pandkaart">
                <div className="vk-rijkop">
                  <strong>{pandTitel(p)}</strong>
                </div>
                <div className="labels">
                  <span className="label">{open} open</span>
                  <span className="label">{interesse} interesse</span>
                  <span className="label">{bezoeken.length} bezoek(en)</span>
                </div>
                {bezoeken.map((b) => (
                  <p key={b.id} className="klein">
                    Bezoek {dagTekst(b.bezoek?.dag, b.bezoek?.uur)}: {naamVan(staat.contacten.get(b.contactId)!)} (met {medewerkerNaam(staat, b.uitvoerderId)})
                  </p>
                ))}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="blok">
        <h3>Alle contactacties</h3>
        <div className="vk-filters">
          <label className="vk-filter">
            Pand
            <select value={pand} onChange={(e) => setPand(e.target.value)}>
              <option value="">Alle panden</option>
              {[...staat.panden.values()].map((p) => (
                <option key={p.id} value={p.id}>
                  {pandTitel(p)}
                </option>
              ))}
            </select>
          </label>
          <label className="vk-filter">
            Medewerker
            <select value={wie} onChange={(e) => setWie(e.target.value)}>
              <option value="">Iedereen</option>
              {[...staat.medewerkers.values()].map((m) => (
                <option key={m.id} value={m.id}>
                  {m.voornaam}
                </option>
              ))}
            </select>
          </label>
          <label className="vk-filter">
            Koopbereidheid
            <select value={kb} onChange={(e) => setKb(e.target.value)}>
              <option value="">Alle</option>
              <option value="koopklaar">Koopklaar</option>
              <option value="actief">Actief zoekend</option>
              <option value="te_kwalificeren">Te kwalificeren</option>
              <option value="geen">Niet in pool</option>
            </select>
          </label>
          <label className="vk-filter">
            Aanleiding
            <select value={aanleiding} onChange={(e) => setAanleiding(e.target.value)}>
              <option value="">Alle</option>
              <option value="lancering">Vóór lancering</option>
              <option value="prijsdaling">Prijsdaling</option>
              <option value="opvolging">Andere opvolging</option>
              <option value="herbevestiging">Herbevestiging</option>
            </select>
          </label>
          <label className="vk-filter">
            Voortgang
            <select value={vg} onChange={(e) => setVg(e.target.value)}>
              <option value="open">Open</option>
              <option value="alle">Alle</option>
              {(Object.keys(VOORTGANG_LABEL) as (Voortgang | 'te_beoordelen')[])
                .filter((v) => v !== 'te_beoordelen')
                .map((v) => (
                  <option key={v} value={v}>
                    {VOORTGANG_LABEL[v]}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {gefilterd.length === 0 && <p className="kaart leeg zacht">Geen acties in deze selectie.</p>}
        <ul className="lijst">
          {gefilterd.map((a) => {
            const c = laatsteCampagne(staat, a);
            return (
              <li key={a.id} className="kaart">
                <div className="vk-rijkop">
                  <div className="vk-rijnaam">
                    <Link to={`/kandidaat/${a.contactId}`}>{naamVan(staat.contacten.get(a.contactId)!)}</Link>
                    <div className="zacht klein">
                      {a.pandId ? <Link to={`/pand/${a.pandId}`}>{pandTitel(staat.panden.get(a.pandId)!)}</Link> : 'Zonder pand'} · {c ? CAMPAGNE_LABEL[c.soort] : a.soort === 'herbevestiging' ? 'Herbevestiging' : 'Opvolging'} · bij {medewerkerNaam(staat, a.uitvoerderId)}
                    </div>
                  </div>
                  <VoortgangLabel v={a.voortgang} />
                </div>
                <p className="klein zacht">
                  {koopbereidheidTekst(staat, a.contactId).label}
                  {a.bezoek && ` · bezoek ${dagTekst(a.bezoek.dag, a.bezoek.uur)}`}
                  {a.volgendeStap && ` · ${a.volgendeStap}`}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <DonnaOverzicht />
      <Instellingen />
      <DemoReset />
    </>
  );
}

/** Informatie die later in ERAForce verwerkt moet worden (bestaande werkwijze via Donna). Nooit automatisch verstuurd. */
function DonnaOverzicht() {
  const { staat } = useVerkoop();
  const vandaag = staat.contactmomenten.filter((m) => dagVan(new Date(m.op)) === staat.vandaag).sort((a, b) => a.op.localeCompare(b.op));
  const tekst = vandaag
    .map((m) => {
      const acties = staat.acties.filter((a) => m.actieIds.includes(a.id));
      const panden = acties.map((a) => (a.pandId ? pandTitel(staat.panden.get(a.pandId)!) : null)).filter(Boolean);
      return `- ${naamVan(staat.contacten.get(m.contactId)!)} (${staat.contacten.get(m.contactId)?.externId}): ${UITKOMST_LABEL[m.uitkomst]}${panden.length ? ` · ${panden.join(', ')}` : ''}${m.bezoek ? ` · bezoek ${m.bezoek.dag}${m.bezoek.uur ? ` ${m.bezoek.uur}` : ''}` : ''}${m.terugbellen ? ` · terugbellen ${m.terugbellen.dag}` : ''}${m.notitie ? ` · "${m.notitie}"` : ''} [${medewerkerNaam(staat, m.door)}]`;
    })
    .join('\n');
  return (
    <section className="blok">
      <Details samenvatting={`Voor ERAForce via Donna (${vandaag.length} vandaag)`}>
        <p className="zacht klein">ERAForce blijft alleen-lezen. Deze tekst is om later in het CRM te verwerken; er wordt niets verstuurd. In de demo zijn alle resultaten gesimuleerd.</p>
        <textarea className="donna" rows={Math.min(10, Math.max(3, vandaag.length + 1))} readOnly value={tekst || 'Nog niets geregistreerd vandaag.'} />
      </Details>
    </section>
  );
}

function Instellingen() {
  const { staat: live, bewaar } = useVerkoop();
  const { staat } = useVastgezet(live);
  const [i, setI] = useState(staat.instellingen);
  const getal = (k: 'bevestigingsritmeDagen' | 'claimMinuten' | 'capaciteit', label: string) => (
    <label>
      {label}
      <input inputMode="numeric" value={String(i[k])} onChange={(e) => setI({ ...i, [k]: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
    </label>
  );
  return (
    <section className="blok">
      <Details samenvatting="Instellingen (kantoor)">
        <div className="instellingenrooster">
          {getal('bevestigingsritmeDagen', 'Koopbereidheid opnieuw bevestigen na (dagen)')}
          {getal('claimMinuten', 'Claim tijdens bellen vervalt na (minuten)')}
          {getal('capaciteit', 'Dagdoel Vandaag bellen (contacten)')}
        </div>
        <p className="zacht klein">
          Matchscore: budget {i.matchGewichten.budget}% · locatie {i.matchGewichten.locatie}% · woning {i.matchGewichten.woning}% · wensen {i.matchGewichten.wensen}% · praktisch {i.matchGewichten.praktisch}%. Belprioriteit: match {i.belGewichten.match}% · intentie {i.belGewichten.intentie}% · aanleiding {i.belGewichten.aanleiding}% · opvolging {i.belGewichten.opvolging}%. Scoreregels: verkoop-scores-v1.
        </p>
        <button
          className="knop"
          disabled={i.bevestigingsritmeDagen < 1 || i.claimMinuten < 1 || i.capaciteit < 1}
          onClick={() => bewaar([wijziging(staat, 'instellingen', 'kantoor', i)], 'Instellingen bewaard')}
        >
          Bewaren
        </button>
      </Details>
    </section>
  );
}

function DemoReset() {
  const { reset, staat } = useVerkoop();
  const [bevestig, setBevestig] = useState(false);
  const [bezig, setBezig] = useState(false);
  const eigen = staat.versies.size;
  return (
    <section className="blok">
      <div className="kaart">
        <h2>Demo opnieuw instellen</h2>
        <p className="zacht">Wist alle demoresultaten ({eigen} bewaarde wijzigingen), ook die van collega’s. De fictieve startgegevens komen terug. Productiegegevens worden nooit geraakt.</p>
        <button className="knop gevaar" onClick={() => setBevestig(true)}>
          Demo opnieuw instellen…
        </button>
      </div>
      {bevestig && (
        <Blad titel="Zeker?" sluit={() => setBevestig(false)}>
          <p>
            Dit wist de <strong>gedeelde</strong> demovoortgang van iedereen, ook wat Nicolas al registreerde. Dit kan niet ongedaan gemaakt worden.
          </p>
          <button
            className="knop gevaar groot"
            disabled={bezig}
            onClick={async () => {
              setBezig(true);
              await reset();
              setBezig(false);
              setBevestig(false);
            }}
          >
            Ja, alle demoresultaten wissen
          </button>
          <button className="knop tekstknop" onClick={() => setBevestig(false)}>
            Annuleren
          </button>
        </Blad>
      )}
    </section>
  );
}
