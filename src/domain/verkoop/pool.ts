// Koperspool: voorgestelde kandidaten en de matches van één kandidaat (opdracht §4 en §6).
import { dagenTussen } from '../../core/dates';
import { BESCHIKBARE_FASEN, contactRegel } from './kandidatenlijst';
import { berekenMatch, type MatchResultaat } from './matching';
import { euro } from './prijs';
import { actieveZoekopdrachten, type VerkoopStaat } from './staat';

export interface Voorstel {
  contactId: string;
  redenen: string[];
}

/** Recente signalen tellen enkel als voorstel; een medewerker controleert vóór iemand koopklaar wordt. */
const SIGNAAL_DAGEN = 90;

export function voorgesteldeKandidaten(staat: VerkoopStaat): Voorstel[] {
  const uit: Voorstel[] = [];
  for (const k of staat.kandidaten.values()) {
    const id = k.contact.id;
    if (staat.kwalificaties.has(id) || contactRegel(staat, id)) continue;
    // Leden van een huishouden dat al in de pool zit, niet apart voorstellen.
    if (k.huishoudenId && staat.huishoudens.get(k.huishoudenId)?.contactIds.some((c) => staat.kwalificaties.has(c))) continue;
    const zoek = actieveZoekopdrachten(staat, id);
    if (!zoek.length) continue;
    const recent = (dag: string) => dagenTussen(dag, staat.vandaag) <= SIGNAAL_DAGEN;
    const redenen: string[] = [];
    for (const b of staat.biedingen.filter((x) => x.contactId === id && recent(x.dag))) {
      redenen.push(`Bod van ${euro(b.bedrag)} op ${b.dag} (${b.status}) op een pand in ${staat.panden.get(b.pandId)?.gemeente ?? '?'}`);
    }
    for (const b of staat.bezoeken.filter((x) => x.contactId === id && x.volgnummer >= 2 && recent(x.dag))) {
      redenen.push(`Tweede bezoek op ${b.dag} (${staat.panden.get(b.pandId)?.gemeente ?? '?'})`);
    }
    for (const i of staat.inzichten.filter((x) => x.contactId === id && x.soort === 'aankoopplan' && x.status !== 'verworpen' && recent(x.dag))) {
      redenen.push(`Zei op ${i.dag}: "${i.citaat}"`);
    }
    if (redenen.length) uit.push({ contactId: id, redenen: [`${zoek.length} actieve zoekopdracht${zoek.length > 1 ? 'en' : ''}`, ...redenen] });
  }
  return uit;
}

/** Beste panden per zoekopdracht van een kandidaat (enkel beschikbaar aanbod; historiek enkel als context). */
export function matchesVanKandidaat(staat: VerkoopStaat, contactId: string): { zoekopdrachtId: string; matches: MatchResultaat[] }[] {
  const panden = [...staat.panden.values()].filter((p) => BESCHIKBARE_FASEN.includes(p.fase));
  return staat.zoekopdrachten
    .filter((z) => z.contactId === contactId)
    .map((z) => ({
      zoekopdrachtId: z.id,
      matches: z.status === 'actief'
        ? panden
            .map((p) => berekenMatch(staat, z, p.id))
            .filter((m) => m.klasse !== 'zwak')
            .sort((a, b) => (a.klasse === 'uitgesloten' ? 1 : 0) - (b.klasse === 'uitgesloten' ? 1 : 0) || b.score - a.score)
        : [],
    }));
}
