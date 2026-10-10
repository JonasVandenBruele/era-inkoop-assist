// Aankomend en lopend aanbod van het eigen kantoor, met vrijgave en open aanleidingen (opdracht §17.3).
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BESCHIKBARE_FASEN, bouwKandidatenlijst, isOpen, openPrijsdalingen } from '../../domain/verkoop/kandidatenlijst';
import { euro } from '../../domain/verkoop/prijs';
import { huidigeVraagprijs, vrijgaveVan } from '../../domain/verkoop/staat';
import type { VerkoopPand } from '../../domain/verkoop/model';
import { useVerkoop } from './context';
import { Details, FASE_LABEL, dagTekst, pandTitel } from './ui';

export function Aanbod() {
  const { staat } = useVerkoop();
  const panden = [...staat.panden.values()];
  const volgorde: VerkoopPand['fase'][] = ['in_voorbereiding', 'verkoopopdracht', 'gepubliceerd'];
  const beschikbaar = panden.filter((p) => BESCHIKBARE_FASEN.includes(p.fase)).sort((a, b) => volgorde.indexOf(a.fase) - volgorde.indexOf(b.fase));
  const context = panden.filter((p) => !BESCHIKBARE_FASEN.includes(p.fase));
  return (
    <>
      <div className="paginakop">
        <h1>Aanbod</h1>
        <p className="zacht">Eigen kantooraanbod: eerst vóór publicatie, dan gepubliceerd.</p>
      </div>
      <ul className="lijst">
        {beschikbaar.map((p) => (
          <li key={p.id}>
            <PandKaart pand={p} />
          </li>
        ))}
      </ul>
      {context.length > 0 && (
        <Details samenvatting={`Context: verkocht of ingetrokken (${context.length})`}>
          <p className="zacht klein">Enkel als achtergrond (bv. vergelijkbare panden of eerdere biedingen), nooit als beschikbaar aanbod.</p>
          <ul className="lijst">
            {context.map((p) => (
              <li key={p.id} className="kaart">
                <Link to={`/pand/${p.id}`}>{pandTitel(p)}</Link> · {FASE_LABEL[p.fase]}
              </li>
            ))}
          </ul>
        </Details>
      )}
    </>
  );
}

function PandKaart({ pand }: { pand: VerkoopPand }) {
  const { staat } = useVerkoop();
  const v = vrijgaveVan(staat, pand.id);
  const campagnes = staat.campagnes.filter((c) => c.pandId === pand.id);
  const lijst = useMemo(() => bouwKandidatenlijst(staat, pand.id, campagnes.sort((a, b) => b.aangemaaktOp.localeCompare(a.aangemaaktOp))[0] ?? null), [staat, pand.id, campagnes]);
  const acties = staat.acties.filter((a) => a.pandId === pand.id);
  const open = acties.filter(isOpen).length;
  const bezoeken = acties.filter((a) => a.voortgang === 'bezoek_gepland').length;
  const dalingen = openPrijsdalingen(staat, pand.id);
  const prijs = huidigeVraagprijs(staat, pand.id) ?? v.vraagprijs;
  const ontbreekt = (['slaapkamers', 'bewoonbareOpp', 'tuin', 'staat'] as const).filter((k) => pand.kenmerken[k] === null || (k === 'tuin' && pand.kenmerken.tuin?.aanwezig && pand.kenmerken.tuin.bruikbareOpp === null));
  const vink = (b: unknown) => (b ? '✓' : '✗');
  return (
    <Link to={`/pand/${pand.id}`} className="kaart vk-pandkaart">
      <div className="vk-rijkop">
        <strong>{pandTitel(pand)}</strong>
        <span className={`label ${pand.fase === 'in_voorbereiding' ? 'waarschuwing' : ''}`}>{FASE_LABEL[pand.fase]}</span>
      </div>
      <p className="klein">
        {prijs !== null ? `Vraagprijs ${euro(prijs)}` : pand.richtprijsIntern ? `Interne richtprijs ${euro(pand.richtprijsIntern)} (niet delen)` : 'Prijs onbekend'}
        {pand.publicatieGepland && pand.fase !== 'gepubliceerd' ? ` · publicatie ${dagTekst(pand.publicatieGepland)}` : ''}
      </p>
      <p className="klein zacht">
        Vrijgave: intern {vink(v.internMatchen)} · contact {vink(v.contacteren)} · bezoek {vink(v.bezoeken)}
      </p>
      <div className="labels">
        <span className="label">{lijst.rijen.length} passende kandidaten</span>
        {open > 0 && <span className="label">{open} open acties</span>}
        {bezoeken > 0 && <span className="label">{bezoeken} bezoek(en) gepland</span>}
        {dalingen.length > 0 && <span className="label gevaar">Prijsdaling: opvolgen</span>}
        {!campagnes.some((c) => c.soort === 'lancering') && pand.fase !== 'gepubliceerd' && v.internMatchen && <span className="label waarschuwing">Lancering voorbereiden</span>}
        {ontbreekt.length > 0 && <span className="label waarschuwing">Info ontbreekt</span>}
      </div>
    </Link>
  );
}
