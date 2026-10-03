import { useEffect, useState } from 'react';
import { useApp } from './context';
import { huidigAbonnement, isOpBeginscherm, lokaleTestmelding, meldingenAanzetten, meldingenUitzetten, pushOndersteund } from '../core/push';

export function MeldingenInstellingen() {
  const { store, instellingen, wijzigInstellingen, toon } = useApp();
  const [actief, setActief] = useState<boolean | null>(null);
  const [bezig, setBezig] = useState(false);
  const m = instellingen.meldingen;

  useEffect(() => {
    huidigAbonnement().then((a) => setActief(Boolean(a)), () => setActief(false));
  }, []);

  const zet = (nieuw: Partial<typeof m>) => wijzigInstellingen({ ...instellingen, meldingen: { ...m, ...nieuw } }).catch((e) => toon({ tekst: String(e), fout: true }));
  const doe = async (f: () => Promise<void>, klaar: string) => {
    setBezig(true);
    try {
      await f();
      toon({ tekst: klaar });
      setActief(Boolean(await huidigAbonnement()));
    } catch (e) {
      toon({ tekst: e instanceof Error ? e.message : String(e), fout: true });
    } finally {
      setBezig(false);
    }
  };

  return (
    <section className="kaart">
      <h2>Meldingen</h2>
      {!pushOndersteund() || !isOpBeginscherm() ? (
        <p className="infomelding klein">
          Meldingen werken op de iPhone enkel in de app op je beginscherm (iOS 16.4 of nieuwer). Open Oxpecker via het icoon op je beginscherm en kom hier terug.
        </p>
      ) : actief ? (
        <>
          <p>Meldingen staan aan op dit toestel ✓</p>
          <div className="knoppenrij">
            <button className="knop" disabled={bezig} onClick={() => doe(lokaleTestmelding, 'Testmelding getoond.')}>
              Testmelding
            </button>
            <button className="knop tekstknop" disabled={bezig} onClick={() => doe(() => meldingenUitzetten(store), 'Meldingen uitgezet op dit toestel.')}>
              Uitzetten
            </button>
          </div>
        </>
      ) : (
        <button className="knop primair groot" disabled={bezig || actief === null} onClick={() => doe(() => meldingenAanzetten(store), 'Meldingen staan aan.')}>
          Meldingen aanzetten
        </button>
      )}

      <div className="formulier" style={{ marginTop: 12 }}>
        <label className="vinkje">
          <input type="checkbox" checked={m.ochtend} onChange={(e) => zet({ ochtend: e.target.checked })} />
          Ochtendoverzicht op werkdagen
        </label>
        {m.ochtend && (
          <label>
            Om
            <input type="time" value={m.ochtendUur} onChange={(e) => e.target.value && zet({ ochtendUur: e.target.value })} />
          </label>
        )}
        <label className="vinkje">
          <input type="checkbox" checked={m.belmoment} onChange={(e) => zet({ belmoment: e.target.checked })} />
          Bij de start van een vrij belmoment
        </label>
        <label className="vinkje">
          <input type="checkbox" checked={m.terugbel} onChange={(e) => zet({ terugbel: e.target.checked })} />
          Vóór een terugbelafspraak met uur
        </label>
        {m.terugbel && (
          <label>
            Minuten vooraf
            <input type="number" inputMode="numeric" min={0} max={120} value={m.terugbelMinutenVooraf} onChange={(e) => zet({ terugbelMinutenVooraf: Number(e.target.value) || 0 })} />
          </label>
        )}
        <label className="vinkje">
          <input type="checkbox" checked={m.toonNamen} onChange={(e) => zet({ toonNamen: e.target.checked })} />
          Namen van contacten tonen in meldingen (op je vergrendelscherm zichtbaar)
        </label>
      </div>
      <p className="klein zacht">
        Meldingen worden ongeveer elke 10 minuten nagekeken; ze kunnen enkele minuten later aankomen. Standaard staan er geen klantgegevens in.
      </p>
    </section>
  );
}
