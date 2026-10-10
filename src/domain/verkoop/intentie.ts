// Aankoopintentie en actualiteit van de koopbereidheid (opdracht §5 en §13).
// Aankoopintentie = hoe sterk wijzen actuele signalen op concrete aankoopbereidheid. Ze staat los van de
// koopklare status, die enkel een medewerker bevestigt. Geen signalen = onbekend (geen 0).
import { dagenTussen, dagVan, type DagKey } from '../../core/dates';
import type { Kwalificatie } from './model';
import type { VerkoopStaat } from './staat';

export interface Signaal {
  /** Ontdubbelsleutel: dezelfde activiteit uit meerdere bronnen telt één keer. */
  sleutel: string;
  label: string;
  dag: DagKey;
  gewicht: number;
  /** Na verval door ouderdom. */
  effectief: number;
}

export interface Intentie {
  score: number | null;
  signalen: Signaal[];
}

/** Signalen verliezen de helft van hun gewicht per HALVERING dagen; ouder dan MAX_DAGEN telt niet meer. */
const HALVERING = 45;
const MAX_DAGEN = 180;

const GEWICHT = { bod: 45, tweede_bezoek: 25, bezoek: 10, aankoopplan: 20, interesse: 15, timing: 15 } as const;

export function berekenIntentie(staat: VerkoopStaat, contactId: string): Intentie {
  const ruw: Omit<Signaal, 'effectief'>[] = [];
  const pandNaam = (id: string) => staat.panden.get(id)?.gemeente ?? 'pand';
  for (const b of staat.biedingen.filter((x) => x.contactId === contactId)) {
    ruw.push({ sleutel: `bod:${b.pandId}`, label: `Bod op pand in ${pandNaam(b.pandId)}${b.status === 'overboden' ? ' (overboden)' : b.status === 'geweigerd' ? ' (geweigerd)' : ''}`, dag: b.dag, gewicht: GEWICHT.bod });
  }
  for (const b of staat.bezoeken.filter((x) => x.contactId === contactId)) {
    if (b.volgnummer >= 2) ruw.push({ sleutel: `bezoek2:${b.pandId}`, label: `Tweede bezoek ${pandNaam(b.pandId)}`, dag: b.dag, gewicht: GEWICHT.tweede_bezoek });
    else ruw.push({ sleutel: `bezoek:${b.pandId}`, label: `Bezoek ${pandNaam(b.pandId)}`, dag: b.dag, gewicht: GEWICHT.bezoek });
  }
  // Een bezoek dat ook als contactmoment geregistreerd werd, is dezelfde activiteit (zelfde sleutel).
  for (const m of staat.contactmomenten.filter((x) => x.contactId === contactId)) {
    const panden = staat.acties.filter((a) => m.actieIds.includes(a.id) && a.pandId).map((a) => a.pandId!);
    if (m.uitkomst === 'interesse' || m.uitkomst === 'bezoek') {
      for (const p of panden) ruw.push({ sleutel: `interesse:${p}`, label: `Interesse getoond (${pandNaam(p)})`, dag: dagVan(new Date(m.op)), gewicht: GEWICHT.interesse });
    }
  }
  for (const i of staat.inzichten.filter((x) => x.contactId === contactId && x.soort === 'aankoopplan' && x.status !== 'verworpen')) {
    ruw.push({ sleutel: 'aankoopplan', label: `Uitspraak: "${i.citaat}"`, dag: i.dag, gewicht: i.status === 'bevestigd' ? GEWICHT.aankoopplan : GEWICHT.aankoopplan / 2 });
  }
  const kw = staat.kwalificaties.get(contactId);
  if (kw?.termijn && kw.laatsteBevestiging) {
    ruw.push({ sleutel: 'timing', label: `Bevestigde termijn: ${kw.termijn}`, dag: kw.laatsteBevestiging.op, gewicht: GEWICHT.timing });
  }

  // Ontdubbelen: per sleutel enkel het sterkste/recentste signaal.
  const perSleutel = new Map<string, Signaal>();
  for (const s of ruw) {
    const leeftijd = Math.max(0, dagenTussen(s.dag, staat.vandaag));
    if (leeftijd > MAX_DAGEN) continue;
    const effectief = s.gewicht * Math.pow(0.5, leeftijd / HALVERING);
    const vorig = perSleutel.get(s.sleutel);
    if (!vorig || effectief > vorig.effectief) perSleutel.set(s.sleutel, { ...s, effectief });
  }
  const signalen = [...perSleutel.values()].sort((a, b) => b.effectief - a.effectief);
  if (!signalen.length) return { score: null, signalen: [] };
  return { score: Math.min(100, Math.round(signalen.reduce((t, s) => t + s.effectief, 0))), signalen };
}

export interface Actualiteit {
  /** Dagen sinds de laatste inhoudelijke bevestiging, of null als er nooit een was. */
  dagenSinds: number | null;
  verouderd: boolean;
  label: string;
}

export function actualiteit(kw: Kwalificatie | undefined, vandaag: DagKey, ritmeDagen: number): Actualiteit {
  if (!kw?.laatsteBevestiging) return { dagenSinds: null, verouderd: true, label: 'Nooit bevestigd dat de kandidaat nog zoekt' };
  const d = dagenTussen(kw.laatsteBevestiging.op, vandaag);
  if (d > ritmeDagen) return { dagenSinds: d, verouderd: true, label: `Opnieuw bevestigen: ${d} dagen geleden voor het laatst bevestigd` };
  return { dagenSinds: d, verouderd: false, label: d === 0 ? 'Vandaag bevestigd' : `${d} dagen geleden bevestigd` };
}

export const POOL_LABEL: Record<Kwalificatie['poolStatus'], string> = {
  te_kwalificeren: 'Te kwalificeren',
  actief: 'Actief zoekend',
  koopklaar: 'Koopklaar',
  gepauzeerd: 'Gepauzeerd',
  afgerond: 'Gekocht of afgerond',
};

export const FINANCIERING_LABEL: Record<Kwalificatie['financiering']['status'], string> = {
  onbekend: 'Onbekend',
  te_onderzoeken: 'Nog te onderzoeken',
  besproken_kredietverstrekker: 'Besproken met kredietverstrekker',
  bevestigd: 'Bevestigd volgens beschikbare informatie',
};

/** Korte omschrijving van de koopbereidheid, eerlijk over wat (nog) niet bevestigd is. */
export function koopbereidheidTekst(staat: VerkoopStaat, contactId: string): { label: string; zorg: string | null } {
  const kw = staat.kwalificaties.get(contactId);
  if (!kw) return { label: 'Niet in de koperspool', zorg: 'Koopbereidheid onbekend' };
  const act = actualiteit(kw, staat.vandaag, staat.instellingen.bevestigingsritmeDagen);
  let label = POOL_LABEL[kw.poolStatus];
  if (kw.poolStatus === 'koopklaar') label = act.verouderd ? 'Koopklaar (bevestiging verouderd)' : 'Koopklaar, bevestigd';
  let zorg: string | null = null;
  if (act.verouderd && kw.poolStatus !== 'afgerond') zorg = act.label;
  else if (kw.afhankelijkVanVerkoop.status === 'ja') zorg = `Moet eerst eigen woning verkopen${kw.afhankelijkVanVerkoop.toelichting ? ` (${kw.afhankelijkVanVerkoop.toelichting})` : ''}`;
  else if (kw.financiering.status === 'onbekend' || kw.financiering.status === 'te_onderzoeken') zorg = `Financiering: ${FINANCIERING_LABEL[kw.financiering.status].toLowerCase()}`;
  return { label, zorg };
}
