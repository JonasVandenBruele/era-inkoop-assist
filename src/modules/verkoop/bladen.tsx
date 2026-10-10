// Bladen die op meerdere schermen terugkomen: gesprek registreren, bericht (gesimuleerd), toewijzen, inzichten bevestigen.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { claim, geefVrij, registreerResultaat, UITKOMST_LABEL, wijsToe } from '../../domain/verkoop/acties';
import { KENMERK_LABEL } from '../../domain/verkoop/feedback';
import { naamVan, type Contactactie, type Inzicht, type InzichtKenmerk, type Uitkomst } from '../../domain/verkoop/model';
import { actieveZoekopdrachten, vrijgaveVan, wijziging, type VerkoopStaat } from '../../domain/verkoop/staat';
import { plusDagen } from '../../core/dates';
import { plusWerkdagen } from '../../domain/werkdagen';
import { useVastgezet, useVerkoop } from './context';
import { Blad, Chips, DagUurKeuze, pandTitel } from './ui';

const UITKOMSTEN: Uitkomst[] = ['interesse', 'bezoek', 'geen_interesse', 'profiel_aangepast', 'geen_antwoord', 'terugbellen', 'gepauzeerd', 'gekocht', 'niet_meer_contacteren'];

const REDENEN: InzichtKenmerk[] = ['prijs', 'prijs_kwaliteit', 'ligging', 'indeling', 'tuin', 'staat', 'grootte', 'algemeen'];

/** Gesprek (gesimuleerd) + snelle resultaatregistratie. Claimt de acties tijdens het bellen. */
export function GesprekBlad({ contactId, acties, openingszin, sluit, metClaim = true }: { contactId: string; acties: Contactactie[]; openingszin?: string | null; sluit: () => void; metClaim?: boolean }) {
  const { staat: live, ik, bewaar } = useVerkoop();
  const { staat, geef } = useVastgezet(live);
  const contact = staat.contacten.get(contactId)!;
  const [gekozen, setGekozen] = useState<string[]>(acties.map((a) => a.id));
  const [uitkomst, setUitkomst] = useState<Uitkomst | null>(null);
  const [reden, setReden] = useState<InzichtKenmerk | null>(null);
  const [notitie, setNotitie] = useState('');
  const [moment, setMoment] = useState<{ dag: string; uur: string | null }>({ dag: plusWerkdagen(staat.vandaag, 1), uur: null });
  const [zoekId, setZoekId] = useState<string | null>(actieveZoekopdrachten(staat, contactId)[0]?.id ?? null);
  const [pauzeTot, setPauzeTot] = useState<string | null>(plusDagen(staat.vandaag, 90));
  const [bezig, setBezig] = useState(false);
  const [bewaardId, setBewaardId] = useState<string | null>(null);
  const [bezet, setBezet] = useState<string | null>(null);
  const geclaimd = useRef<string[]>([]);

  // Claim tijdens het bellen, zodat collega's niet tegelijk bellen. Vervalt vanzelf na de ingestelde tijd.
  const claimGestart = useRef(false);
  useEffect(() => {
    // Eén keer per geopend blad (React voert effecten in ontwikkelmodus twee keer uit).
    if (!metClaim || claimGestart.current) return;
    claimGestart.current = true;
    (async () => {
      const w = [];
      for (const a of acties.filter((x) => staat.acties.some((y) => y.id === x.id))) {
        const r = claim(staat, a, ik.id, new Date());
        if (!r.ok) {
          setBezet(`${staat.medewerkers.get(r.door)?.voornaam ?? 'Een collega'} belt deze kandidaat nu (claim tot ${new Date(r.tot).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}).`);
          return;
        }
        w.push(r.wijziging);
      }
      if (!w.length) return;
      if (await bewaar(w)) {
        geef(w);
        geclaimd.current = w.map((x) => x.id);
      } else {
        setBezet('Een collega nam deze kandidaat net op. Bekijk de bijgewerkte kaart voor je belt.');
      }
    })();
    // Enkel bij openen.
  }, []);

  const annuleer = async () => {
    if (!bewaardId && geclaimd.current.length) {
      const w = staat.acties.filter((a) => geclaimd.current.includes(a.id) && a.claim?.door === ik.id).map((a) => geefVrij(staat, a));
      if (w.length) await bewaar(w);
    }
    sluit();
  };

  const metPand = acties.filter((a) => a.pandId);
  const geenBezoekVrijgave = metPand.some((a) => gekozen.includes(a.id) && !vrijgaveVan(staat, a.pandId!).bezoeken);
  const herbevestiging = acties.every((a) => a.soort !== 'pand');
  const label = (u: Uitkomst) => (herbevestiging && u === 'interesse' ? 'Zoekt nog (bevestigd)' : UITKOMST_LABEL[u]);
  const kanBewaren =
    uitkomst !== null &&
    gekozen.length > 0 &&
    !(uitkomst === 'bezoek' && (!moment.dag || geenBezoekVrijgave)) &&
    !(uitkomst === 'geen_interesse' && !reden) &&
    !(uitkomst === 'gekocht' && !zoekId);

  const bewaarResultaat = async () => {
    if (!uitkomst) return;
    setBezig(true);
    const r = registreerResultaat(staat, {
      contactId,
      acties: acties.filter((a) => gekozen.includes(a.id)),
      uitkomst,
      reden: uitkomst === 'geen_interesse' ? reden : null,
      notitie,
      terugbellen: uitkomst === 'terugbellen' ? moment : null,
      bezoek: uitkomst === 'bezoek' ? moment : null,
      zoekopdrachtId: uitkomst === 'gekocht' ? zoekId : null,
      pauzeTot: uitkomst === 'gepauzeerd' ? pauzeTot : null,
      door: ik.id,
      nu: new Date(),
      maakId: () => crypto.randomUUID(),
      gesimuleerd: true,
    });
    const ok = await bewaar(r.wijzigingen, `${UITKOMST_LABEL[uitkomst]} geregistreerd voor ${naamVan(contact)} (demo)`);
    setBezig(false);
    if (!ok) return;
    if (r.contactmoment.notitie) setBewaardId(r.contactmoment.id);
    else sluit();
  };

  if (bewaardId) {
    return (
      <Blad titel="Geregistreerd" sluit={sluit}>
        <p>Het resultaat staat bij het pand, in de koperspool en in de historiek.</p>
        <InzichtVoorstellen staat={staat} bronRef={`n:${bewaardId}`} leeg="In je notitie herkende Oxpecker niets om het zoekprofiel aan te passen." />
        <div className="knoppenrij">
          <Link className="knop" to={`/kandidaat/${contactId}`} onClick={sluit}>
            Kandidaat openen
          </Link>
          <button className="knop primair" onClick={sluit}>
            Klaar
          </button>
        </div>
      </Blad>
    );
  }

  return (
    <Blad titel={`Gesprek met ${naamVan(contact)}`} sluit={annuleer}>
      <p className="infomelding klein">
        Demo: er wordt niet echt gebeld. Nummer {contact.telefoons[0]?.nummer ?? '—'} is fictief. Een tik op bellen telt niet als gesprek: registreer hieronder wat er gebeurde.
      </p>
      {bezet && <p className="foutmelding">{bezet}</p>}
      {openingszin && <p className="openingszin">“{openingszin}”</p>}

      {metPand.length > 1 && (
        <fieldset className="vk-veld">
          <legend>Over welke panden ging het?</legend>
          {acties.map((a) => (
            <label key={a.id} className="vinkje">
              <input type="checkbox" checked={gekozen.includes(a.id)} onChange={(e) => setGekozen(e.target.checked ? [...gekozen, a.id] : gekozen.filter((x) => x !== a.id))} />
              {a.pandId ? pandTitel(staat.panden.get(a.pandId)!) : a.soort === 'herbevestiging' ? 'Koopbereidheid bevestigen' : 'Afgesproken opvolging'}
            </label>
          ))}
        </fieldset>
      )}

      <h3 className="vk-h3">Hoe ging het?</h3>
      <div className="vk-uitkomsten">
        {UITKOMSTEN.map((u) => (
          <button key={u} type="button" className={`knop vk-uitkomst ${uitkomst === u ? 'aan' : ''} ${u === 'niet_meer_contacteren' ? 'gevaar' : ''}`} aria-pressed={uitkomst === u} onClick={() => setUitkomst(u)}>
            {label(u)}
          </button>
        ))}
      </div>

      {uitkomst === 'bezoek' && (
        <div className="vk-veld">
          <strong>Wanneer?</strong>
          {geenBezoekVrijgave && <p className="waarschuwingstekst">Nog geen vrijgave voor bezoeken bij dit pand. Vraag eerst vrijgave.</p>}
          <DagUurKeuze soort="bezoek" vandaag={staat.vandaag} waarde={moment} wijzig={setMoment} />
          <p className="zacht klein">Demo: er wordt geen uitnodiging verstuurd.</p>
        </div>
      )}
      {uitkomst === 'terugbellen' && (
        <div className="vk-veld">
          <strong>Terugbellen op</strong>
          <DagUurKeuze soort="terugbellen" vandaag={staat.vandaag} waarde={moment} wijzig={setMoment} />
        </div>
      )}
      {uitkomst === 'geen_interesse' && (
        <div className="vk-veld">
          <strong>Waarom niet?</strong>
          <Chips opties={REDENEN.map((r) => ({ waarde: r, label: r === 'algemeen' ? 'andere reden' : KENMERK_LABEL[r] }))} waarde={reden} kies={setReden} label="Reden" />
          <p className="zacht klein">Het pand komt pas terug als deze reden echt verandert (bv. een prijsdaling bij een prijsbezwaar).</p>
        </div>
      )}
      {uitkomst === 'gepauzeerd' && (
        <div className="vk-veld">
          <strong>Pauze tot</strong>
          <Chips
            opties={[
              { waarde: plusDagen(staat.vandaag, 30), label: '1 maand' },
              { waarde: plusDagen(staat.vandaag, 90), label: '3 maanden' },
              { waarde: plusDagen(staat.vandaag, 180), label: '6 maanden' },
            ]}
            waarde={pauzeTot}
            kies={setPauzeTot}
          />
          <p className="zacht klein">Alle open acties voor deze kandidaat worden afgesloten. Nieuwe matches heffen de pauze niet op.</p>
        </div>
      )}
      {uitkomst === 'gekocht' && (
        <div className="vk-veld">
          <strong>Welk zoektraject sluit?</strong>
          {actieveZoekopdrachten(staat, contactId).map((z) => (
            <label key={z.id} className="vinkje">
              <input type="radio" name="zoek" checked={zoekId === z.id} onChange={() => setZoekId(z.id)} />
              {z.titel}
            </label>
          ))}
          <p className="zacht klein">Andere zoektrajecten blijven actief. De kandidaat wordt één keer aangemeld voor de opvolging na aankoop.</p>
        </div>
      )}
      {uitkomst === 'niet_meer_contacteren' && <p className="waarschuwingstekst">Alle open acties sluiten en de kandidaat komt in geen enkele lijst meer, ook niet bij een nieuwe match.</p>}

      <label className="formulier vk-veld">
        Notitie <span className="zacht klein">(optioneel; Oxpecker stelt profielaanpassingen voor)</span>
        <textarea rows={3} value={notitie} onChange={(e) => setNotitie(e.target.value)} placeholder="Bv. Goede ligging, maar de tuin is te klein." />
      </label>

      <button className="knop primair groot" disabled={!kanBewaren || bezig || Boolean(bezet)} onClick={bewaarResultaat}>
        {bezig ? 'Bewaren…' : 'Resultaat bewaren'}
      </button>
      <button className="knop tekstknop" onClick={annuleer}>
        Annuleren (claim vrijgeven)
      </button>
    </Blad>
  );
}

/** Berichtvoorstel. WhatsApp openen is in de demo gesimuleerd en bewijst nooit dat er iets verstuurd werd. */
export function BerichtBlad({ contactId, acties, tekst, beperking, sluit }: { contactId: string; acties: Contactactie[]; tekst: string; beperking: string | null; sluit: () => void }) {
  const { staat: live, ik, bewaar, toon } = useVerkoop();
  const { staat } = useVastgezet(live);
  const [bericht, setBericht] = useState(tekst);
  const [geopend, setGeopend] = useState(false);
  const contact = staat.contacten.get(contactId)!;
  return (
    <Blad titel={`Bericht aan ${naamVan(contact)}`} sluit={sluit}>
      {beperking && <p className="waarschuwingstekst klein">{beperking}</p>}
      <textarea rows={6} value={bericht} onChange={(e) => setBericht(e.target.value)} />
      <button
        className="knop groot"
        onClick={() => {
          setGeopend(true);
          toon('Demo: WhatsApp wordt niet geopend en er wordt niets verstuurd.');
        }}
      >
        WhatsApp openen (simulatie)
      </button>
      {geopend && (
        <>
          <p className="zacht klein">WhatsApp openen bewijst geen verzending. Duid enkel aan wat echt gebeurde.</p>
          <button
            className="knop primair groot"
            onClick={async () => {
              const r = registreerResultaat(staat, { contactId, acties, uitkomst: 'bericht_verstuurd', kanaal: 'whatsapp', notitie: null, door: ik.id, nu: new Date(), maakId: () => crypto.randomUUID(), gesimuleerd: true });
              if (await bewaar(r.wijzigingen, 'Bericht als verstuurd geregistreerd (demo)')) sluit();
            }}
          >
            Ik heb het bericht verstuurd
          </button>
        </>
      )}
      <button className="knop tekstknop" onClick={sluit}>
        Niet verstuurd, sluiten
      </button>
    </Blad>
  );
}

/** Toewijzen aan een collega, met een korte boodschap (bv. de matchreden). */
export function ToewijsBlad({ titel, eigenaarId, standaardBericht, bevestig, sluit }: { titel: string; eigenaarId: string | null; standaardBericht: string; bevestig: (uitvoerderId: string, bericht: string | null) => Promise<void>; sluit: () => void }) {
  const { staat, ik } = useVerkoop();
  const [wie, setWie] = useState<string>(eigenaarId ?? ik.id);
  const [bericht, setBericht] = useState(standaardBericht);
  const [bezig, setBezig] = useState(false);
  return (
    <Blad titel={titel} sluit={sluit}>
      <strong>Wie belt?</strong>
      <div className="vk-uitkomsten">
        {[...staat.medewerkers.values()].map((m) => (
          <button key={m.id} type="button" className={`knop vk-uitkomst ${wie === m.id ? 'aan' : ''}`} aria-pressed={wie === m.id} onClick={() => setWie(m.id)}>
            {m.id === ik.id ? `Ikzelf (${m.voornaam})` : m.voornaam}
            {m.id === eigenaarId ? ' · contactverantwoordelijke' : ''}
          </button>
        ))}
      </div>
      {wie !== ik.id && (
        <label className="formulier">
          Bericht aan {staat.medewerkers.get(wie)?.voornaam}
          <textarea rows={3} value={bericht} onChange={(e) => setBericht(e.target.value)} />
        </label>
      )}
      <button
        className="knop primair groot"
        disabled={bezig}
        onClick={async () => {
          setBezig(true);
          await bevestig(wie, wie !== ik.id && bericht.trim() ? bericht.trim() : null);
          setBezig(false);
          sluit();
        }}
      >
        {wie === ik.id ? 'In mijn bellijst zetten' : `Toewijzen aan ${staat.medewerkers.get(wie)?.voornaam}`}
      </button>
    </Blad>
  );
}

/** Snelle toewijzing van een bestaande actie (toewijzen, overnemen, eigenaar vragen). */
export function ActieToewijzen({ actie, sluit, vraagEigenaar = false }: { actie: Contactactie; sluit: () => void; vraagEigenaar?: boolean }) {
  const { staat: live, ik, bewaar } = useVerkoop();
  const { staat } = useVastgezet(live);
  const eigenaar = staat.kwalificaties.get(actie.contactId)?.verantwoordelijkeId ?? staat.kandidaten.get(actie.contactId)?.eigenaarId ?? null;
  return (
    <ToewijsBlad
      titel={vraagEigenaar ? 'Vraag de contactverantwoordelijke om te bellen' : 'Toewijzen'}
      eigenaarId={vraagEigenaar ? eigenaar : actie.uitvoerderId}
      standaardBericht={actie.aanleidingen.at(-1)?.uitleg ?? ''}
      sluit={sluit}
      bevestig={async (uitvoerderId, bericht) => {
        await bewaar([wijsToe(staat, staat.acties.find((a) => a.id === actie.id) ?? actie, { uitvoerderId, door: ik.id, nu: new Date(), bericht })], uitvoerderId === ik.id ? 'In je bellijst gezet' : `Toegewezen aan ${staat.medewerkers.get(uitvoerderId)?.voornaam}`);
      }}
    />
  );
}

/** Voorstellen uit vrije tekst: bevestigen of verwerpen, met de letterlijke bronzin. */
export function InzichtVoorstellen({ staat, bronRef, contactId, leeg }: { staat: VerkoopStaat; bronRef?: string; contactId?: string; leeg?: string }) {
  const { ik, bewaar } = useVerkoop();
  const lijst = staat.inzichten.filter((i) => (bronRef ? i.bronRef === bronRef : i.contactId === contactId) && i.status === 'voorstel');
  if (!lijst.length) return leeg ? <p className="zacht">{leeg}</p> : null;
  const beslis = (i: Inzicht, status: Inzicht['status']) =>
    bewaar([wijziging(staat, 'inzicht', i.id, { inzicht: { ...i, status }, door: ik.id, op: staat.vandaag })], status === 'bevestigd' ? 'Bevestigd' : 'Verworpen');
  return (
    <ul className="vk-inzichten">
      {lijst.map((i) => (
        <li key={i.id} className="vk-inzicht">
          <p className="citaat">“{i.citaat}”</p>
          <p>
            <strong>{i.soort === 'over_ander' ? 'Niet toegeschreven' : 'Voorstel'}:</strong> {i.uitleg}
            {i.pandId && staat.panden.get(i.pandId) && <span className="zacht"> ({pandTitel(staat.panden.get(i.pandId)!)})</span>}
          </p>
          <p className="zacht klein">Herkend in de tekst ({i.herkenning === 'regels' ? 'automatische herkenning' : 'AI'}), betrouwbaarheid {i.betrouwbaarheid}. Controleer.</p>
          <div className="knoppenrij kleine-knoppen">
            <button className="knop" onClick={() => beslis(i, 'bevestigd')}>
              {i.soort === 'over_ander' ? 'Klopt, niet toeschrijven' : 'Bevestigen'}
            </button>
            <button className="knop" onClick={() => beslis(i, 'verworpen')}>
              Verwerpen
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
