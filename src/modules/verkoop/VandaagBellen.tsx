// Vandaag bellen: de persoonlijke contactacties van de aangemelde medewerker (opdracht §14).
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CAMPAGNE_LABEL } from '../../domain/verkoop/acties';
import { BEL_LABEL, bouwBellijst, type BelKaart as BelKaartType, type BelLabel } from '../../domain/verkoop/bellijst';
import { useVerkoop } from './context';
import { BerichtBlad, GesprekBlad } from './bladen';
import { Details, KlasseLabel, pandTitel, VoortgangLabel, dagTekst } from './ui';

const VOLGORDE: BelLabel[] = ['vandaag_eerst', 'vandaag', 'eerst_controleren', 'deze_week'];

type BladSoort = 'gesprek' | 'bericht' | 'resultaat';

export function VandaagBellen() {
  const { staat, ik, laatstGeladen, opslagSoort } = useVerkoop();
  // Het blad leeft op paginaniveau: na registratie kan de kaart uit de lijst verdwijnen, het blad blijft open.
  const [blad, setBlad] = useState<{ kaart: BelKaartType; soort: BladSoort } | null>(null);
  const lijst = useMemo(() => bouwBellijst(staat, ik.id), [staat, ik.id]);
  const per = (l: BelLabel) => lijst.kaarten.filter((k) => k.label === l);
  const vandaag = per('vandaag_eerst').length + per('vandaag').length;

  return (
    <>
      <div className="paginakop">
        <h1>Vandaag bellen</h1>
        <p className="zacht">
          {ik.voornaam} · {vandaag} voor vandaag · dagdoel {lijst.capaciteit}
          {lijst.later > 0 && ` · ${lijst.later} later aan de beurt`}
        </p>
        <p className="zacht klein">
          {opslagSoort === 'gedeeld' ? 'Gedeeld met collega’s' : 'Enkel in deze browser'}
          {laatstGeladen && ` · bijgewerkt ${laatstGeladen.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}`}
        </p>
      </div>

      {lijst.kaarten.length === 0 && (
        <div className="kaart leeg">
          <p>Geen contactacties voor jou vandaag.</p>
          <p className="zacht">
            Acties verschijnen hier zodra iemand je een kandidaat toewijst of je zelf een kandidaat opneemt bij een pand.
          </p>
          <div className="knoppenrij" style={{ justifyContent: 'center' }}>
            <Link className="knop" to="/aanbod">
              Naar aanbod
            </Link>
            <Link className="knop" to="/rondleiding">
              Demonstratieroute
            </Link>
          </div>
        </div>
      )}

      {VOLGORDE.map((l) => {
        const kaarten = per(l);
        if (!kaarten.length) return null;
        const inhoud = (
          <ul className="lijst">
            {kaarten.map((k, i) => (
              <li key={k.sleutel}>
                <BelKaart kaart={k} open={(soort) => setBlad({ kaart: k, soort })} nummer={l === 'vandaag_eerst' || l === 'vandaag' ? i + 1 + (l === 'vandaag' ? per('vandaag_eerst').length : 0) : null} />
              </li>
            ))}
          </ul>
        );
        return (
          <section key={l} className="blok">
            {l === 'deze_week' ? (
              <Details samenvatting={`${BEL_LABEL[l]} (${kaarten.length})`}>{inhoud}</Details>
            ) : (
              <>
                <h3>
                  {BEL_LABEL[l]} ({kaarten.length})
                </h3>
                {inhoud}
              </>
            )}
          </section>
        );
      })}
      {blad && <KaartBlad {...blad} sluit={() => setBlad(null)} />}
    </>
  );
}

function KaartBlad({ kaart, soort, sluit }: { kaart: BelKaartType; soort: BladSoort; sluit: () => void }) {
  const eerste = kaart.onderdelen[0]!;
  const acties = kaart.onderdelen.map((o) => o.actie);
  if (soort === 'bericht') return eerste.bericht ? <BerichtBlad contactId={kaart.contactId} acties={acties} tekst={eerste.bericht} beperking={eerste.beperking} sluit={sluit} /> : null;
  return <GesprekBlad contactId={kaart.contactId} acties={acties} openingszin={soort === 'gesprek' ? eerste.openingszin : null} metClaim={soort === 'gesprek'} sluit={sluit} />;
}

function BelKaart({ kaart, nummer, open }: { kaart: BelKaartType; nummer: number | null; open: (soort: BladSoort) => void }) {
  const { staat } = useVerkoop();
  const eerste = kaart.onderdelen[0]!;
  const magBellen = !kaart.claimDoorAnder && kaart.onderdelen.some((o) => o.magContacteren);
  const kw = staat.kwalificaties.get(kaart.contactId);

  return (
    <article className={`kaart belkaart vk-belkaart vk-label-${kaart.label}`}>
      <div className="belkaart-kop">
        {nummer !== null && <span className="volgnummer">{nummer}</span>}
        <div className="belkaart-naam">
          <strong>
            <Link to={`/kandidaat/${kaart.contactId}`}>{kaart.naam}</Link>
          </strong>
          {kaart.huishouden && <div className="zacht klein">Huishouden: {kaart.huishouden}</div>}
          <div className="zacht klein">{kaart.telefoon ?? 'geen telefoonnummer'} (fictief)</div>
        </div>
        <div className="labels rechts">
          <span className={`label vk-bellabel-${kaart.label}`}>{BEL_LABEL[kaart.label]}</span>
          <span className="label">{kaart.koopbereidheid.label}</span>
        </div>
      </div>
      {kaart.labelReden && <p className={kaart.label === 'eerst_controleren' ? 'waarschuwingstekst' : 'reden'}>{kaart.labelReden}</p>}
      {kaart.verzoek && (
        <p className="vk-verzoek">
          <strong>Van {staat.medewerkers.get(eerste.actie.toegewezenDoor)?.voornaam ?? 'een collega'}:</strong> {kaart.verzoek}
        </p>
      )}

      {kaart.onderdelen.map((o) => {
        const pand = o.actie.pandId ? staat.panden.get(o.actie.pandId) : null;
        return (
          <div key={o.actie.id} className="vk-onderdeel">
            <div className="labels">
              {pand ? (
                <Link className="label bron" to={`/pand/${pand.id}`}>
                  {pandTitel(pand)}
                </Link>
              ) : (
                <span className="label bron">{o.actie.soort === 'herbevestiging' ? 'Koopbereidheid' : 'Afgesproken opvolging'}</span>
              )}
              <span className="label">{o.campagne ? CAMPAGNE_LABEL[o.campagne.soort] : o.actie.soort === 'herbevestiging' ? 'Opnieuw bevestigen' : 'Opvolging'}</span>
              <VoortgangLabel v={o.actie.voortgang} />
              {o.match && o.actie.pandId && <KlasseLabel k={o.match.klasse} score={o.match.score} />}
            </div>
            <ul className="vk-redenen">
              {o.waarom.slice(0, 3).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        );
      })}

      <dl className="feiten vk-feiten">
        <dt>Laatste contact</dt>
        <dd>{kaart.laatsteContact}</dd>
        <dt>Intentie</dt>
        <dd>{kaart.intentie.score === null ? 'onbekend' : `${kaart.intentie.score} · ${kaart.intentie.signalen[0]?.label ?? ''}`}</dd>
        {kw?.budget && (
          <>
            <dt>Budget</dt>
            <dd>
              tot €{kw.budget.bedrag.toLocaleString('nl-BE')} (bevestigd {kw.budget.bevestigdOp})
            </dd>
          </>
        )}
        {kaart.onzekerheid && (
          <>
            <dt>Onzeker</dt>
            <dd className="waarschuwingstekst">{kaart.onzekerheid}</dd>
          </>
        )}
      </dl>

      {eerste.openingszin ? <p className="openingszin">“{eerste.openingszin}”</p> : eerste.beperking && <p className="waarschuwingstekst klein">{eerste.beperking}</p>}
      {kaart.onderdelen.length > 1 && <p className="zacht klein">Meerdere panden in één gesprek: bespreek ook {kaart.onderdelen.slice(1).map((o) => (o.actie.pandId ? pandTitel(staat.panden.get(o.actie.pandId)!) : 'de afgesproken opvolging')).join(', ')}.</p>}
      <p>
        <strong>Volgende stap:</strong> {kaart.volgendeStap}
      </p>
      {eerste.actie.bezoek && <p className="zacht">Bezoek gepland: {dagTekst(eerste.actie.bezoek.dag, eerste.actie.bezoek.uur)}</p>}

      {kaart.claimDoorAnder && (
        <p className="waarschuwingstekst">
          {staat.medewerkers.get(kaart.claimDoorAnder.door)?.voornaam} belt nu (tot {new Date(kaart.claimDoorAnder.tot).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}).
        </p>
      )}
      <div className="knoppenrij">
        <button className="knop primair belknop" disabled={!magBellen} onClick={() => open('gesprek')}>
          Bel (simulatie)
        </button>
        <button className="knop" disabled={Boolean(kaart.claimDoorAnder) || !eerste.bericht} onClick={() => open('bericht')}>
          Bericht
        </button>
        <button className="knop" disabled={Boolean(kaart.claimDoorAnder)} onClick={() => open('resultaat')}>
          Resultaat
        </button>
      </div>

      <Details samenvatting="Waarom deze plaats in de lijst?">
        <p className="zacht klein">Belprioriteit {kaart.prioriteit} (geen voorspelde aankoopkans).</p>
        <ul className="vk-redenen">
          {kaart.prioriteitRedenen.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        {eerste.match?.afwijkingen.length ? (
          <>
            <strong>Afwijkingen</strong>
            <ul className="vk-redenen">
              {eerste.match.afwijkingen.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </>
        ) : null}
        {eerste.match?.onbekend.length ? (
          <>
            <strong>Ontbrekende informatie</strong>
            <ul className="vk-redenen">
              {eerste.match.onbekend.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </>
        ) : null}
      </Details>

    </article>
  );
}
