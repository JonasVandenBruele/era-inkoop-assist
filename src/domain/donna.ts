// Avondoverzicht voor Donna (PLAN.md §6.4): bewerkbare, kopieerbare tekst. Wordt nooit automatisch verstuurd.
import { dagVan, korteDag, uurVan, type DagKey } from '../core/dates';
import type { Afspraak, Belpoging, Belverbod, Contact, Opvolgactie } from './model';
import { volledigeNaam } from './model';
import { referentieCode } from './belresultaat';

export interface DonnaInvoer {
  dag: DagKey;
  belpogingen: Belpoging[];
  contacten: Contact[];
  opvolgacties: Opvolgactie[];
  afspraken: Afspraak[];
  belverboden: Belverbod[];
  voornaam: string;
  metReferentie: boolean;
}

export interface DonnaConcept {
  tekst: string;
  belpogingIds: string[];
  aantalInhoudelijk: number;
  aantalGeenAntwoord: number;
}

function identificatie(c: Contact): string {
  if (c.bron === 'lokaal' || !c.externId) {
    const tel = c.telefoons[0]?.nummer;
    return `NIEUW contact (nog niet in ERAForce)${tel ? `, tel. ${tel}` : ''}${c.gemeente ? `, ${c.gemeente}` : ''}`;
  }
  return c.externId;
}

export function maakDonnaConcept(i: DonnaInvoer): DonnaConcept {
  const vandaag = i.belpogingen
    .filter((p) => !p.ongedaanOp && dagVan(p.tijdstip) === i.dag)
    .sort((a, b) => a.tijdstip.getTime() - b.tijdstip.getTime());
  const contact = new Map(i.contacten.map((c) => [c.id, c]));
  const inhoudelijk = vandaag.filter((p) => p.uitkomst !== 'geen_antwoord');
  const geenAntwoord = vandaag.filter((p) => p.uitkomst === 'geen_antwoord');
  const isTest = vandaag.some((p) => p.isTestdata);

  const regels: string[] = [`Belresultaten ${korteDag(i.dag)} — ${i.voornaam}`];
  if (isTest) regels.push('⚠ TESTDATA — niet invoeren in ERAForce');
  regels.push('');

  if (inhoudelijk.length === 0) regels.push('Geen gesprekken vandaag.', '');
  inhoudelijk.forEach((p, n) => {
    const c = contact.get(p.contactId);
    if (!c) return;
    regels.push(`${n + 1}. ${[c.aanhef, volledigeNaam(c)].filter(Boolean).join(' ')} — ${identificatie(c)}`);
    const delen: string[] = [];
    switch (p.uitkomst) {
      case 'gesproken':
        delen.push('Gesproken.');
        break;
      case 'terugbellen':
        delen.push(p.isInhoudelijk ? 'Gesproken, terugbellen afgesproken.' : 'Kort contact (niet de beslisser), terugbellen afgesproken.');
        break;
      case 'afspraak':
        delen.push('Afspraak gemaakt.');
        break;
      case 'niet_meer_bellen':
        delen.push('Wil NIET MEER gebeld worden.');
        break;
    }
    if (p.notitie) delen.push(`Notitie: ${p.notitie}`);
    if (p.volgendeStap) delen.push(`Volgende stap: ${p.volgendeStap}`);
    for (const o of i.opvolgacties.filter((o) => o.belpogingId === p.id && o.status !== 'vervallen')) {
      delen.push(`${o.soort === 'terugbellen' ? 'Terugbellen' : 'Opvolgen'} op ${korteDag(o.dag)}${o.uur ? ` om ${o.uur}` : ''}.`);
    }
    for (const a of i.afspraken.filter((a) => a.belpogingId === p.id)) {
      delen.push(`Afspraak: ${korteDag(dagVan(a.start))} ${uurVan(a.start)}–${uurVan(a.einde)}${a.locatie ? `, ${a.locatie}` : ''}.`);
    }
    for (const b of i.belverboden.filter((b) => b.belpogingId === p.id && !b.ingetrokkenOp)) {
      if (b.reden) delen.push(`Reden: ${b.reden}`);
    }
    for (const deel of delen) regels.push(`   ${deel}`);
    if (i.metReferentie) regels.push(`   [${referentieCode(p.id)}]`);
    regels.push('');
  });

  if (geenAntwoord.length > 0) {
    regels.push('Geen antwoord:');
    const perContact = new Map<string, number>();
    for (const p of geenAntwoord) perContact.set(p.contactId, (perContact.get(p.contactId) ?? 0) + 1);
    for (const [id, aantal] of perContact) {
      const c = contact.get(id);
      if (c) regels.push(`- ${volledigeNaam(c)} (${identificatie(c)})${aantal > 1 ? ` — ${aantal}×` : ''}`);
    }
  }

  return {
    tekst: regels.join('\n').trimEnd(),
    belpogingIds: vandaag.map((p) => p.id),
    aantalInhoudelijk: inhoudelijk.length,
    aantalGeenAntwoord: geenAntwoord.length,
  };
}
