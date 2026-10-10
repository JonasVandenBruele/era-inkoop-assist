// Pand: Kandidaten & opvolging (gedeelde contactlijst) en pandgegevens met vrijgave en prijshistoriek (opdracht §8–§12).
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CAMPAGNE_LABEL, neemOp, startCampagne, wijsToe } from '../../domain/verkoop/acties';
import { BESCHIKBARE_FASEN, bouwKandidatenlijst, CATEGORIE_LABEL, isOpen, openPrijsdalingen, type KandidaatRij } from '../../domain/verkoop/kandidatenlijst';
import { naamVan, type Campagne, type Contactactie, type Kenmerken, type KenmerkSleutel, type Toestemming, type Vrijgave } from '../../domain/verkoop/model';
import { euro, prijsWijzigingen } from '../../domain/verkoop/prijs';
import { contactSleutel, huidigeVraagprijs, medewerkerNaam, vrijgaveVan, wijziging } from '../../domain/verkoop/staat';
import { useVastgezet, useVerkoop } from './context';
import { ActieToewijzen, GesprekBlad, ToewijsBlad } from './bladen';
import { Blad, Chips, Details, FASE_LABEL, KlasseLabel, pandTitel, VoortgangLabel, dagTekst, datumTijd } from './ui';

type Filter = 'alle' | 'te_beoordelen' | 'open' | 'positief' | 'afgerond';

export function PandPagina() {
  const { id } = useParams();
  const { staat } = useVerkoop();
  const pand = id ? staat.panden.get(id) : undefined;
  const [tab, setTab] = useState<'kandidaten' | 'pand'>('kandidaten');
  if (!pand) {
    return (
      <div className="kaart leeg">
        <p>Dit pand bestaat niet (meer) in de demo.</p>
        <Link to="/aanbod">Terug naar aanbod</Link>
      </div>
    );
  }
  const v = vrijgaveVan(staat, pand.id);
  const prijs = huidigeVraagprijs(staat, pand.id) ?? v.vraagprijs;
  return (
    <>
      <Link className="terug" to="/aanbod">
        ← Aanbod
      </Link>
      <div className="paginakop">
        <h1>{pandTitel(pand)}</h1>
        <div className="labels">
          <span className={`label ${pand.fase === 'in_voorbereiding' ? 'waarschuwing' : ''}`}>{FASE_LABEL[pand.fase]}</span>
          {pand.publicatieGepland && pand.fase !== 'gepubliceerd' && <span className="label">Publicatie gepland {dagTekst(pand.publicatieGepland)}</span>}
          <span className={`label ${v.contacteren ? '' : 'gevaar'}`}>{v.contacteren ? 'Contact vrijgegeven' : v.internMatchen ? 'Enkel intern' : 'Niet vrijgegeven'}</span>
        </div>
        <p className="vk-prijsregel">
          {prijs !== null ? (
            <>
              Vraagprijs <strong>{euro(prijs)}</strong> {v.deelbaar.vraagprijs ? <span className="zacht klein">(deelbaar)</span> : <span className="waarschuwingstekst klein">(nog niet deelbaar)</span>}
            </>
          ) : (
            <span className="zacht">Nog geen bevestigde vraagprijs</span>
          )}
          {pand.richtprijsIntern && (
            <span className="zacht klein">
              {' '}
              · interne richtprijs {euro(pand.richtprijsIntern)} — niet delen
            </span>
          )}
        </p>
      </div>
      <div className="vk-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'kandidaten'} className={tab === 'kandidaten' ? 'aan' : ''} onClick={() => setTab('kandidaten')}>
          Kandidaten & opvolging
        </button>
        <button role="tab" aria-selected={tab === 'pand'} className={tab === 'pand' ? 'aan' : ''} onClick={() => setTab('pand')}>
          Pand & vrijgave
        </button>
      </div>
      {tab === 'kandidaten' ? <KandidatenTab pandId={pand.id} naarPand={() => setTab('pand')} /> : <PandTab pandId={pand.id} />}
    </>
  );
}

// ======================================================================= Kandidaten & opvolging

function KandidatenTab({ pandId, naarPand }: { pandId: string; naarPand: () => void }) {
  const { staat, ik, bewaar } = useVerkoop();
  const pand = staat.panden.get(pandId)!;
  const v = vrijgaveVan(staat, pandId);
  const campagnes = staat.campagnes.filter((c) => c.pandId === pandId).sort((a, b) => b.aangemaaktOp.localeCompare(a.aangemaaktOp));
  const [campagneId, setCampagneId] = useState<string | null>(campagnes[0]?.id ?? null);
  const campagne = campagnes.find((c) => c.id === campagneId) ?? campagnes[0] ?? null;
  const lijst = useMemo(() => bouwKandidatenlijst(staat, pandId, campagne), [staat, pandId, campagne]);
  const dalingen = openPrijsdalingen(staat, pandId);
  const lancering = campagnes.find((c) => c.soort === 'lancering');
  const [filter, setFilter] = useState<Filter>('alle');
  const [wie, setWie] = useState<string>('');
  const [selectie, setSelectie] = useState<string[]>([]);
  const [bulk, setBulk] = useState(false);
  const beschikbaar = BESCHIKBARE_FASEN.includes(pand.fase);

  const start = async (soort: Campagne['soort'], daling?: (typeof dalingen)[number]) => {
    const r = startCampagne(staat, { pandId, soort, door: ik.id, nu: new Date(), daling });
    await bewaar(r.wijzigingen, r.wijzigingen.length ? `${CAMPAGNE_LABEL[soort]}: kandidatenlijst klaar` : 'Deze aanleiding was al verwerkt');
    setCampagneId(r.campagne.id);
  };

  const status = (r: KandidaatRij): Filter[] => {
    const a = r.actie;
    if (!a || (!isOpen(a) && !a.aanleidingen.some((x) => x.campagneId === campagne?.id))) return ['te_beoordelen'];
    if (a.voortgang === 'interesse' || a.voortgang === 'bezoek_gepland') return ['open', 'positief'];
    return isOpen(a) ? ['open'] : ['afgerond'];
  };
  const rijen = lijst.rijen.filter((r) => (filter === 'alle' || status(r).includes(filter)) && (!wie || r.actie?.uitvoerderId === wie || r.eigenaarId === wie));
  const rijSleutels = new Set(lijst.rijen.map((r) => r.sleutel));
  const overige = staat.acties.filter((a) => a.pandId === pandId && !rijSleutels.has(contactSleutel(staat, a.contactId)));
  const teller = (f: Filter) => lijst.rijen.filter((r) => status(r).includes(f)).length;

  return (
    <>
      {!beschikbaar && <p className="infomelding">Dit pand is {FASE_LABEL[pand.fase].toLowerCase()}: enkel context, geen beschikbaar aanbod.</p>}

      {beschikbaar && !lancering && pand.fase !== 'gepubliceerd' && (
        <div className="kaart vk-actiekaart">
          <h2>Bereid lancering voor</h2>
          <p className="zacht">Oxpecker zoekt koopklare kopers en actieve zoekers die passen, zodat je vóór publicatie interesse kunt peilen.</p>
          {!v.internMatchen ? (
            <p className="waarschuwingstekst">
              Eerst vrijgave voor intern matchen registreren.{' '}
              <button className="knop tekstknop" onClick={naarPand}>
                Naar vrijgave
              </button>
            </p>
          ) : (
            <button className="knop primair groot" onClick={() => start('lancering')}>
              Bereid lancering voor
            </button>
          )}
        </div>
      )}

      {dalingen.map((d) => (
        <div key={d.registratieId} className="kaart vk-actiekaart vk-prijsdaling">
          <h2>Prijsdaling {d.status === 'twijfel' ? 'te bevestigen' : 'herkend'}</h2>
          <p>
            Vraagprijs {euro(d.van)} → <strong>{euro(d.naar)}</strong> op {dagTekst(d.dag)}
          </p>
          {d.reden && <p className="waarschuwingstekst klein">{d.reden}</p>}
          {d.status === 'twijfel' ? (
            <div className="knoppenrij">
              <button className="knop" onClick={() => bewaar([wijziging(staat, 'prijsoordeel', d.registratieId, { registratieId: d.registratieId, oordeel: 'prijsdaling', door: ik.id, op: staat.vandaag })], 'Bevestigd als prijsdaling')}>
                Is een prijsdaling
              </button>
              <button className="knop" onClick={() => bewaar([wijziging(staat, 'prijsoordeel', d.registratieId, { registratieId: d.registratieId, oordeel: 'geen_prijsdaling', door: ik.id, op: staat.vandaag })], 'Genoteerd: geen prijsdaling')}>
                Geen prijsdaling
              </button>
            </div>
          ) : (
            <button className="knop primair groot" disabled={!beschikbaar} onClick={() => start('prijsdaling', d)}>
              Volg prijsdaling op
            </button>
          )}
        </div>
      ))}

      {campagnes.length > 0 && (
        <Chips
          label="Aanleiding"
          opties={campagnes.map((c) => ({ waarde: c.id, label: `${CAMPAGNE_LABEL[c.soort]}${c.prijs ? ` ${euro(c.prijs.naar)}` : ''} · ${c.aangemaaktOp.slice(5, 10).split('-').reverse().join('/')}` }))}
          waarde={campagne?.id ?? null}
          kies={setCampagneId}
        />
      )}
      {!campagne && beschikbaar && <p className="zacht klein">Nog geen campagne: hieronder de interne matches. Opnemen kan ook zonder campagne.</p>}
      {!v.contacteren && beschikbaar && (
        <p className="waarschuwingstekst">
          Nog geen vrijgave om kandidaten te contacteren. Matches zijn enkel intern zichtbaar; externe berichten bevatten geen pandgegevens.
        </p>
      )}

      {beschikbaar && (
        <>
          <div className="vk-tellers">
            <span>
              <strong>{teller('te_beoordelen')}</strong> te beoordelen
            </span>
            <span>
              <strong>{teller('open')}</strong> open
            </span>
            <span>
              <strong>{teller('positief')}</strong> interesse/bezoek
            </span>
            <span>
              <strong>{teller('afgerond')}</strong> afgerond
            </span>
          </div>
          <Chips
            label="Voortgang"
            opties={[
              { waarde: 'alle', label: 'Alle' },
              { waarde: 'te_beoordelen', label: 'Te beoordelen' },
              { waarde: 'open', label: 'Open' },
              { waarde: 'positief', label: 'Interesse/bezoek' },
              { waarde: 'afgerond', label: 'Afgerond' },
            ]}
            waarde={filter}
            kies={setFilter}
          />
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

          {rijen.length === 0 && <p className="kaart leeg zacht">Geen kandidaten in deze selectie. Zwakke matches worden bewust niet getoond.</p>}
          <ul className="lijst">
            {rijen.map((r) => (
              <li key={r.sleutel}>
                <RijKaart
                  rij={r}
                  campagne={campagne}
                  te_beoordelen={status(r).includes('te_beoordelen')}
                  geselecteerd={selectie.includes(r.sleutel)}
                  selecteer={(aan) => setSelectie(aan ? [...selectie, r.sleutel] : selectie.filter((s) => s !== r.sleutel))}
                />
              </li>
            ))}
          </ul>
          {selectie.length > 0 && (
            <div className="vk-bulkbalk">
              <span>{selectie.length} geselecteerd</span>
              <button className="knop primair" onClick={() => setBulk(true)}>
                Opnemen & verdelen
              </button>
            </div>
          )}
        </>
      )}

      {overige.length > 0 && (
        <Details samenvatting={`Andere acties bij dit pand (${overige.length})`}>
          <ul className="lijst">
            {overige.map((a) => (
              <li key={a.id}>
                <ActieKaart actie={a} />
              </li>
            ))}
          </ul>
        </Details>
      )}

      {(lijst.uitgesloten.length > 0 || lijst.zwakVerborgen > 0) && (
        <Details samenvatting={`Niet voorgesteld (${lijst.uitgesloten.length})`}>
          <ul className="vk-uitgesloten">
            {lijst.uitgesloten.map((u) => (
              <li key={u.contactId}>
                <Link to={`/kandidaat/${u.contactId}`}>{naamVan(staat.contacten.get(u.contactId)!)}</Link>: {u.reden}
              </li>
            ))}
          </ul>
          {lijst.zwakVerborgen > 0 && <p className="zacht klein">{lijst.zwakVerborgen} zwakke match(es) bewust niet getoond.</p>}
        </Details>
      )}

      {bulk && (
        <BulkBlad
          rijen={lijst.rijen.filter((r) => selectie.includes(r.sleutel))}
          campagne={campagne}
          sluit={() => {
            setBulk(false);
            setSelectie([]);
          }}
        />
      )}
    </>
  );
}

function RijKaart({ rij, campagne, te_beoordelen, geselecteerd, selecteer }: { rij: KandidaatRij; campagne: Campagne | null; te_beoordelen: boolean; geselecteerd: boolean; selecteer: (aan: boolean) => void }) {
  const { staat, ik, bewaar } = useVerkoop();
  const [blad, setBlad] = useState<'opnemen' | 'toewijzen' | 'eigenaar' | 'reactie' | null>(null);
  const c = staat.contacten.get(rij.contactId)!;
  const a = rij.actie && (isOpen(rij.actie) || rij.actie.aanleidingen.some((x) => x.campagneId === campagne?.id)) ? rij.actie : null;
  const nieuweAanleiding = a && isOpen(a) && campagne && !a.aanleidingen.some((x) => x.campagneId === campagne.id);

  return (
    <article className={`kaart vk-rij ${rij.categorieen.includes('koopklaar') ? 'vk-koopklaar' : ''}`}>
      <div className="vk-rijkop">
        {te_beoordelen && (
          <input className="vk-select" type="checkbox" aria-label={`Selecteer ${naamVan(c)}`} checked={geselecteerd} onChange={(e) => selecteer(e.target.checked)} />
        )}
        <div className="vk-rijnaam">
          <strong>
            <Link to={`/kandidaat/${rij.contactId}`}>{naamVan(c)}</Link>
          </strong>
          {rij.huishoudenLeden.length > 0 && <span className="zacht klein"> + {rij.huishoudenLeden.map((x) => staat.contacten.get(x)?.voornaam).join(', ')}</span>}
          <div className="zacht klein">
            Contact van {medewerkerNaam(staat, rij.eigenaarId)} · zoekopdracht “{rij.zoekopdracht.titel}”
          </div>
        </div>
        {a ? <VoortgangLabel v={a.voortgang} /> : <VoortgangLabel v="te_beoordelen" />}
      </div>
      <div className="labels">
        <KlasseLabel k={rij.match.klasse} score={rij.match.score} />
        <span className="label bron">dekking {Math.round(rij.match.dekking * 100)}%</span>
        <span className={`label ${rij.actualiteit.verouderd ? 'waarschuwing' : ''}`}>{rij.koopbereidheid.label}</span>
        {rij.categorieen
          .filter((x) => x !== 'actief' && x !== 'koopklaar')
          .map((x) => (
            <span key={x} className="label vk-cat">
              {CATEGORIE_LABEL[x]}
            </span>
          ))}
      </div>
      <ul className="vk-redenen">
        {rij.redenen.slice(0, 3).map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {rij.aandacht.map((t) => (
        <p key={t} className="waarschuwingstekst klein">
          {t}
        </p>
      ))}
      {(rij.koopbereidheid.zorg || rij.match.onbekend[0] || rij.match.afwijkingen[0]) && (
        <p className="waarschuwingstekst klein">{rij.koopbereidheid.zorg ?? rij.match.afwijkingen[0] ?? rij.match.onbekend[0]}</p>
      )}
      {a ? (
        <p className="klein">
          <strong>Actie:</strong> bij {medewerkerNaam(staat, a.uitvoerderId)}
          {a.laatsteContactOp && ` · laatste contact ${datumTijd(a.laatsteContactOp)}`}
          {a.bezoek && ` · bezoek ${dagTekst(a.bezoek.dag, a.bezoek.uur)}`}
          {a.terugbellen && ` · terugbellen ${dagTekst(a.terugbellen.dag, a.terugbellen.uur)}`}
          {a.interesse !== 'onbekend' && ` · interesse: ${a.interesse}`}
          {a.volgendeStap && (
            <>
              <br />
              Volgende stap: {a.volgendeStap}
            </>
          )}
        </p>
      ) : (
        <p className="klein">
          <strong>Aanbevolen:</strong> {rij.aanbevolenStap}
        </p>
      )}
      {nieuweAanleiding && <p className="infomelding klein">Er loopt al een open actie voor deze kandidaat. Opnemen voegt deze aanleiding eraan toe.</p>}

      <div className="knoppenrij kleine-knoppen">
        {!a || nieuweAanleiding ? (
          <button className="knop primair" onClick={() => setBlad('opnemen')}>
            {nieuweAanleiding ? 'Aanleiding toevoegen' : 'Opnemen'}
          </button>
        ) : (
          isOpen(a) && (
            <>
              <button className="knop" onClick={() => setBlad('reactie')}>
                Reactie registreren
              </button>
              {a.uitvoerderId !== ik.id && (
                <button className="knop" onClick={() => bewaar([wijsToe(staat, a, { uitvoerderId: ik.id, door: ik.id, nu: new Date() })], 'Overgenomen: staat nu in jouw bellijst')}>
                  Neem over
                </button>
              )}
              <button className="knop" onClick={() => setBlad('toewijzen')}>
                Toewijzen
              </button>
              {rij.eigenaarId !== a.uitvoerderId && (
                <button className="knop" onClick={() => setBlad('eigenaar')}>
                  Vraag {medewerkerNaam(staat, rij.eigenaarId)}
                </button>
              )}
            </>
          )
        )}
      </div>

      <Details samenvatting="Details: score, intentie, historiek">
        <table className="vk-tabel">
          <tbody>
            {rij.match.onderdelen.map((o) => (
              <tr key={o.sleutel}>
                <td>
                  {o.label} <span className="zacht">({o.gewicht}%)</span>
                  <div className="zacht klein">{o.uitleg.join(' · ') || 'niets gekend'}</div>
                </td>
                <td className="punten">{o.score === null ? 'onbekend' : Math.round(o.score * 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rij.matches.length > 1 && (
          <p className="klein">
            Andere zoekopdrachten:{' '}
            {rij.matches
              .filter((m) => m.zoekopdrachtId !== rij.match.zoekopdrachtId)
              .map((m) => `${staat.zoekopdrachten.find((z) => z.id === m.zoekopdrachtId)?.titel}: ${m.klasse === 'uitgesloten' ? `past niet (${m.schendingen[0]})` : `${m.klasse} ${m.score}`}`)
              .join('; ')}
          </p>
        )}
        <p className="klein">
          <strong>Aankoopintentie:</strong> {rij.intentie.score ?? 'onbekend'}
          {rij.intentie.signalen.map((s) => ` · ${s.label} (${s.dag})`).join('')}
        </p>
        <p className="klein">
          <strong>Belprioriteit:</strong> {rij.prioriteit.score} — {rij.prioriteit.redenen.join('; ')}
        </p>
        {rij.match.afwijkingen.length > 0 && <p className="klein">Afwijkingen: {rij.match.afwijkingen.join('; ')}</p>}
        {rij.match.onbekend.length > 0 && <p className="klein">Ontbreekt: {rij.match.onbekend.join('; ')}</p>}
        {rij.historiek.length > 0 && (
          <ul className="vk-redenen klein">
            {rij.historiek.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        )}
        {a && <Historiek actie={a} />}
      </Details>

      {blad === 'opnemen' && (
        <ToewijsBlad
          titel={`${naamVan(c)} opnemen`}
          eigenaarId={rij.eigenaarId}
          standaardBericht={rij.redenen[0] ?? ''}
          sluit={() => setBlad(null)}
          bevestig={async (uitvoerderId, bericht) => {
            const r = neemOp(staat, { rij, campagne, uitvoerderId, door: ik.id, nu: new Date(), verzoek: bericht });
            await bewaar(r.wijzigingen, r.resultaat === 'aangevuld' ? 'Aanleiding toegevoegd aan de bestaande actie' : r.resultaat === 'nieuw' ? `Opgenomen · bij ${medewerkerNaam(staat, uitvoerderId)}` : 'Bestond al: niets gewijzigd');
          }}
        />
      )}
      {blad === 'toewijzen' && a && <ActieToewijzen actie={a} sluit={() => setBlad(null)} />}
      {blad === 'eigenaar' && a && <ActieToewijzen actie={a} vraagEigenaar sluit={() => setBlad(null)} />}
      {blad === 'reactie' && a && <GesprekBlad contactId={a.contactId} acties={[a]} metClaim={false} sluit={() => setBlad(null)} />}
    </article>
  );
}

function ActieKaart({ actie }: { actie: Contactactie }) {
  const { staat } = useVerkoop();
  return (
    <div className="kaart">
      <div className="vk-rijkop">
        <div className="vk-rijnaam">
          <Link to={`/kandidaat/${actie.contactId}`}>{naamVan(staat.contacten.get(actie.contactId)!)}</Link>
          <div className="zacht klein">Bij {medewerkerNaam(staat, actie.uitvoerderId)}</div>
        </div>
        <VoortgangLabel v={actie.voortgang} />
      </div>
      <Historiek actie={actie} />
    </div>
  );
}

function Historiek({ actie }: { actie: Contactactie }) {
  const { staat } = useVerkoop();
  return (
    <ul className="historiek klein">
      {actie.aanleidingen.map((x, i) => (
        <li key={`a${i}`}>
          <strong>{CAMPAGNE_LABEL[x.soort as Campagne['soort']] ?? 'Aanleiding'}</strong> ({datumTijd(x.op)}): {x.uitleg}
        </li>
      ))}
      {actie.historiek.map((h, i) => (
        <li key={i}>
          {datumTijd(h.op)} · {medewerkerNaam(staat, h.door)}: {h.tekst}
        </li>
      ))}
    </ul>
  );
}

function BulkBlad({ rijen, campagne, sluit }: { rijen: KandidaatRij[]; campagne: Campagne | null; sluit: () => void }) {
  const { staat: live, ik, bewaar } = useVerkoop();
  const { staat } = useVastgezet(live);
  const [wie, setWie] = useState<string>('eigenaar');
  const [bezig, setBezig] = useState(false);
  return (
    <Blad titel={`${rijen.length} kandidaten opnemen`} sluit={sluit}>
      <p className="zacht">Elke kandidaat krijgt één actie. Bestaande open acties krijgen enkel de nieuwe aanleiding erbij.</p>
      <Chips
        opties={[{ waarde: 'eigenaar', label: 'Elk naar de contactverantwoordelijke' }, ...[...staat.medewerkers.values()].map((m) => ({ waarde: m.id, label: m.id === ik.id ? `Ikzelf (${m.voornaam})` : m.voornaam }))]}
        waarde={wie}
        kies={setWie}
      />
      <ul className="vk-redenen klein">
        {rijen.map((r) => (
          <li key={r.sleutel}>
            {naamVan(staat.contacten.get(r.contactId)!)} → {medewerkerNaam(staat, wie === 'eigenaar' ? r.eigenaarId : wie)}
          </li>
        ))}
      </ul>
      <button
        className="knop primair groot"
        disabled={bezig}
        onClick={async () => {
          setBezig(true);
          const w = rijen.flatMap((r) => {
            const uitvoerderId = wie === 'eigenaar' ? r.eigenaarId : wie;
            return neemOp(staat, { rij: r, campagne, uitvoerderId, door: ik.id, nu: new Date(), verzoek: uitvoerderId === ik.id ? null : (r.redenen[0] ?? null) }).wijzigingen;
          });
          // De demo-opslag aanvaardt max. 60 wijzigingen per keer: in delen bewaren, en enkel sluiten als alles lukte.
          let ok = true;
          for (let i = 0; i < w.length && ok; i += 50) ok = await bewaar(w.slice(i, i + 50), i + 50 >= w.length ? `${rijen.length} kandidaten opgenomen en verdeeld` : undefined);
          setBezig(false);
          if (ok) sluit();
        }}
      >
        Opnemen & verdelen
      </button>
    </Blad>
  );
}

// ======================================================================= Pand & vrijgave

const KENMERK_NAAM: Record<KenmerkSleutel, string> = {
  slaapkamers: 'Slaapkamers',
  bewoonbareOpp: 'Bewoonbare opp. (m²)',
  perceelOpp: 'Perceel (m²)',
  tuin: 'Tuin',
  terras: 'Terras',
  privacy: 'Privacy',
  orientatie: 'Oriëntatie',
  parking: 'Parking',
  garage: 'Garage',
  staat: 'Staat',
  epc: 'EPC',
  gelijkvloersWonen: 'Gelijkvloers wonen',
  ligging: 'Ligging',
  indeling: 'Indeling',
};

function toonKenmerk(k: KenmerkSleutel, w: Kenmerken[KenmerkSleutel]): string {
  if (w === null || w === undefined) return 'onbekend';
  if (typeof w === 'boolean') return w ? 'ja' : 'nee';
  if (k === 'tuin' && typeof w === 'object') return w.aanwezig ? `ja${w.bruikbareOpp ? `, bruikbaar ±${w.bruikbareOpp} m²` : ', bruikbare opp. onbekend'}${w.omschrijving ? ` (${w.omschrijving})` : ''}` : 'geen tuin';
  if (k === 'staat') return String(w).replace(/_/g, ' ');
  return String(w);
}

function PandTab({ pandId }: { pandId: string }) {
  const { staat, ik, bewaar } = useVerkoop();
  const pand = staat.panden.get(pandId)!;
  const v = vrijgaveVan(staat, pandId);
  const [aanvullen, setAanvullen] = useState<KenmerkSleutel | null>(null);
  const [vrijgave, setVrijgave] = useState(false);
  const [prijsBlad, setPrijsBlad] = useState(false);
  const historiek = staat.prijzen.filter((p) => p.pandId === pandId).sort((a, b) => b.dag.localeCompare(a.dag));
  const wijzigingen = prijsWijzigingen(staat.prijzen, staat.prijsoordelen, pandId);
  const toest = (t: Toestemming | null) => (t ? `Ja · ${medewerkerNaam(staat, t.door)}, ${dagTekst(t.op)} — ${t.bron}` : 'Nog niet');
  const kenmerken = Object.keys(KENMERK_NAAM) as KenmerkSleutel[];

  return (
    <>
      <section className="kaart">
        <h2>Vrijgave vóór publicatie</h2>
        <dl className="feiten">
          <dt>Intern matchen</dt>
          <dd>{toest(v.internMatchen)}</dd>
          <dt>Kandidaten contacteren</dt>
          <dd>{toest(v.contacteren)}</dd>
          <dt>Bezoeken</dt>
          <dd>{toest(v.bezoeken)}</dd>
          <dt>Mag gedeeld worden</dt>
          <dd>
            {[v.deelbaar.gemeente && 'gemeente', v.deelbaar.adres && 'adres', v.deelbaar.vraagprijs && 'vraagprijs', v.deelbaar.kenmerken && 'kenmerken'].filter(Boolean).join(', ') || 'niets'}
          </dd>
          {v.instructies && (
            <>
              <dt>Instructies</dt>
              <dd>{v.instructies}</dd>
            </>
          )}
        </dl>
        <p className="zacht klein">De fase “verkoopopdracht” geeft op zich geen toestemming om adres of prijs extern te delen.</p>
        <button className="knop" onClick={() => setVrijgave(true)}>
          Vrijgave registreren of aanpassen
        </button>
      </section>

      <section className="kaart">
        <h2>Prijs</h2>
        <p>
          Bevestigde vraagprijs: <strong>{euro(huidigeVraagprijs(staat, pandId) ?? v.vraagprijs)}</strong>
          <br />
          <span className="zacht">Interne richtprijs (nooit delen): {euro(pand.richtprijsIntern)}</span>
        </p>
        {historiek.length > 0 && (
          <ul className="historiek klein">
            {historiek.map((p) => {
              const w = wijzigingen.find((x) => x.registratieId === p.id);
              return (
                <li key={p.id}>
                  {dagTekst(p.dag)}: {euro(p.bedrag)} · {p.bron === 'handmatig' ? `handmatig door ${medewerkerNaam(staat, p.door)}` : 'uit ERAForce'}
                  {w ? ` · daling (${w.status})` : historiek.at(-1)?.id === p.id ? ' · eerste registratie' : ''}
                </li>
              );
            })}
          </ul>
        )}
        <button className="knop" onClick={() => setPrijsBlad(true)}>
          Prijswijziging registreren
        </button>
      </section>

      <section className="kaart">
        <h2>Kenmerken</h2>
        <p className="zacht klein">Onbekende gegevens laten interne voorbereiding toe, maar nooit een stellige matchclaim.</p>
        <ul className="vk-kenmerken">
          {kenmerken.map((k) => {
            const w = pand.kenmerken[k];
            const h = pand.herkomst[k];
            return (
              <li key={k}>
                <span className="zacht">{KENMERK_NAAM[k]}</span>
                <span className={w === null ? 'waarschuwingstekst' : ''}>{toonKenmerk(k, w)}</span>
                <span className="zacht klein">{h ? `${h.bron}${h.door ? ` · ${medewerkerNaam(staat, h.door)}` : ''} · ${h.op}` : ''}</span>
                <button className="knop tekstknop" onClick={() => setAanvullen(k)}>
                  {w === null ? 'Aanvullen' : 'Wijzigen'}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="klein">
          Inkoper: {medewerkerNaam(staat, pand.inkoperId)} · verkoper: {medewerkerNaam(staat, pand.verkoperId)}
        </p>
        {pand.omschrijving && <p className="zacht">{pand.omschrijving}</p>}
        <p className="zacht klein">Adres (intern): {pand.straat}, {pand.postcode} {pand.gemeente}</p>
      </section>

      {aanvullen && <KenmerkBlad pandId={pandId} sleutel={aanvullen} sluit={() => setAanvullen(null)} />}
      {vrijgave && <VrijgaveBlad pandId={pandId} sluit={() => setVrijgave(false)} />}
      {prijsBlad && (
        <PrijsBlad
          sluit={() => setPrijsBlad(false)}
          bewaarPrijs={async (bedrag, dag) => {
            const id = crypto.randomUUID();
            await bewaar([{ soort: 'prijs', id, data: { id, pandId, soort: 'vraagprijs', bedrag, valuta: 'EUR', dag, bron: 'handmatig', door: ik.id }, verwachteVersie: null }], 'Prijs geregistreerd');
          }}
        />
      )}
    </>
  );
}

function KenmerkBlad({ pandId, sleutel, sluit }: { pandId: string; sleutel: KenmerkSleutel; sluit: () => void }) {
  const { staat: live, ik, bewaar } = useVerkoop();
  const { staat } = useVastgezet(live);
  const huidig = staat.panden.get(pandId)!.kenmerken[sleutel];
  const [tekst, setTekst] = useState(typeof huidig === 'string' || typeof huidig === 'number' ? String(huidig) : '');
  const [jn, setJn] = useState<'ja' | 'nee' | null>(typeof huidig === 'boolean' ? (huidig ? 'ja' : 'nee') : null);
  const tuin = sleutel === 'tuin' ? (huidig as Kenmerken['tuin']) : null;
  const [tuinAanwezig, setTuinAanwezig] = useState<'ja' | 'nee'>(tuin?.aanwezig === false ? 'nee' : 'ja');
  const [tuinOpp, setTuinOpp] = useState(tuin?.bruikbareOpp ? String(tuin.bruikbareOpp) : '');
  const [bron, setBron] = useState(`Eigen vaststelling (${ik.voornaam})`);
  const getal = ['slaapkamers', 'bewoonbareOpp', 'perceelOpp'].includes(sleutel);
  const janee = ['terras', 'parking', 'garage', 'gelijkvloersWonen'].includes(sleutel);
  const keuzes: Partial<Record<KenmerkSleutel, string[]>> = { staat: ['instapklaar', 'op_te_frissen', 'te_renoveren'], epc: ['A', 'B', 'C', 'D', 'E', 'F'], privacy: ['goed', 'beperkt'] };

  const waarde = (): Kenmerken[KenmerkSleutel] | undefined => {
    if (sleutel === 'tuin') return { aanwezig: tuinAanwezig === 'ja', bruikbareOpp: tuinAanwezig === 'ja' && tuinOpp ? Number(tuinOpp) : null, omschrijving: tuin?.omschrijving ?? null };
    if (janee) return jn === null ? undefined : jn === 'ja';
    if (getal) return tekst ? Number(tekst) : undefined;
    return tekst.trim() || undefined;
  };
  return (
    <Blad titel={`${KENMERK_NAAM[sleutel]} aanvullen`} sluit={sluit}>
      {sleutel === 'tuin' ? (
        <>
          <Chips opties={[{ waarde: 'ja', label: 'Tuin aanwezig' }, { waarde: 'nee', label: 'Geen tuin' }]} waarde={tuinAanwezig} kies={setTuinAanwezig} />
          {tuinAanwezig === 'ja' && (
            <label className="formulier">
              Bruikbare tuin (m²) — enkel als gemeten of opgegeven, niet het perceel
              <input inputMode="numeric" value={tuinOpp} onChange={(e) => setTuinOpp(e.target.value.replace(/\D/g, ''))} />
            </label>
          )}
        </>
      ) : janee ? (
        <Chips opties={[{ waarde: 'ja', label: 'Ja' }, { waarde: 'nee', label: 'Nee' }]} waarde={jn} kies={setJn} />
      ) : keuzes[sleutel] ? (
        <Chips opties={keuzes[sleutel]!.map((k) => ({ waarde: k, label: k.replace(/_/g, ' ') }))} waarde={tekst || null} kies={setTekst} />
      ) : (
        <input inputMode={getal ? 'numeric' : 'text'} value={tekst} onChange={(e) => setTekst(getal ? e.target.value.replace(/\D/g, '') : e.target.value)} />
      )}
      <label className="formulier">
        Herkomst
        <input value={bron} onChange={(e) => setBron(e.target.value)} />
      </label>
      <button
        className="knop primair groot"
        disabled={waarde() === undefined || !bron.trim()}
        onClick={async () => {
          const w = waarde();
          if (w === undefined) return;
          const ok = await bewaar([wijziging(staat, 'kenmerk', `${pandId}|${sleutel}`, { pandId, sleutel, waarde: w, herkomst: { bron: bron.trim(), door: ik.id, op: staat.vandaag } })], 'Kenmerk bewaard; matches zijn herberekend');
          if (ok) sluit();
        }}
      >
        Bewaren
      </button>
    </Blad>
  );
}

function VrijgaveBlad({ pandId, sluit }: { pandId: string; sluit: () => void }) {
  const { staat: live, ik, bewaar } = useVerkoop();
  const { staat } = useVastgezet(live);
  const v = vrijgaveVan(staat, pandId);
  const [intern, setIntern] = useState(Boolean(v.internMatchen));
  const [contact, setContact] = useState(Boolean(v.contacteren));
  const [bezoek, setBezoek] = useState(Boolean(v.bezoeken));
  const [deelbaar, setDeelbaar] = useState(v.deelbaar);
  const [prijs, setPrijs] = useState(v.vraagprijs ? String(v.vraagprijs) : '');
  const [bron, setBron] = useState('');
  const [instructies, setInstructies] = useState(v.instructies ?? '');
  const t = (aan: boolean, oud: Toestemming | null): Toestemming | null => (aan ? (oud ?? { door: ik.id, op: staat.vandaag, bron: bron.trim() }) : null);
  const nieuwAan = (intern && !v.internMatchen) || (contact && !v.contacteren) || (bezoek && !v.bezoeken);
  return (
    <Blad titel="Vrijgave" sluit={sluit}>
      <p className="zacht klein">Registreer enkel wat met de eigenaar afgesproken is. Je naam en de datum worden bewaard.</p>
      <label className="vinkje">
        <input type="checkbox" checked={intern} onChange={(e) => setIntern(e.target.checked)} /> Intern matchen en bespreken
      </label>
      <label className="vinkje">
        <input type="checkbox" checked={contact} onChange={(e) => setContact(e.target.checked)} /> Kandidaten contacteren
      </label>
      <label className="vinkje">
        <input type="checkbox" checked={bezoek} onChange={(e) => setBezoek(e.target.checked)} /> Bezoeken organiseren
      </label>
      <strong>Wat mag extern gedeeld worden?</strong>
      {(['gemeente', 'adres', 'vraagprijs', 'kenmerken'] as const).map((k) => (
        <label key={k} className="vinkje">
          <input type="checkbox" checked={deelbaar[k]} onChange={(e) => setDeelbaar({ ...deelbaar, [k]: e.target.checked })} /> {k}
        </label>
      ))}
      <label className="formulier">
        Bevestigde vraagprijs (deelbaar, los van de interne richtprijs)
        <input inputMode="numeric" value={prijs} onChange={(e) => setPrijs(e.target.value.replace(/\D/g, ''))} placeholder="bv. 449000" />
      </label>
      <label className="formulier">
        Afspraak met de eigenaar {nieuwAan && <span className="waarschuwingstekst klein">(verplicht)</span>}
        <input value={bron} onChange={(e) => setBron(e.target.value)} placeholder="bv. Akkoord eigenaar per telefoon 10/10" />
      </label>
      <label className="formulier">
        Instructies
        <textarea rows={2} value={instructies} onChange={(e) => setInstructies(e.target.value)} />
      </label>
      <button
        className="knop primair groot"
        disabled={nieuwAan && !bron.trim()}
        onClick={async () => {
          const nieuw: Vrijgave & { door: string; op: string } = {
            pandId,
            internMatchen: t(intern || contact || bezoek, v.internMatchen),
            contacteren: t(contact, v.contacteren),
            bezoeken: t(bezoek, v.bezoeken),
            deelbaar,
            vraagprijs: prijs ? Number(prijs) : null,
            instructies: instructies.trim() || null,
            door: ik.id,
            op: staat.vandaag,
          };
          if (await bewaar([wijziging(staat, 'vrijgave', pandId, nieuw)], 'Vrijgave bewaard')) sluit();
        }}
      >
        Bewaren
      </button>
    </Blad>
  );
}

function PrijsBlad({ sluit, bewaarPrijs }: { sluit: () => void; bewaarPrijs: (bedrag: number, dag: string) => Promise<void> }) {
  const { staat } = useVerkoop();
  const [bedrag, setBedrag] = useState('');
  const [dag, setDag] = useState(staat.vandaag);
  return (
    <Blad titel="Prijswijziging registreren" sluit={sluit}>
      <p className="zacht klein">Gebruik dit enkel als de prijshistoriek uit ERAForce ontbreekt. Een eerste prijs is nooit een prijsdaling; twijfelgevallen moet je bevestigen.</p>
      <label className="formulier">
        Nieuwe vraagprijs (€)
        <input inputMode="numeric" value={bedrag} onChange={(e) => setBedrag(e.target.value.replace(/\D/g, ''))} placeholder="bv. 375000" />
      </label>
      <label className="formulier">
        Geldig vanaf
        <input type="date" value={dag} onChange={(e) => setDag(e.target.value)} />
      </label>
      <button
        className="knop primair groot"
        disabled={!bedrag || Number(bedrag) < 10000}
        onClick={async () => {
          await bewaarPrijs(Number(bedrag), dag);
          sluit();
        }}
      >
        Bewaren
      </button>
    </Blad>
  );
}
