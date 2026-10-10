// Vandaag bellen: de persoonlijke lijst van een medewerker (opdracht §14).
// Elke kaart toont dezelfde contactacties als bij het pand (één gedeeld record). Meerdere panden voor dezelfde kandidaat
// worden gebundeld tot één gesprek. Capaciteit is een dagdoel: dringende acties en vervallen afspraken blijven zichtbaar.
import { dagenTussen, korteDag, relatief } from '../../core/dates';
import { herbevestigingsActie, claimActief } from './acties';
import { actualiteit, berekenIntentie, koopbereidheidTekst, type Intentie } from './intentie';
import { BESCHIKBARE_FASEN, bouwKandidatenlijst, contactRegel, isOpen, type KandidaatRij, type Kandidatenlijst } from './kandidatenlijst';
import { berekenMatch, besteMatch, type MatchResultaat } from './matching';
import { naamVan, type Campagne, type Contactactie } from './model';
import { maakZinnen } from './openingszin';
import { euro } from './prijs';
import { actieveZoekopdrachten, contactSleutel, laatsteContact, vrijgaveVan, type VerkoopStaat } from './staat';

export type BelLabel = 'vandaag_eerst' | 'vandaag' | 'deze_week' | 'eerst_controleren';

export const BEL_LABEL: Record<BelLabel, string> = {
  vandaag_eerst: 'Vandaag eerst',
  vandaag: 'Vandaag',
  deze_week: 'Deze week',
  eerst_controleren: 'Eerst controleren',
};

export interface BelOnderdeel {
  actie: Contactactie;
  /** true = nog niet bewaard (bv. herbevestiging); wordt aangemaakt bij de eerste registratie. */
  virtueel: boolean;
  campagne: Campagne | null;
  rij: KandidaatRij | null;
  match: MatchResultaat | null;
  waarom: string[];
  openingszin: string | null;
  bericht: string | null;
  beperking: string | null;
  magContacteren: boolean;
}

export interface BelKaart {
  sleutel: string;
  contactId: string;
  naam: string;
  telefoon: string | null;
  huishouden: string | null;
  label: BelLabel;
  /** Concrete reden voor "Vandaag eerst" of "Eerst controleren". */
  labelReden: string | null;
  onderdelen: BelOnderdeel[];
  prioriteit: number;
  prioriteitRedenen: string[];
  intentie: Intentie;
  koopbereidheid: { label: string; zorg: string | null };
  laatsteContact: string;
  onzekerheid: string | null;
  volgendeStap: string;
  verzoek: string | null;
  claimDoorAnder: { door: string; tot: string } | null;
}

export interface Bellijst {
  kaarten: BelKaart[];
  /** Acties die later aan de beurt zijn (bv. geen antwoord: morgen opnieuw). */
  later: number;
  capaciteit: number;
}

export function bouwBellijst(staat: VerkoopStaat, medewerkerId: string): Bellijst {
  const vandaag = staat.vandaag;
  const lijsten = new Map<string, Kandidatenlijst>();
  const lijstVoor = (pandId: string, campagne: Campagne | null) => {
    const k = `${pandId}|${campagne?.id ?? ''}`;
    if (!lijsten.has(k)) lijsten.set(k, bouwKandidatenlijst(staat, pandId, campagne));
    return lijsten.get(k)!;
  };

  // 1. Open acties van deze medewerker + verouderde koopbereidheid van eigen kandidaten (virtuele opvolgactie).
  const items: { actie: Contactactie; virtueel: boolean }[] = staat.acties
    .filter((a) => a.uitvoerderId === medewerkerId && isOpen(a))
    .map((actie) => ({ actie, virtueel: false }));
  for (const kw of staat.kwalificaties.values()) {
    if (kw.verantwoordelijkeId !== medewerkerId || !['actief', 'koopklaar', 'te_kwalificeren'].includes(kw.poolStatus)) continue;
    if (!actualiteit(kw, vandaag, staat.instellingen.bevestigingsritmeDagen).verouderd) continue;
    const hb = herbevestigingsActie(staat, kw.contactId);
    if (!isOpen(hb) || items.some((i) => i.actie.id === hb.id)) continue;
    if (hb.uitvoerderId !== medewerkerId && !staat.acties.some((a) => a.id === hb.id)) continue;
    items.push({ actie: hb, virtueel: !staat.acties.some((a) => a.id === hb.id) });
  }

  // 2. Regels en timing
  let later = 0;
  const perSleutel = new Map<string, { actie: Contactactie; virtueel: boolean; nogNiet: boolean }[]>();
  for (const it of items) {
    const a = it.actie;
    if (contactRegel(staat, a.contactId)) continue;
    if (a.pandId) {
      const p = staat.panden.get(a.pandId);
      if (!p || !BESCHIKBARE_FASEN.includes(p.fase)) continue;
    }
    let nogNiet = false;
    if (a.voortgang === 'terugbellen' && a.terugbellen && a.terugbellen.dag > vandaag) {
      if (dagenTussen(vandaag, a.terugbellen.dag) > 7) {
        later++;
        continue;
      }
      nogNiet = true;
    } else if (a.volgendePoging && a.volgendePoging > vandaag) {
      later++;
      continue;
    }
    // Herbevestiging overbodig als er al een pandgesprek gepland staat: dat gesprek bevestigt het mee.
    const s = contactSleutel(staat, a.contactId);
    perSleutel.set(s, [...(perSleutel.get(s) ?? []), { ...it, nogNiet }]);
  }

  // 3. Kaarten
  const kaarten: BelKaart[] = [];
  for (const [sleutel, groep] of perSleutel) {
    const metPand = groep.filter((g) => g.actie.pandId);
    const lijst = metPand.length ? groep.filter((g) => g.actie.soort !== 'herbevestiging' || !g.virtueel) : groep;
    const contactId = lijst[0]!.actie.contactId;
    const kand = staat.kandidaten.get(contactId);
    if (!kand) continue;
    const onderdelen: BelOnderdeel[] = lijst.map(({ actie, virtueel }) => {
      const campagne = laatsteCampagne(staat, actie);
      const rij = actie.pandId ? (lijstVoor(actie.pandId, campagne).rijen.find((r) => r.sleutel === sleutel) ?? null) : null;
      const match = rij?.match ?? (actie.pandId ? besteMatch(actieveZoekopdrachten(staat, actie.contactId).map((z) => berekenMatch(staat, z, actie.pandId!))) : null);
      const zinnen = maakZinnen(staat, actie, rij, campagne);
      const vrij = actie.pandId ? vrijgaveVan(staat, actie.pandId) : null;
      return {
        actie,
        virtueel,
        campagne,
        rij,
        match,
        waarom: rij?.redenen.slice(0, 3) ?? actie.aanleidingen.map((x) => x.uitleg).slice(-2),
        ...zinnen,
        magContacteren: actie.pandId ? Boolean(vrij?.contacteren) && kand.contact.telefoons.length > 0 : kand.contact.telefoons.length > 0,
      };
    });
    onderdelen.sort((a, b) => (b.rij?.prioriteit.score ?? 0) - (a.rij?.prioriteit.score ?? 0));

    const kw = staat.kwalificaties.get(contactId);
    const act = actualiteit(kw, vandaag, staat.instellingen.bevestigingsritmeDagen);
    const intentie = berekenIntentie(staat, contactId);
    const kb = koopbereidheidTekst(staat, contactId);
    const lc = laatsteContact(staat, contactId);
    const claimAnder = onderdelen.map((o) => o.actie).find((a) => a.claim && a.claim.door !== medewerkerId && claimActief(a, staat.nu))?.claim ?? null;
    const tegenspraak = staat.tegenstrijdigheden.find((t) => t.contactId === contactId);

    // Label met concrete reden
    let label: BelLabel | null = null;
    let labelReden: string | null = null;
    const terug = lijst.find((g) => g.actie.voortgang === 'terugbellen' && g.actie.terugbellen && g.actie.terugbellen.dag <= vandaag)?.actie.terugbellen;
    const prijsUrgent = onderdelen.find(
      (o) =>
        o.campagne?.soort === 'prijsdaling' &&
        dagenTussen(o.campagne.aangemaaktOp.slice(0, 10), vandaag) <= 3 &&
        o.rij?.categorieen.some((c) => c === 'binnen_budget' || c === 'prijsbezwaar' || c === 'eerder_bod' || c === 'prijs_volgen'),
    );
    const publicatie = onderdelen.find((o) => {
      const p = o.actie.pandId ? staat.panden.get(o.actie.pandId) : null;
      return p?.publicatieGepland && p.fase !== 'gepubliceerd' && dagenTussen(vandaag, p.publicatieGepland) >= 0 && dagenTussen(vandaag, p.publicatieGepland) <= 3;
    });
    const nietMogelijk = onderdelen.every((o) => !o.magContacteren);
    if (claimAnder) {
      label = 'eerst_controleren';
      labelReden = `${staat.medewerkers.get(claimAnder.door)?.voornaam ?? 'Een collega'} belt deze kandidaat nu`;
    } else if (nietMogelijk) {
      label = 'eerst_controleren';
      labelReden = onderdelen[0]?.beperking ?? (kand.contact.telefoons.length ? 'Nog geen vrijgave om te contacteren' : 'Geen telefoonnummer gekend');
    } else if (onderdelen.some((o) => o.actie.pandId && !o.rij && o.actie.voortgang === 'nog_contacteren')) {
      label = 'eerst_controleren';
      labelReden = 'Past niet meer in de huidige kandidatenlijst van het pand (profiel of pand gewijzigd)';
    } else if (tegenspraak) {
      label = 'eerst_controleren';
      labelReden = tegenspraak.tekst;
    } else if (terug) {
      label = 'vandaag_eerst';
      labelReden = `Afgesproken terugbelmoment: ${terug.dag === vandaag ? 'vandaag' : `${korteDag(terug.dag)} (vervallen)`}${terug.uur ? ` om ${terug.uur}` : ''}`;
    } else if (prijsUrgent) {
      label = 'vandaag_eerst';
      const p = prijsUrgent.campagne!.prijs;
      labelReden = `Prijsdaling${p ? ` van ${euro(p.van)} naar ${euro(p.naar)}` : ''}: ${prijsUrgent.waarom[0] ?? ''}`;
    } else if (publicatie) {
      const p = staat.panden.get(publicatie.actie.pandId!)!;
      label = 'vandaag_eerst';
      labelReden = `Publicatie gepland op ${korteDag(p.publicatieGepland!)}: vóór publicatie contacteren`;
    } else if (groep.every((g) => g.nogNiet)) {
      label = 'deze_week';
      const t = groep[0]!.actie.terugbellen!;
      labelReden = `Terugbellen ${korteDag(t.dag)}${t.uur ? ` om ${t.uur}` : ''}`;
    }

    const prio = Math.max(
      ...onderdelen.map((o) => o.rij?.prioriteit.score ?? (o.actie.soort === 'herbevestiging' ? 40 : (o.match?.score ?? 30) * 0.5)),
    );
    const prioRedenen = onderdelen[0]?.rij?.prioriteit.redenen ?? [act.verouderd ? act.label : 'Opvolging'];
    const onzekerheid =
      (act.verouderd && kw && kw.poolStatus !== 'te_kwalificeren' ? act.label : null) ??
      kb.zorg ??
      onderdelen.find((o) => o.match?.onbekend.length)?.match?.onbekend[0] ??
      (intentie.score === null ? 'Aankoopintentie onbekend' : null);
    const eerste = onderdelen[0]!;
    kaarten.push({
      sleutel,
      contactId,
      naam: naamVan(kand.contact),
      telefoon: kand.contact.telefoons[0]?.nummer ?? null,
      huishouden: kand.huishoudenId ? (staat.huishoudens.get(kand.huishoudenId)?.naam ?? null) : null,
      label: label ?? 'vandaag',
      labelReden,
      onderdelen,
      prioriteit: Math.round(prio),
      prioriteitRedenen: prioRedenen,
      intentie,
      koopbereidheid: kb,
      laatsteContact: lc ? `${lc.wat} ${relatief(lc.dag, vandaag)}` : 'nog geen betekenisvol contact',
      onzekerheid,
      volgendeStap: eerste.actie.volgendeStap ?? eerste.rij?.aanbevolenStap ?? 'Interesse peilen',
      verzoek: onderdelen.map((o) => o.actie.verzoek).find(Boolean) ?? null,
      claimDoorAnder: claimAnder,
    });
  }

  // 4. Capaciteit: "Vandaag eerst" altijd; daarna de hoogste prioriteit tot het dagdoel; de rest "Deze week".
  const cap = staat.instellingen.capaciteit;
  const vast = kaarten.filter((k) => k.label === 'vandaag_eerst').length;
  let vrij = Math.max(0, cap - vast);
  for (const k of [...kaarten].filter((k) => k.label === 'vandaag').sort((a, b) => b.prioriteit - a.prioriteit)) {
    if (vrij > 0) vrij--;
    else k.label = 'deze_week';
  }
  const volgorde: BelLabel[] = ['vandaag_eerst', 'vandaag', 'eerst_controleren', 'deze_week'];
  kaarten.sort((a, b) => volgorde.indexOf(a.label) - volgorde.indexOf(b.label) || b.prioriteit - a.prioriteit);
  return { kaarten, later, capaciteit: cap };
}

/** De campagne van de meest recente aanleiding van een actie. */
export function laatsteCampagne(staat: VerkoopStaat, actie: Contactactie): Campagne | null {
  for (const a of [...actie.aanleidingen].reverse()) {
    const c = a.campagneId ? staat.campagnes.find((x) => x.id === a.campagneId) : null;
    if (c) return c;
  }
  return null;
}
