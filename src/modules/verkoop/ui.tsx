// Kleine bouwstenen voor de verkoopschermen: iconen, onderblad, keuzechips, datumkeuze, labels.
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { korteDag, plusDagen, type DagKey } from '../../core/dates';
import { plusWerkdagen } from '../../domain/werkdagen';
import type { MatchKlasse } from '../../domain/verkoop/matching';
import type { Voortgang, VerkoopPand } from '../../domain/verkoop/model';
import { naamVan } from '../../domain/verkoop/model';
import type { VerkoopStaat } from '../../domain/verkoop/staat';

export const ICONEN = {
  telefoon: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
  mensen: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6',
  huis: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  kantoor: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
};

export function Icoon({ pad }: { pad: string }) {
  return (
    <svg className="icoon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={pad} />
    </svg>
  );
}

/** Onderblad (gsm-vriendelijk). Scrollt zelf, zodat het schermtoetsenbord niets onbereikbaar maakt. */
export function Blad({ titel, sluit, children }: { titel: string; sluit: () => void; children: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && sluit();
    document.addEventListener('keydown', esc);
    const vorige = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = vorige;
    };
  }, [sluit]);
  return (
    <div className="blad-achtergrond vk-blad-achtergrond" onClick={(e) => e.target === e.currentTarget && sluit()}>
      <div className="blad vk-blad" role="dialog" aria-modal="true" aria-label={titel}>
        <div className="vk-bladkop">
          <h2>{titel}</h2>
          <button className="knop tekstknop" onClick={sluit} aria-label="Sluiten">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Chips<T extends string>({ opties, waarde, kies, label }: { opties: { waarde: T; label: string }[]; waarde: T | null; kies: (w: T) => void; label?: string }) {
  return (
    <div className="vk-chips" role="group" aria-label={label}>
      {opties.map((o) => (
        <button key={o.waarde} type="button" className={`vk-chip ${waarde === o.waarde ? 'aan' : ''}`} aria-pressed={waarde === o.waarde} onClick={() => kies(o.waarde)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** "Morgen" enkel als het echt morgen is; anders de dag zelf (bv. "ma 12 okt" op een zaterdag). */
function dagLabel(dag: DagKey, vandaag: DagKey): string {
  return dag === plusDagen(vandaag, 1) ? `Morgen (${korteDag(dag)})` : korteDag(dag);
}

function volgendeZaterdag(vandaag: DagKey): DagKey {
  let d = plusDagen(vandaag, 1);
  while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 6) d = plusDagen(d, 1);
  return d;
}

/** Datum en uur kiezen met één of twee tikken; een datumveld blijft beschikbaar voor een andere dag. */
export function DagUurKeuze({
  vandaag,
  waarde,
  wijzig,
  soort,
}: {
  vandaag: DagKey;
  waarde: { dag: DagKey; uur: string | null };
  wijzig: (w: { dag: DagKey; uur: string | null }) => void;
  soort: 'bezoek' | 'terugbellen';
}) {
  const dagen =
    soort === 'bezoek'
      ? [
          { waarde: plusWerkdagen(vandaag, 1), label: dagLabel(plusWerkdagen(vandaag, 1), vandaag) },
          { waarde: volgendeZaterdag(vandaag), label: `Zaterdag ${korteDag(volgendeZaterdag(vandaag)).slice(3)}` },
          { waarde: plusWerkdagen(vandaag, 3), label: korteDag(plusWerkdagen(vandaag, 3)) },
        ]
      : [
          { waarde: vandaag, label: 'Vandaag' },
          { waarde: plusWerkdagen(vandaag, 1), label: dagLabel(plusWerkdagen(vandaag, 1), vandaag) },
          { waarde: plusWerkdagen(vandaag, 3), label: 'Over 3 werkdagen' },
          { waarde: plusDagen(vandaag, 7), label: 'Volgende week' },
        ];
  const uren = soort === 'bezoek' ? ['10:00', '14:00', '17:30'] : ['10:00', '14:00', '17:30'];
  const uniek = dagen.filter((d, i) => dagen.findIndex((x) => x.waarde === d.waarde) === i);
  return (
    <div className="vk-daguur">
      <Chips opties={uniek} waarde={waarde.dag} kies={(dag) => wijzig({ ...waarde, dag })} label="Dag" />
      <div className="tweekoloms">
        <label>
          Andere dag
          <input type="date" value={waarde.dag} min={vandaag} onChange={(e) => e.target.value && wijzig({ ...waarde, dag: e.target.value })} />
        </label>
        <label>
          Uur {soort === 'terugbellen' && <span className="zacht klein">(optioneel)</span>}
          <input type="time" value={waarde.uur ?? ''} step={900} onChange={(e) => wijzig({ ...waarde, uur: e.target.value || null })} />
        </label>
      </div>
      <Chips opties={uren.map((u) => ({ waarde: u, label: u }))} waarde={waarde.uur} kies={(uur) => wijzig({ ...waarde, uur })} label="Uur" />
    </div>
  );
}

export function pandTitel(p: Pick<VerkoopPand, 'type' | 'gemeente'>): string {
  const soort = { woning: 'Woning', appartement: 'Appartement', bouwgrond: 'Bouwgrond', handelspand: 'Handelspand', opbrengsteigendom: 'Opbrengsteigendom', ander: 'Pand' }[p.type];
  return `${soort} ${p.gemeente}`;
}

export const FASE_LABEL: Record<VerkoopPand['fase'], string> = {
  in_voorbereiding: 'In voorbereiding',
  verkoopopdracht: 'Verkoopopdracht',
  gepubliceerd: 'Gepubliceerd',
  onder_optie: 'Onder optie',
  verkocht: 'Verkocht',
  ingetrokken: 'Ingetrokken',
};

export const VOORTGANG_LABEL: Record<Voortgang | 'te_beoordelen', string> = {
  te_beoordelen: 'Te beoordelen',
  nog_contacteren: 'Nog contacteren',
  in_behandeling: 'In behandeling',
  geen_antwoord: 'Geen antwoord',
  terugbellen: 'Terugbellen op datum',
  interesse: 'Interesse',
  bezoek_gepland: 'Bezoek gepland',
  geen_interesse: 'Geen interesse',
  afgerond: 'Afgerond',
};

export function VoortgangLabel({ v }: { v: Voortgang | 'te_beoordelen' }) {
  return <span className={`label vk-vg vk-vg-${v}`}>{VOORTGANG_LABEL[v]}</span>;
}

export function KlasseLabel({ k, score }: { k: MatchKlasse; score?: number }) {
  const tekst = { sterk: 'Sterke match', goed: 'Goede match', mogelijk: 'Mogelijke match', zwak: 'Zwakke match', uitgesloten: 'Past niet' }[k];
  return (
    <span className={`label vk-klasse-${k}`}>
      {tekst}
      {score !== undefined ? ` · ${score}` : ''}
    </span>
  );
}

export function KandidaatLink({ staat, id }: { staat: VerkoopStaat; id: string }) {
  const c = staat.contacten.get(id);
  return <Link to={`/kandidaat/${id}`}>{c ? naamVan(c) : id}</Link>;
}

export function Details({ samenvatting, children, open = false }: { samenvatting: ReactNode; children: ReactNode; open?: boolean }) {
  const [isOpen, setOpen] = useState(open);
  return (
    <details className="vk-details" open={isOpen} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>{samenvatting}</summary>
      {isOpen && <div className="vk-details-inhoud">{children}</div>}
    </details>
  );
}

export function datumTijd(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}`;
}

export function dagTekst(dag: DagKey | null | undefined, uur?: string | null): string {
  if (!dag) return '—';
  return `${korteDag(dag)}${uur ? ` om ${uur}` : ''}`;
}
