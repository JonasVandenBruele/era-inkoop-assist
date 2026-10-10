// Koperspool: gedeelde kandidaten en hun koopbereidheid, voorgestelde kandidaten en zelf toevoegen (opdracht §4–§5).
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { nieuweKwalificatie } from '../../domain/verkoop/acties';
import { actualiteit, FINANCIERING_LABEL, POOL_LABEL } from '../../domain/verkoop/intentie';
import { contactRegel } from '../../domain/verkoop/kandidatenlijst';
import { naamVan, type PoolStatus } from '../../domain/verkoop/model';
import { matchesVanKandidaat, voorgesteldeKandidaten } from '../../domain/verkoop/pool';
import { euro } from '../../domain/verkoop/prijs';
import { actieveZoekopdrachten, laatsteContact, medewerkerNaam, wijziging } from '../../domain/verkoop/staat';
import { useVerkoop } from './context';
import { Chips, Details, KlasseLabel, pandTitel } from './ui';

type Filter = PoolStatus | 'alle' | 'herbevestigen';

export function Koperspool() {
  const { staat, ik, bewaar } = useVerkoop();
  const [filter, setFilter] = useState<Filter>('alle');
  const [wie, setWie] = useState('');
  const [zoek, setZoek] = useState('');
  const voorstellen = useMemo(() => voorgesteldeKandidaten(staat), [staat]);
  const ritme = staat.instellingen.bevestigingsritmeDagen;
  const pool = [...staat.kwalificaties.values()].filter((k) => staat.contacten.has(k.contactId));
  const verouderd = (id: string) => {
    const k = staat.kwalificaties.get(id)!;
    return k.poolStatus !== 'afgerond' && k.poolStatus !== 'gepauzeerd' && actualiteit(k, staat.vandaag, ritme).verouderd;
  };
  const getoond = pool
    .filter((k) => filter === 'alle' || (filter === 'herbevestigen' ? verouderd(k.contactId) : k.poolStatus === filter))
    .filter((k) => !wie || k.verantwoordelijkeId === wie)
    .filter((k) => !zoek || naamVan(staat.contacten.get(k.contactId)!).toLowerCase().includes(zoek.toLowerCase()))
    .sort((a, b) => ['koopklaar', 'actief', 'te_kwalificeren', 'gepauzeerd', 'afgerond'].indexOf(a.poolStatus) - ['koopklaar', 'actief', 'te_kwalificeren', 'gepauzeerd', 'afgerond'].indexOf(b.poolStatus));
  const teller = (s: Filter) => (s === 'herbevestigen' ? pool.filter((k) => verouderd(k.contactId)).length : pool.filter((k) => k.poolStatus === s).length);
  const buitenPool = [...staat.kandidaten.values()].filter(
    (k) =>
      !staat.kwalificaties.has(k.contact.id) &&
      !voorstellen.some((v) => v.contactId === k.contact.id) &&
      // Een partner uit een huishouden dat al in de pool zit, niet nog eens apart aanbieden.
      !(k.huishoudenId && staat.huishoudens.get(k.huishoudenId)?.contactIds.some((c) => staat.kwalificaties.has(c))),
  );

  const voegToe = (contactId: string, wijze: 'zelf' | 'voorstel') => {
    const eigenaar = staat.kandidaten.get(contactId)?.eigenaarId ?? ik.id;
    return bewaar([wijziging(staat, 'kwalificatie', contactId, nieuweKwalificatie(contactId, ik.id, staat.vandaag, wijze, eigenaar))], 'Toegevoegd aan de koperspool: controleer nu de koopbereidheid');
  };

  return (
    <>
      <div className="paginakop">
        <h1>Koperspool</h1>
        <p className="zacht">Kantoorbreed: wie zoekt wat en wie is aantoonbaar koopklaar.</p>
      </div>

      {voorstellen.length > 0 && (
        <section className="blok">
          <h3>Voorgesteld door Oxpecker ({voorstellen.length})</h3>
          <p className="zacht klein">Op basis van actieve zoekopdrachten en recente signalen. Een signaal is geen bewijs van financiering: controleer eerst.</p>
          <ul className="lijst">
            {voorstellen.map((v) => {
              const c = staat.contacten.get(v.contactId)!;
              return (
                <li key={v.contactId} className="kaart">
                  <div className="vk-rijkop">
                    <strong>
                      <Link to={`/kandidaat/${v.contactId}`}>{naamVan(c)}</Link>
                    </strong>
                    <span className="label waarschuwing">Voorstel</span>
                  </div>
                  <ul className="vk-redenen klein">
                    {v.redenen.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                  <div className="knoppenrij kleine-knoppen">
                    <button className="knop primair" onClick={() => voegToe(v.contactId, 'voorstel')}>
                      Toevoegen (te kwalificeren)
                    </button>
                    <Link className="knop" to={`/kandidaat/${v.contactId}`}>
                      Bekijken
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Chips
        label="Status"
        opties={[
          { waarde: 'alle', label: `Alle (${pool.length})` },
          { waarde: 'koopklaar', label: `Koopklaar (${teller('koopklaar')})` },
          { waarde: 'actief', label: `Actief (${teller('actief')})` },
          { waarde: 'te_kwalificeren', label: `Te kwalificeren (${teller('te_kwalificeren')})` },
          { waarde: 'herbevestigen', label: `Opnieuw bevestigen (${teller('herbevestigen')})` },
          { waarde: 'gepauzeerd', label: `Gepauzeerd (${teller('gepauzeerd')})` },
          { waarde: 'afgerond', label: `Afgerond (${teller('afgerond')})` },
        ]}
        waarde={filter}
        kies={setFilter}
      />
      <div className="tweekoloms">
        <label className="vk-filter">
          Verantwoordelijke
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
          Zoeken
          <input type="search" value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Naam" />
        </label>
      </div>

      {getoond.length === 0 && <p className="kaart leeg zacht">Geen kandidaten in deze selectie.</p>}
      <ul className="lijst">
        {getoond.map((k) => {
          const c = staat.contacten.get(k.contactId)!;
          const act = actualiteit(k, staat.vandaag, ritme);
          const regel = contactRegel(staat, k.contactId);
          const zoekopdrachten = actieveZoekopdrachten(staat, k.contactId);
          const beste = matchesVanKandidaat(staat, k.contactId)
            .flatMap((x) => x.matches)
            .filter((m) => m.klasse === 'sterk' || m.klasse === 'goed')
            .sort((a, b) => b.score - a.score)[0];
          const lc = laatsteContact(staat, k.contactId);
          return (
            <li key={k.contactId}>
              <Link to={`/kandidaat/${k.contactId}`} className="kaart vk-poolkaart">
                <div className="vk-rijkop">
                  <strong>{naamVan(c)}</strong>
                  <span className={`label vk-pool-${k.poolStatus}`}>{POOL_LABEL[k.poolStatus]}</span>
                </div>
                <div className="labels">
                  {k.poolStatus !== 'afgerond' && k.poolStatus !== 'gepauzeerd' && <span className={`label ${act.verouderd ? 'waarschuwing' : ''}`}>{act.verouderd ? 'Opnieuw bevestigen' : act.label}</span>}
                  {k.budget && <span className="label bron">tot {euro(k.budget.bedrag)}</span>}
                  <span className="label bron">Financiering: {FINANCIERING_LABEL[k.financiering.status].toLowerCase()}</span>
                  {k.afhankelijkVanVerkoop.status === 'ja' && <span className="label waarschuwing">Moet eerst eigen woning verkopen</span>}
                  {regel && <span className="label gevaar">{regel}</span>}
                </div>
                <p className="klein zacht">
                  {medewerkerNaam(staat, k.verantwoordelijkeId)} · {zoekopdrachten.length} actieve zoekopdracht{zoekopdrachten.length === 1 ? '' : 'en'} · laatste contact {lc ? lc.dag : 'onbekend'}
                </p>
                {beste && (
                  <p className="klein">
                    Beste match: {pandTitel(staat.panden.get(beste.pandId)!)} <KlasseLabel k={beste.klasse} score={beste.score} />
                  </p>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <Details samenvatting={`Zelf toevoegen (${buitenPool.length} bestaande contacten)`}>
        <p className="zacht klein">Kies een bestaand contact uit ERAForce (in de demo: fictief), controleer de zoekvraag en leg daarna de koopbereidheid vast.</p>
        <ul className="vk-uitgesloten">
          {buitenPool.map((k) => (
            <li key={k.contact.id}>
              <Link to={`/kandidaat/${k.contact.id}`}>{naamVan(k.contact)}</Link> · {actieveZoekopdrachten(staat, k.contact.id).length} zoekopdracht(en){' '}
              <button className="knop tekstknop" onClick={() => voegToe(k.contact.id, 'zelf')}>
                Toevoegen
              </button>
            </li>
          ))}
        </ul>
      </Details>
    </>
  );
}
