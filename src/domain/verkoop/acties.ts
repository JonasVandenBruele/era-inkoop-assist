// Bewerkingen op campagnes, contactacties en kwalificaties. Pure functies: ze geven de te bewaren records terug;
// de opslag bewaart ze met een versiecontrole, zodat twee collega's elkaars werk nooit stil overschrijven.
import { dagVan, korteDag, plusDagen, type DagKey } from '../../core/dates';
import { plusWerkdagen } from '../werkdagen';
import { KENMERK_LABEL } from './feedback';
import type { PrijsWijziging } from './prijs';
import {
  SCORE_VERSIE,
  type Campagne,
  type CampagneSoort,
  type Contactactie,
  type Contactmoment,
  type InzichtKenmerk,
  type Kwalificatie,
  type Uitkomst,
  type Voortgang,
} from './model';
import { isOpen, type KandidaatRij } from './kandidatenlijst';
import { contactSleutel, huidigeVraagprijs, medewerkerNaam, wijziging, type VerkoopStaat, type Wijziging } from './staat';

const iso = (d: Date) => d.toISOString();

// ---------------------------------------------------------------- campagnes

export function campagneId(soort: CampagneSoort, pandId: string, daling?: PrijsWijziging): string {
  return soort === 'prijsdaling' && daling ? `c:prijsdaling:${daling.registratieId}` : `c:${soort}:${pandId}`;
}

/** Start een campagne. Dezelfde aanleiding opnieuw verwerken maakt geen tweede campagne. */
export function startCampagne(
  staat: VerkoopStaat,
  invoer: { pandId: string; soort: CampagneSoort; door: string; nu: Date; daling?: PrijsWijziging },
): { campagne: Campagne; wijzigingen: Wijziging[] } {
  const id = campagneId(invoer.soort, invoer.pandId, invoer.daling);
  const bestaand = staat.campagnes.find((c) => c.id === id);
  if (bestaand) return { campagne: bestaand, wijzigingen: [] };
  const campagne: Campagne = {
    id,
    pandId: invoer.pandId,
    soort: invoer.soort,
    sleutel: invoer.daling ? `prijsdaling:${invoer.daling.registratieId}` : `${invoer.soort}:${invoer.pandId}`,
    prijs: invoer.daling ? { van: invoer.daling.van, naar: invoer.daling.naar, registratieId: invoer.daling.registratieId } : null,
    aangemaaktDoor: invoer.door,
    aangemaaktOp: iso(invoer.nu),
    scoreVersie: SCORE_VERSIE,
  };
  return { campagne, wijzigingen: [wijziging(staat, 'campagne', id, campagne)] };
}

export const CAMPAGNE_LABEL: Record<CampagneSoort, string> = {
  lancering: 'Vóór lancering',
  prijsdaling: 'Prijsdaling',
  opvolging: 'Andere opvolging',
};

// ---------------------------------------------------------------- acties opnemen en verdelen

export interface Opname {
  /** 'nieuw' = actie gemaakt; 'aangevuld' = nieuwe aanleiding bij bestaande open actie; 'bestaat' = niets gewijzigd. */
  resultaat: 'nieuw' | 'aangevuld' | 'bestaat' | 'afgehandeld';
  wijzigingen: Wijziging[];
  actie: Contactactie | null;
}

/**
 * Neemt een kandidaat uit de lijst op als contactactie. Voorkomt dubbele open acties per kandidaat (of huishouden) en pand:
 * een nieuwe aanleiding wordt aan de bestaande open actie toegevoegd, met zichtbare uitleg.
 */
export function neemOp(
  staat: VerkoopStaat,
  invoer: { rij: KandidaatRij; campagne: Campagne | null; uitvoerderId: string; door: string; nu: Date; verzoek?: string | null },
): Opname {
  const { rij, campagne, door, nu } = invoer;
  const pandId = rij.match.pandId;
  const uitleg = rij.redenen.slice(0, 2).map((x) => x.replace(/\.$/, '')).join('. ') || 'Past bij de zoekopdracht';
  const aanleiding = { campagneId: campagne?.id ?? null, soort: campagne?.soort ?? ('opvolging' as const), uitleg, op: iso(nu), door };
  const open = staat.acties.find((a) => a.pandId === pandId && contactSleutel(staat, a.contactId) === rij.sleutel && isOpen(a));
  if (open) {
    if (open.aanleidingen.some((x) => x.campagneId === aanleiding.campagneId)) return { resultaat: 'bestaat', wijzigingen: [], actie: open };
    const nieuw: Contactactie = {
      ...open,
      aanleidingen: [...open.aanleidingen, aanleiding],
      historiek: [...open.historiek, { op: iso(nu), door, tekst: `Nieuwe aanleiding toegevoegd (${CAMPAGNE_LABEL[aanleiding.soort]}): ${uitleg}` }],
    };
    return { resultaat: 'aangevuld', wijzigingen: [wijziging(staat, 'actie', open.id, nieuw)], actie: nieuw };
  }
  const id = `a:${campagne?.id ?? `los:${pandId}`}:${rij.sleutel}`;
  const zelfde = staat.acties.find((a) => a.id === id);
  if (zelfde) return { resultaat: 'afgehandeld', wijzigingen: [], actie: zelfde };
  const actie: Contactactie = {
    id,
    kantoorId: staat.basis.kantoor.id,
    contactId: rij.contactId,
    pandId,
    soort: 'pand',
    aanleidingen: [aanleiding],
    voortgang: 'nog_contacteren',
    interesse: 'onbekend',
    uitvoerderId: invoer.uitvoerderId,
    toegewezenDoor: door,
    verzoek: invoer.verzoek ?? null,
    claim: null,
    terugbellen: null,
    bezoek: null,
    volgendePoging: null,
    volgendeStap: rij.aanbevolenStap,
    geenInteresseReden: null,
    laatsteContactOp: null,
    historiek: [
      {
        op: iso(nu),
        door,
        tekst: invoer.uitvoerderId === door ? 'Opgenomen in de eigen bellijst' : `Toegewezen aan ${medewerkerNaam(staat, invoer.uitvoerderId)}${invoer.verzoek ? `: "${invoer.verzoek}"` : ''}`,
      },
    ],
    aangemaaktOp: iso(nu),
    aangemaaktDoor: door,
    scoreVersie: SCORE_VERSIE,
  };
  return { resultaat: 'nieuw', wijzigingen: [{ soort: 'actie', id, data: actie, verwachteVersie: null }], actie };
}

/** Toewijzen aan een collega, of zelf overnemen (zichtbare overdracht in de historiek). */
export function wijsToe(staat: VerkoopStaat, actie: Contactactie, invoer: { uitvoerderId: string; door: string; nu: Date; bericht?: string | null }): Wijziging {
  const van = actie.uitvoerderId;
  const tekst =
    invoer.uitvoerderId === invoer.door && van !== invoer.door
      ? `Overgenomen van ${medewerkerNaam(staat, van)}`
      : `Toegewezen aan ${medewerkerNaam(staat, invoer.uitvoerderId)}${van !== invoer.uitvoerderId ? ` (was ${medewerkerNaam(staat, van)})` : ''}`;
  const nieuw: Contactactie = {
    ...actie,
    uitvoerderId: invoer.uitvoerderId,
    toegewezenDoor: invoer.door,
    verzoek: invoer.bericht ?? actie.verzoek,
    claim: null,
    historiek: [...actie.historiek, { op: iso(invoer.nu), door: invoer.door, tekst: `${tekst}${invoer.bericht ? `: "${invoer.bericht}"` : ''}` }],
  };
  return wijziging(staat, 'actie', actie.id, nieuw);
}

export function claimActief(actie: Contactactie, nu: Date): boolean {
  return Boolean(actie.claim && new Date(actie.claim.tot) > nu);
}

/**
 * Tijdelijke claim tijdens het bellen. Lukt niet als een collega een geldige claim heeft. Een vergeten claim vervalt
 * na de ingestelde tijd. Gelijktijdige claims worden door de versiecontrole van de opslag beslecht.
 */
export function claim(staat: VerkoopStaat, actie: Contactactie, door: string, nu: Date): { ok: true; wijziging: Wijziging } | { ok: false; door: string; tot: string } {
  if (actie.claim && actie.claim.door !== door && claimActief(actie, nu)) return { ok: false, door: actie.claim.door, tot: actie.claim.tot };
  const tot = new Date(nu.getTime() + staat.instellingen.claimMinuten * 60_000);
  return { ok: true, wijziging: wijziging(staat, 'actie', actie.id, { ...actie, claim: { door, tot: iso(tot) } }) };
}

export function geefVrij(staat: VerkoopStaat, actie: Contactactie): Wijziging {
  return wijziging(staat, 'actie', actie.id, { ...actie, claim: null });
}

// ---------------------------------------------------------------- resultaat registreren

export interface ResultaatInvoer {
  contactId: string;
  /** De acties waarover gesproken werd (gebundeld per kandidaat). Virtuele acties (herbevestiging) worden aangemaakt. */
  acties: Contactactie[];
  uitkomst: Uitkomst;
  reden?: InzichtKenmerk | null;
  notitie?: string | null;
  terugbellen?: { dag: DagKey; uur: string | null } | null;
  bezoek?: { dag: DagKey; uur: string | null } | null;
  /** Bij "gekocht": welk zoektraject sluit. */
  zoekopdrachtId?: string | null;
  pauzeTot?: DagKey | null;
  kanaal?: Contactmoment['kanaal'];
  door: string;
  nu: Date;
  maakId: () => string;
  gesimuleerd: boolean;
}

export const UITKOMST_LABEL: Record<Uitkomst, string> = {
  interesse: 'Gesproken, interesse',
  bezoek: 'Bezoek afgesproken',
  geen_interesse: 'Geen interesse',
  profiel_aangepast: 'Zoekprofiel aangepast',
  geen_antwoord: 'Geen antwoord',
  terugbellen: 'Terugbellen op datum',
  gepauzeerd: 'Zoeken gepauzeerd',
  gekocht: 'Gekocht',
  niet_meer_contacteren: 'Niet meer contacteren',
  bericht_verstuurd: 'Bericht verstuurd',
};

/** Uitkomsten die inhoudelijk bevestigen dat de kandidaat nog zoekt. */
const BEVESTIGT_ZOEKEN: Uitkomst[] = ['interesse', 'bezoek', 'profiel_aangepast'];

export function registreerResultaat(staat: VerkoopStaat, r: ResultaatInvoer): { wijzigingen: Wijziging[]; contactmoment: Contactmoment } {
  const vandaag = dagVan(r.nu);
  const op = iso(r.nu);
  const wijzigingen: Wijziging[] = [];
  const contactmoment: Contactmoment = {
    id: r.maakId(),
    contactId: r.contactId,
    actieIds: r.acties.map((a) => a.id),
    door: r.door,
    op,
    kanaal: r.kanaal ?? 'telefoon',
    uitkomst: r.uitkomst,
    reden: r.reden ?? null,
    notitie: r.notitie?.trim() || null,
    terugbellen: r.terugbellen ?? null,
    bezoek: r.bezoek ?? null,
    gesimuleerd: r.gesimuleerd,
  };
  wijzigingen.push({ soort: 'contactmoment', id: contactmoment.id, data: contactmoment, verwachteVersie: null });

  const tekst = `${UITKOMST_LABEL[r.uitkomst]}${r.reden ? ` (${KENMERK_LABEL[r.reden]})` : ''}${r.terugbellen ? ` · terugbellen ${korteDag(r.terugbellen.dag)}${r.terugbellen.uur ? ` ${r.terugbellen.uur}` : ''}` : ''}${r.bezoek ? ` · bezoek ${korteDag(r.bezoek.dag)}${r.bezoek.uur ? ` ${r.bezoek.uur}` : ''}` : ''}${r.gesimuleerd ? ' (demo: gesimuleerd)' : ''}`;
  const sluitAlles = r.uitkomst === 'gepauzeerd' || r.uitkomst === 'niet_meer_contacteren';

  const kw = staat.kwalificaties.get(r.contactId);
  const andereActief = staat.zoekopdrachten.filter((z) => z.contactId === r.contactId && z.status === 'actief' && z.id !== r.zoekopdrachtId);
  const poolSluit = r.uitkomst === 'gekocht' && andereActief.length === 0;

  // Acties bijwerken (inclusief, bij pauze/verbod/aankoop, alle andere open acties van dit contact).
  const teSluiten = sluitAlles || poolSluit ? staat.acties.filter((a) => a.contactId === r.contactId && isOpen(a) && !r.acties.some((x) => x.id === a.id)) : [];
  const pogingen = (a: Contactactie) => a.historiek.filter((h) => h.tekst.startsWith(UITKOMST_LABEL.geen_antwoord)).length;
  for (const a of [...r.acties, ...teSluiten]) {
    const bestaand = staat.acties.find((x) => x.id === a.id);
    const basis = bestaand ?? a;
    let voortgang: Voortgang = basis.voortgang;
    let interesse = basis.interesse;
    let volgendeStap = basis.volgendeStap;
    let volgendePoging = basis.volgendePoging;
    const extra: Partial<Contactactie> = {};
    if (teSluiten.includes(a)) {
      voortgang = 'afgerond';
      volgendeStap = null;
    } else {
      switch (r.uitkomst) {
        case 'interesse':
          voortgang = a.soort === 'herbevestiging' ? 'afgerond' : 'interesse';
          interesse = a.soort === 'herbevestiging' ? interesse : 'ja';
          volgendeStap = a.soort === 'herbevestiging' ? null : 'Bezoek inplannen of bijkomende info bezorgen';
          volgendePoging = a.soort === 'herbevestiging' ? null : plusWerkdagen(vandaag, 2);
          break;
        case 'bezoek':
          voortgang = 'bezoek_gepland';
          interesse = 'ja';
          extra.bezoek = r.bezoek ? { ...r.bezoek, notitie: null } : null;
          volgendeStap = r.bezoek ? `Bezoek ${korteDag(r.bezoek.dag)}${r.bezoek.uur ? ` om ${r.bezoek.uur}` : ''}, daarna evaluatie` : 'Bezoek bevestigen';
          volgendePoging = r.bezoek ? plusDagen(r.bezoek.dag, 1) : null;
          break;
        case 'geen_interesse':
          voortgang = 'geen_interesse';
          interesse = 'nee';
          extra.geenInteresseReden = r.reden ?? 'algemeen';
          volgendeStap = null;
          volgendePoging = null;
          break;
        case 'profiel_aangepast':
          voortgang = 'in_behandeling';
          volgendeStap = 'Zoekprofiel bijgewerkt: match opnieuw bekijken';
          volgendePoging = plusWerkdagen(vandaag, 1);
          break;
        case 'geen_antwoord': {
          voortgang = 'geen_antwoord';
          volgendePoging = plusWerkdagen(vandaag, 1);
          const n = pogingen(basis) + 1;
          volgendeStap = n >= 3 ? `Al ${n} keer geen antwoord: probeer een bericht` : 'Opnieuw proberen';
          break;
        }
        case 'terugbellen':
          voortgang = 'terugbellen';
          extra.terugbellen = r.terugbellen ?? { dag: plusWerkdagen(vandaag, 1), uur: null };
          volgendePoging = extra.terugbellen.dag;
          volgendeStap = `Terugbellen ${korteDag(extra.terugbellen.dag)}${extra.terugbellen.uur ? ` om ${extra.terugbellen.uur}` : ''}`;
          break;
        case 'bericht_verstuurd':
          // Een verstuurd bericht is geen gesprek: geen interesse, geen bevestiging; over twee werkdagen opvolgen.
          voortgang = 'in_behandeling';
          volgendePoging = plusWerkdagen(vandaag, 2);
          volgendeStap = 'Reactie op het bericht opvolgen';
          break;
        case 'gekocht':
        case 'gepauzeerd':
        case 'niet_meer_contacteren':
          voortgang = 'afgerond';
          volgendeStap = null;
          volgendePoging = null;
          break;
      }
    }
    const nieuw: Contactactie = {
      ...basis,
      ...extra,
      voortgang,
      interesse,
      volgendeStap,
      volgendePoging,
      claim: null,
      // Een nieuwe uitkomst vervangt een eerder terugbelmoment.
      terugbellen: extra.terugbellen ?? null,
      laatsteContactOp: r.uitkomst === 'geen_antwoord' || r.uitkomst === 'bericht_verstuurd' ? basis.laatsteContactOp : op,
      historiek: [...basis.historiek, { op, door: r.door, tekst: teSluiten.includes(a) ? `Afgesloten: ${UITKOMST_LABEL[r.uitkomst].toLowerCase()}` : tekst }],
    };
    wijzigingen.push(bestaand ? wijziging(staat, 'actie', a.id, nieuw) : { soort: 'actie', id: a.id, data: nieuw, verwachteVersie: null });
  }

  // Afwijzing per pand (komt pas terug bij een relevante verandering).
  if (r.uitkomst === 'geen_interesse') {
    for (const a of r.acties.filter((x) => x.pandId)) {
      wijzigingen.push({
        soort: 'afwijzing',
        id: `af:${a.id}:${contactmoment.id}`,
        data: { id: `af:${a.id}:${contactmoment.id}`, contactId: r.contactId, pandId: a.pandId!, reden: r.reden ?? 'algemeen', prijsOpMoment: huidigeVraagprijs(staat, a.pandId!), dag: vandaag, door: r.door },
        verwachteVersie: null,
      });
    }
  }

  // Kwalificatie: enkel inhoudelijke bevestigingen, nooit een technische wijzigingsdatum.
  if (kw) {
    let nieuw: Kwalificatie | null = null;
    if (BEVESTIGT_ZOEKEN.includes(r.uitkomst)) nieuw = { ...kw, laatsteBevestiging: { op: vandaag, door: r.door, bron: `Gesprek ${vandaag}${r.gesimuleerd ? ' (demo)' : ''}` } };
    if (r.uitkomst === 'gepauzeerd') nieuw = { ...kw, poolStatus: 'gepauzeerd', pauze: { tot: r.pauzeTot ?? null, reden: r.notitie?.trim() || null } };
    if (poolSluit) nieuw = { ...kw, poolStatus: 'afgerond' };
    if (nieuw) wijzigingen.push(wijziging(staat, 'kwalificatie', r.contactId, nieuw));
  }

  if (!kw && r.uitkomst === 'gepauzeerd') {
    // Ook voor een contact buiten de koperspool moet de pauze blijven gelden bij een volgende campagne.
    const eigenaar = staat.kandidaten.get(r.contactId)?.eigenaarId ?? r.door;
    const nieuw = { ...nieuweKwalificatie(r.contactId, r.door, vandaag, 'zelf', eigenaar), poolStatus: 'gepauzeerd' as const, pauze: { tot: r.pauzeTot ?? null, reden: r.notitie?.trim() || null } };
    wijzigingen.push({ soort: 'kwalificatie', id: r.contactId, data: nieuw, verwachteVersie: null });
  }

  if (r.uitkomst === 'gekocht') {
    if (r.zoekopdrachtId) {
      wijzigingen.push(wijziging(staat, 'zoekopdracht_status', r.zoekopdrachtId, { zoekopdrachtId: r.zoekopdrachtId, status: 'gesloten', slotReden: 'Gekocht', door: r.door, op: vandaag }));
    }
    // Aansluiten op de opvolging na aankoop, maar één keer per contact.
    if (!staat.nazorg.has(r.contactId)) {
      wijzigingen.push({ soort: 'nazorg', id: r.contactId, data: { contactId: r.contactId, zoekopdrachtId: r.zoekopdrachtId ?? null, door: r.door, op: vandaag }, verwachteVersie: null });
    }
  }
  if (r.uitkomst === 'niet_meer_contacteren') {
    wijzigingen.push(wijziging(staat, 'contactverbod', r.contactId, { contactId: r.contactId, door: r.door, op: vandaag, reden: r.notitie?.trim() || null, ingetrokken: false }));
  }
  if (contactmoment.notitie) {
    const id = `n:${contactmoment.id}`;
    wijzigingen.push({
      soort: 'notitie',
      id,
      data: { id, contactId: r.contactId, pandId: r.acties.find((a) => a.pandId)?.pandId ?? null, dag: vandaag, tekst: contactmoment.notitie, door: r.door, bron: 'gesprek' },
      verwachteVersie: null,
    });
  }
  return { wijzigingen, contactmoment };
}

// ---------------------------------------------------------------- herbevestiging als (virtuele) actie

/** Opvolgactie voor verouderde koopbereidheid. Wordt pas bewaard als er iets mee gebeurt. */
export function herbevestigingsActie(staat: VerkoopStaat, contactId: string): Contactactie {
  const kw = staat.kwalificaties.get(contactId)!;
  const id = `hb:${contactId}:${kw.laatsteBevestiging?.op ?? 'nooit'}`;
  const bestaand = staat.acties.find((a) => a.id === id);
  if (bestaand) return bestaand;
  const op = kw.laatsteBevestiging?.op ?? kw.toegevoegd.op;
  return {
    id,
    kantoorId: staat.basis.kantoor.id,
    contactId,
    pandId: null,
    soort: 'herbevestiging',
    aanleidingen: [
      {
        campagneId: null,
        soort: 'herbevestiging',
        uitleg: kw.laatsteBevestiging
          ? `Koopbereidheid laatst bevestigd op ${kw.laatsteBevestiging.op}: opnieuw bevestigen (ritme ${staat.instellingen.bevestigingsritmeDagen} dagen).`
          : 'Nog nooit bevestigd dat de kandidaat nog zoekt.',
        op: `${op}T08:00:00.000Z`,
        door: kw.verantwoordelijkeId,
      },
    ],
    voortgang: 'nog_contacteren',
    interesse: 'onbekend',
    uitvoerderId: kw.verantwoordelijkeId,
    toegewezenDoor: kw.verantwoordelijkeId,
    verzoek: null,
    claim: null,
    terugbellen: null,
    bezoek: null,
    volgendePoging: null,
    volgendeStap: 'Bevestigen of de kandidaat nog zoekt, met budget en timing',
    geenInteresseReden: null,
    laatsteContactOp: null,
    historiek: [],
    aangemaaktOp: `${op}T08:00:00.000Z`,
    aangemaaktDoor: kw.verantwoordelijkeId,
    scoreVersie: SCORE_VERSIE,
  };
}

// ---------------------------------------------------------------- kwalificatie

export function nieuweKwalificatie(contactId: string, door: string, vandaag: DagKey, wijze: Kwalificatie['toegevoegd']['wijze'], verantwoordelijkeId: string): Kwalificatie {
  return {
    contactId,
    poolStatus: 'te_kwalificeren',
    budget: null,
    financiering: { status: 'onbekend', bron: null, op: null },
    afhankelijkVanVerkoop: { status: 'onbekend', toelichting: null },
    termijn: null,
    snelBezoeken: 'onbekend',
    interesseVoorPublicatie: 'onbekend',
    contactvoorkeur: null,
    verantwoordelijkeId,
    laatsteBevestiging: null,
    koopklaar: null,
    pauze: null,
    toegevoegd: { door, op: vandaag, wijze },
  };
}

/** Koopklaar bevestigen door een medewerker. Is meteen ook een inhoudelijke bevestiging dat de kandidaat zoekt. */
export function bevestigKoopklaar(kw: Kwalificatie, door: string, vandaag: DagKey, bron: string): Kwalificatie {
  return { ...kw, poolStatus: 'koopklaar', koopklaar: { door, op: vandaag }, laatsteBevestiging: { op: vandaag, door, bron } };
}

