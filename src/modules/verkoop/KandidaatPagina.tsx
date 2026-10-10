// Kandidaatdetail: koopbereidheid, zoekopdrachten (hard/voorkeur/vermoeden/onbekend), inzichten, matches en historiek.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { bevestigKoopklaar, nieuweKwalificatie, UITKOMST_LABEL } from '../../domain/verkoop/acties';
import { actualiteit, berekenIntentie, FINANCIERING_LABEL, POOL_LABEL } from '../../domain/verkoop/intentie';
import { contactRegel, isOpen } from '../../domain/verkoop/kandidatenlijst';
import { naamVan, type Criterium, type CriteriumSoort, type FinancieringStatus, type JaNeeOnbekend, type Kwalificatie, type PoolStatus } from '../../domain/verkoop/model';
import { matchesVanKandidaat } from '../../domain/verkoop/pool';
import { euro } from '../../domain/verkoop/prijs';
import { medewerkerNaam, wijziging } from '../../domain/verkoop/staat';
import { zoekbeschrijving } from '../../domain/verkoop/openingszin';
import { useVastgezet, useVerkoop } from './context';
import { InzichtVoorstellen } from './bladen';
import { Blad, Chips, Details, KlasseLabel, VoortgangLabel, datumTijd, pandTitel } from './ui';

const SOORT_LABEL: Record<CriteriumSoort, string> = { hard: 'Harde voorwaarden', voorkeur: 'Voorkeuren', vermoeden: 'Afgeleide vermoedens (te bevestigen)', onbekend: 'Onbekend' };

function criteriumTekst(c: Criterium): string {
  switch (c.sleutel) {
    case 'budget':
      return `Budget ${c.waarde.min ? `${euro(c.waarde.min)} – ` : 'tot '}${euro(c.waarde.max)}`;
    case 'regio':
      return `Regio: ${c.waarde.gemeenten.join(', ')}`;
    case 'regio_uitgesloten':
      return `Niet in: ${c.waarde.gemeenten.join(', ')}`;
    case 'type':
      return `Type: ${c.waarde.types.join(' of ')}`;
    case 'slaapkamers':
      return `Minstens ${c.waarde.min} slaapkamers`;
    case 'bewoonbare_opp':
      return `Minstens ${c.waarde.min} m² bewoonbaar`;
    case 'renovatie':
      return `Maximaal: ${c.waarde.maxWerk.replace(/_/g, ' ')}`;
    case 'toegankelijkheid':
      return 'Gelijkvloers wonen (lift of slaapkamer beneden)';
    case 'epc':
      return `EPC ${c.waarde.slechtsteLabel} of beter`;
    case 'orientatie':
      return `Oriëntatie ${c.waarde.richtingen.join('/')}`;
    case 'timing':
      return `Timing: ${c.waarde.omschrijving}`;
    default:
      return `${c.sleutel[0]!.toUpperCase()}${c.sleutel.slice(1)} ${c.waarde.nodig ? 'gewenst' : 'niet nodig'}`;
  }
}

export function KandidaatPagina() {
  const { id } = useParams();
  const { staat, ik, bewaar } = useVerkoop();
  const [bewerk, setBewerk] = useState(false);
  const [notitie, setNotitie] = useState('');
  const kand = id ? staat.kandidaten.get(id) : undefined;
  if (!kand) {
    return (
      <div className="kaart leeg">
        <p>Kandidaat niet gevonden.</p>
        <Link to="/pool">Naar koperspool</Link>
      </div>
    );
  }
  const c = kand.contact;
  const kw = staat.kwalificaties.get(c.id);
  const act = actualiteit(kw, staat.vandaag, staat.instellingen.bevestigingsritmeDagen);
  const regel = contactRegel(staat, c.id);
  const intentie = berekenIntentie(staat, c.id);
  const huishouden = kand.huishoudenId ? staat.huishoudens.get(kand.huishoudenId) : null;
  const zoekopdrachten = staat.zoekopdrachten.filter((z) => z.contactId === c.id);
  const matches = matchesVanKandidaat(staat, c.id);
  const tegenspraak = staat.tegenstrijdigheden.filter((t) => t.contactId === c.id);
  const acties = staat.acties.filter((a) => a.contactId === c.id).sort((a, b) => b.aangemaaktOp.localeCompare(a.aangemaaktOp));
  const momenten = staat.contactmomenten.filter((m) => m.contactId === c.id).sort((a, b) => b.op.localeCompare(a.op));
  const inzichten = staat.inzichten.filter((i) => i.contactId === c.id && i.status !== 'voorstel');
  const bewaarKw = (k: Kwalificatie, melding: string) => bewaar([wijziging(staat, 'kwalificatie', c.id, k)], melding);

  return (
    <>
      <Link className="terug" to="/pool">
        ← Koperspool
      </Link>
      <div className="paginakop">
        <h1>{naamVan(c)}</h1>
        {huishouden && <p className="zacht">Huishouden: {huishouden.naam} ({huishouden.bron})</p>}
        <p className="zacht klein">
          {c.telefoons[0]?.nummer ?? 'geen nummer'} (fictief) · contact van {medewerkerNaam(staat, kw?.verantwoordelijkeId ?? kand.eigenaarId)} · {c.gemeente}
        </p>
        <div className="labels">
          <span className={`label ${kw ? `vk-pool-${kw.poolStatus}` : 'waarschuwing'}`}>{kw ? POOL_LABEL[kw.poolStatus] : 'Niet in de koperspool'}</span>
          {kw && kw.poolStatus !== 'afgerond' && <span className={`label ${act.verouderd ? 'waarschuwing' : ''}`}>{act.label}</span>}
          <span className="label bron">Intentie {intentie.score ?? 'onbekend'}</span>
          {regel && <span className="label gevaar">{regel}</span>}
        </div>
      </div>

      {tegenspraak.map((t) => (
        <p key={t.tekst} className="foutmelding">
          {t.tekst}
        </p>
      ))}

      <section className="kaart">
        <h2>Koopbereidheid</h2>
        {!kw ? (
          <>
            <p className="zacht">Nog niet in de koperspool. Een actieve zoekopdracht of bod is geen bewijs van financiering.</p>
            <button
              className="knop primair"
              onClick={() => bewaarKw(nieuweKwalificatie(c.id, ik.id, staat.vandaag, 'zelf', kand.eigenaarId), 'Toegevoegd aan de koperspool')}
            >
              Toevoegen aan koperspool
            </button>
          </>
        ) : (
          <>
            <dl className="feiten">
              <dt>Status</dt>
              <dd>
                {POOL_LABEL[kw.poolStatus]}
                {kw.koopklaar && ` · bevestigd door ${medewerkerNaam(staat, kw.koopklaar.door)} op ${kw.koopklaar.op}`}
              </dd>
              <dt>Budget</dt>
              <dd>{kw.budget ? `${euro(kw.budget.bedrag)} · bevestigd ${kw.budget.bevestigdOp} · ${kw.budget.bron}` : 'onbekend'}</dd>
              <dt>Financiering</dt>
              <dd>
                {FINANCIERING_LABEL[kw.financiering.status]}
                {kw.financiering.bron && <span className="zacht"> · bron: {kw.financiering.bron}</span>}
              </dd>
              <dt>Eigen woning</dt>
              <dd className={kw.afhankelijkVanVerkoop.status === 'ja' ? 'waarschuwingstekst' : ''}>
                {kw.afhankelijkVanVerkoop.status === 'ja' ? 'Moet eerst verkopen' : kw.afhankelijkVanVerkoop.status === 'nee' ? 'Niet afhankelijk' : 'onbekend'}
                {kw.afhankelijkVanVerkoop.toelichting && ` (${kw.afhankelijkVanVerkoop.toelichting})`}
              </dd>
              <dt>Termijn</dt>
              <dd>{kw.termijn ?? 'onbekend'}</dd>
              <dt>Snel bezoeken</dt>
              <dd>{kw.snelBezoeken}</dd>
              <dt>Aanbod vóór publicatie</dt>
              <dd>{kw.interesseVoorPublicatie}</dd>
              <dt>Contactvoorkeur</dt>
              <dd>{kw.contactvoorkeur ?? 'onbekend'}</dd>
              <dt>Verantwoordelijke</dt>
              <dd>{medewerkerNaam(staat, kw.verantwoordelijkeId)}</dd>
              <dt>Zoekt nog</dt>
              <dd>{kw.laatsteBevestiging ? `bevestigd ${kw.laatsteBevestiging.op} door ${medewerkerNaam(staat, kw.laatsteBevestiging.door)} (${kw.laatsteBevestiging.bron})` : 'nooit bevestigd'}</dd>
              {kw.pauze && (
                <>
                  <dt>Pauze</dt>
                  <dd>
                    tot {kw.pauze.tot ?? 'onbepaald'}
                    {kw.pauze.reden && ` · ${kw.pauze.reden}`}
                  </dd>
                </>
              )}
            </dl>
            <div className="knoppenrij kleine-knoppen">
              {kw.poolStatus !== 'afgerond' && (
                <button className="knop" onClick={() => bewaarKw({ ...kw, laatsteBevestiging: { op: staat.vandaag, door: ik.id, bron: 'Bevestigd door medewerker' }, poolStatus: kw.poolStatus === 'te_kwalificeren' ? 'actief' : kw.poolStatus }, 'Bevestigd: zoekt nog')}>
                  {act.verouderd ? 'Opnieuw bevestigen: zoekt nog' : 'Zoekt nog'}
                </button>
              )}
              {kw.poolStatus !== 'koopklaar' && kw.poolStatus !== 'afgerond' && (
                <button className="knop primair" onClick={() => bewaarKw(bevestigKoopklaar(kw, ik.id, staat.vandaag, 'Bevestigd door medewerker'), 'Koopklaar bevestigd')}>
                  Bevestig koopklaar
                </button>
              )}
              <button className="knop" onClick={() => setBewerk(true)}>
                Bewerken
              </button>
            </div>
            <p className="zacht klein">Een technische wijzigingsdatum telt niet als bevestiging. Bewaar enkel wat de kandidaat zelf bevestigde; vraag geen financiële documenten op.</p>
          </>
        )}
      </section>

      <section className="blok">
        <h3>Zoekopdrachten ({zoekopdrachten.length})</h3>
        {zoekopdrachten.map((z) => {
          const zm = matches.find((m) => m.zoekopdrachtId === z.id)?.matches ?? [];
          return (
            <div key={z.id} className="kaart">
              <div className="vk-rijkop">
                <strong>{z.titel}</strong>
                <span className={`label ${z.status === 'actief' ? '' : 'bron'}`}>{z.status === 'actief' ? 'Actief' : `Gesloten${z.slotReden ? ` · ${z.slotReden}` : ''}`}</span>
              </div>
              <p className="zacht klein">“{zoekbeschrijving(z)}” · bron: zoekopdracht ERAForce (fictief) {z.aangemaaktOp}</p>
              {(['hard', 'voorkeur', 'vermoeden', 'onbekend'] as CriteriumSoort[]).map((s) => {
                const lijst = z.criteria.filter((x) => x.soort === s);
                if (!lijst.length) return null;
                return (
                  <div key={s} className="vk-criteria">
                    <strong className="klein">{SOORT_LABEL[s]}</strong>
                    <ul>
                      {lijst.map((cr) => (
                        <li key={cr.id} className={cr.status === 'verworpen' ? 'vk-verworpen' : ''}>
                          {criteriumTekst(cr)}
                          <span className="zacht klein">
                            {' '}
                            · {cr.bron.citaat ? `“${cr.bron.citaat}”` : cr.bron.soort} · {cr.bron.dag} · betrouwbaarheid {cr.betrouwbaarheid}
                          </span>
                          {staat.opzijGezet.get(cr.id) && <div className="zacht klein">{staat.opzijGezet.get(cr.id)}</div>}
                          {cr.soort === 'vermoeden' && cr.status === 'actief' && (
                            <div className="knoppenrij kleine-knoppen">
                              <button className="knop" onClick={() => bewaar([wijziging(staat, 'criterium', `${z.id}|${cr.id}`, { zoekopdrachtId: z.id, criterium: { ...cr, soort: 'voorkeur', betrouwbaarheid: 'hoog', bron: { ...cr.bron, soort: 'medewerker', door: ik.id, dag: staat.vandaag } }, beslissing: 'bevestigd', door: ik.id, op: staat.vandaag })], 'Bevestigd als voorkeur')}>
                                Bevestigen
                              </button>
                              <button className="knop" onClick={() => bewaar([wijziging(staat, 'criterium', `${z.id}|${cr.id}`, { zoekopdrachtId: z.id, criterium: cr, beslissing: 'verworpen', door: ik.id, op: staat.vandaag })], 'Vermoeden verworpen')}>
                                Verwerpen
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              {z.status === 'actief' && (
                <Details samenvatting={`Passend aanbod (${zm.filter((m) => m.klasse !== 'uitgesloten').length})`}>
                  {zm.length === 0 && <p className="zacht">Geen passend aanbod.</p>}
                  <ul className="vk-uitgesloten">
                    {zm.map((m) => (
                      <li key={m.pandId}>
                        <Link to={`/pand/${m.pandId}`}>{pandTitel(staat.panden.get(m.pandId)!)}</Link> <KlasseLabel k={m.klasse} score={m.score} />
                        <div className="zacht klein">{m.klasse === 'uitgesloten' ? m.schendingen[0] : [...m.bezwaarOpgelost, ...m.redenen].slice(0, 2).join(' · ')}</div>
                      </li>
                    ))}
                  </ul>
                </Details>
              )}
            </div>
          );
        })}
      </section>

      <section className="blok">
        <h3>Uit gesprekken en bezoeken</h3>
        <InzichtVoorstellen staat={staat} contactId={c.id} />
        {inzichten.length > 0 && (
          <ul className="vk-inzichten">
            {inzichten.map((i) => (
              <li key={i.id} className={`vk-inzicht ${i.status === 'verworpen' || i.soort === 'over_ander' ? 'vk-verworpen' : ''}`}>
                <p className="citaat">“{i.citaat}”</p>
                <p className="klein">
                  {i.uitleg}
                  {i.pandId && staat.panden.get(i.pandId) && <> · {pandTitel(staat.panden.get(i.pandId)!)}</>} · {i.dag} · {i.status}
                </p>
              </li>
            ))}
          </ul>
        )}
        <div className="kaart">
          <label className="formulier">
            Notitie toevoegen
            <textarea rows={3} value={notitie} onChange={(e) => setNotitie(e.target.value)} placeholder="Bv. Te veel renovatie, maar de ligging was top." />
          </label>
          <button
            className="knop"
            disabled={!notitie.trim()}
            onClick={async () => {
              const nid = `n:${crypto.randomUUID()}`;
              if (await bewaar([{ soort: 'notitie', id: nid, data: { id: nid, contactId: c.id, pandId: null, dag: staat.vandaag, tekst: notitie.trim(), door: ik.id, bron: 'notitie' }, verwachteVersie: null }], 'Notitie bewaard; controleer de voorstellen hierboven')) setNotitie('');
            }}
          >
            Notitie bewaren
          </button>
        </div>
      </section>

      <section className="blok">
        <h3>Historiek</h3>
        <ul className="historiek kaart klein">
          {momenten.map((m) => (
            <li key={m.id}>
              {datumTijd(m.op)} · {medewerkerNaam(staat, m.door)}: {UITKOMST_LABEL[m.uitkomst]}
              {m.gesimuleerd && ' (demo)'}
              {m.notitie && ` — “${m.notitie}”`}
            </li>
          ))}
          {staat.biedingen
            .filter((b) => b.contactId === c.id)
            .map((b) => (
              <li key={b.id}>
                {b.dag} · bod {euro(b.bedrag)} op {pandTitel(staat.panden.get(b.pandId)!)} ({b.status})
              </li>
            ))}
          {staat.bezoeken
            .filter((b) => b.contactId === c.id)
            .map((b) => (
              <li key={b.id}>
                {b.dag} · {b.volgnummer === 1 ? 'bezoek' : `${b.volgnummer}e bezoek`} {pandTitel(staat.panden.get(b.pandId)!)}
                {b.evaluatie && ` — “${b.evaluatie}”`}
              </li>
            ))}
          {staat.notities
            .filter((n) => n.contactId === c.id)
            .map((n) => (
              <li key={n.id}>
                {n.dag} · notitie {medewerkerNaam(staat, n.door)}: “{n.tekst}”
              </li>
            ))}
          {momenten.length + staat.bezoeken.filter((b) => b.contactId === c.id).length + staat.notities.filter((n) => n.contactId === c.id).length === 0 && <li className="zacht">Nog geen historiek.</li>}
        </ul>
        {acties.length > 0 && (
          <>
            <h3>Contactacties</h3>
            <ul className="lijst">
              {acties.map((a) => (
                <li key={a.id} className="kaart">
                  <div className="vk-rijkop">
                    <span>{a.pandId ? <Link to={`/pand/${a.pandId}`}>{pandTitel(staat.panden.get(a.pandId)!)}</Link> : a.soort === 'herbevestiging' ? 'Koopbereidheid bevestigen' : 'Afgesproken opvolging'}</span>
                    <VoortgangLabel v={a.voortgang} />
                  </div>
                  <p className="zacht klein">
                    Bij {medewerkerNaam(staat, a.uitvoerderId)} · {isOpen(a) ? (a.volgendeStap ?? 'open') : 'afgesloten'}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
        {staat.nazorg.has(c.id) && <p className="infomelding klein">Aangemeld voor opvolging na aankoop (één keer, geen dubbele inschrijving).</p>}
      </section>

      {bewerk && kw && <KwalificatieBlad kw={kw} sluit={() => setBewerk(false)} />}
    </>
  );
}

function KwalificatieBlad({ kw, sluit }: { kw: Kwalificatie; sluit: () => void }) {
  const { staat: live, ik, bewaar } = useVerkoop();
  const { staat } = useVastgezet(live);
  const [k, setK] = useState<Kwalificatie>(kw);
  const [budget, setBudget] = useState(kw.budget ? String(kw.budget.bedrag) : '');
  const [budgetBron, setBudgetBron] = useState(kw.budget?.bron ?? '');
  const jn = (w: JaNeeOnbekend, zet: (w: JaNeeOnbekend) => void, label: string) => (
    <div className="vk-veld">
      <strong className="klein">{label}</strong>
      <Chips opties={[{ waarde: 'ja', label: 'Ja' }, { waarde: 'nee', label: 'Nee' }, { waarde: 'onbekend', label: 'Onbekend' }]} waarde={w} kies={zet} />
    </div>
  );
  return (
    <Blad titel="Koopbereidheid bewerken" sluit={sluit}>
      <div className="vk-veld">
        <strong className="klein">Status</strong>
        <Chips
          opties={(['te_kwalificeren', 'actief', 'koopklaar', 'gepauzeerd', 'afgerond'] as PoolStatus[]).map((s) => ({ waarde: s, label: POOL_LABEL[s] }))}
          waarde={k.poolStatus}
          kies={(s) => setK({ ...k, poolStatus: s, koopklaar: s === 'koopklaar' ? (k.koopklaar ?? { door: ik.id, op: staat.vandaag }) : k.koopklaar, pauze: s === 'gepauzeerd' ? (k.pauze ?? { tot: null, reden: null }) : null })}
        />
      </div>
      <div className="tweekoloms">
        <label>
          Bevestigd budget (€)
          <input inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label>
          Bron budget
          <input value={budgetBron} onChange={(e) => setBudgetBron(e.target.value)} placeholder="bv. gesprek 10/10" />
        </label>
      </div>
      <div className="vk-veld">
        <strong className="klein">Financiering</strong>
        <Chips
          opties={(['onbekend', 'te_onderzoeken', 'besproken_kredietverstrekker', 'bevestigd'] as FinancieringStatus[]).map((s) => ({ waarde: s, label: FINANCIERING_LABEL[s] }))}
          waarde={k.financiering.status}
          kies={(s) => setK({ ...k, financiering: { ...k.financiering, status: s, op: staat.vandaag } })}
        />
        <input value={k.financiering.bron ?? ''} onChange={(e) => setK({ ...k, financiering: { ...k.financiering, bron: e.target.value || null } })} placeholder="Bron (bv. zegt kandidaat zelf)" />
      </div>
      {jn(k.afhankelijkVanVerkoop.status, (w) => setK({ ...k, afhankelijkVanVerkoop: { ...k.afhankelijkVanVerkoop, status: w } }), 'Moet eerst eigen woning verkopen?')}
      {jn(k.snelBezoeken, (w) => setK({ ...k, snelBezoeken: w }), 'Kan snel komen bezoeken?')}
      {jn(k.interesseVoorPublicatie, (w) => setK({ ...k, interesseVoorPublicatie: w }), 'Interesse in aanbod vóór publicatie?')}
      <label className="formulier">
        Gewenste termijn
        <input value={k.termijn ?? ''} onChange={(e) => setK({ ...k, termijn: e.target.value || null })} />
      </label>
      <label className="formulier">
        Contactvoorkeur
        <input value={k.contactvoorkeur ?? ''} onChange={(e) => setK({ ...k, contactvoorkeur: e.target.value || null })} />
      </label>
      <label className="formulier">
        Verantwoordelijke
        <select value={k.verantwoordelijkeId} onChange={(e) => setK({ ...k, verantwoordelijkeId: e.target.value })}>
          {[...staat.medewerkers.values()].map((m) => (
            <option key={m.id} value={m.id}>
              {m.voornaam}
            </option>
          ))}
        </select>
      </label>
      <button
        className="knop primair groot"
        disabled={Boolean(budget) && !budgetBron.trim()}
        onClick={async () => {
          const nieuw: Kwalificatie = {
            ...k,
            budget: budget ? { bedrag: Number(budget), bevestigdOp: kw.budget && Number(budget) === kw.budget.bedrag ? kw.budget.bevestigdOp : staat.vandaag, bron: budgetBron.trim() } : null,
          };
          if (await bewaar([wijziging(staat, 'kwalificatie', kw.contactId, nieuw)], 'Koopbereidheid bewaard')) sluit();
        }}
      >
        Bewaren
      </button>
    </Blad>
  );
}
