// Acceptatietests fase 3b: altijd aanwezig, nooit opdringerig (PLAN.md §7b).
import { describe, expect, it } from 'vitest';
import { genereerTestdata, RANDGEVAL } from '../../fixtures/testdata';
import { STANDAARD_INSTELLINGEN } from '../core/settings/schema';
import { berekenBellijst, type BellijstInvoer, type Kandidaat } from './prioriteit';
import { verwerkBelresultaat } from './belresultaat';
import { berichtNuGepast } from './kanaaladvies';
import { haakZin, isGevoelig } from './haken';
import { berichtTekst } from './berichten';
import type { Belpoging } from './model';

const VANDAAG = '2026-10-13';
const data = genereerTestdata({ testdatum: `${VANDAAG}T07:30` });
const c = (ext: string) => data.contacten.find((x) => x.externId === ext)!;
let n = 0;
const maakId = () => `00000000-0000-4000-b000-${String(++n).padStart(12, '0')}`;

const invoer = (extra: Partial<BellijstInvoer> = {}): BellijstInvoer => ({
  ...data,
  instellingen: STANDAARD_INSTELLINGEN,
  vandaag: VANDAAG,
  uur: '10:00',
  ...extra,
});
const alle = (l: ReturnType<typeof berekenBellijst>): Kandidaat[] => [...l.vandaag, ...l.nietOpLijst, ...l.handmatigBeoordelen, ...l.nummerZoeken];
const vind = (ext: string, extra: Partial<BellijstInvoer> = {}) => alle(berekenBellijst(invoer(extra))).find((k) => k.contact.externId === ext);

describe('kanaaladvies', () => {
  it('na 2× geen antwoord: een berichtje in plaats van een 3e belpoging', () => {
    const k = vind(RANDGEVAL.tweeKeerGeenAntwoord)!;
    expect(k.pogingenZonderAntwoord).toBe(2);
    expect(k.advies.kanaal).toBe('bericht');
    expect(k.advies.reden).toContain('2× geen antwoord');
  });

  it('standaard wordt er gebeld', () => {
    expect(vind(RANDGEVAL.warmOverRitme)!.advies.kanaal).toBe('bellen');
  });

  it('een contact met voorkeur "mail" krijgt nooit bellen als advies, ook niet na onbeantwoorde pogingen', () => {
    const dubois = c(RANDGEVAL.voorkeurMail);
    const p = (dag: string): Belpoging => ({
      id: dag, contactId: dubois.id, tijdstip: new Date(`${dag}T10:00:00+02:00`), uitkomst: 'geen_antwoord', kanaal: 'telefoon',
      isInhoudelijk: false, notitie: null, volgendeStap: null, ongedaanOp: null, isTestdata: true,
    });
    expect(vind(RANDGEVAL.voorkeurMail)!.advies.kanaal).toBe('mail');
    expect(vind(RANDGEVAL.voorkeurMail, { belpogingen: [...data.belpogingen, p('2026-10-06'), p('2026-10-08')] })!.advies.kanaal).toBe('mail');
  });

  it('voorkeur "bericht" wordt gerespecteerd', () => {
    expect(vind(RANDGEVAL.voorkeurBericht)!.advies.kanaal).toBe('bericht');
  });

  it('beluren uit de voorkeur verschijnen als opmerking', () => {
    const lien = vind(RANDGEVAL.erfgenaamB);
    if (lien) expect(lien.advies.opmerking).toContain('niet vóór 17:00');
  });

  it('geen nummer maar wel e-mail → mail', () => {
    expect(vind(RANDGEVAL.zonderTelefoon)!.advies.kanaal).toBe('mail');
  });

  it('rustige uren: geen berichten vóór 9u, na 20u of op zondag', () => {
    const inst = STANDAARD_INSTELLINGEN;
    expect(berichtNuGepast(inst, '2026-10-13', '08:30')).toBe(false);
    expect(berichtNuGepast(inst, '2026-10-13', '09:00')).toBe(true);
    expect(berichtNuGepast(inst, '2026-10-13', '20:00')).toBe(false);
    expect(berichtNuGepast(inst, '2026-10-18', '11:00')).toBe(false); // zondag
    const vroeg = vind(RANDGEVAL.tweeKeerGeenAntwoord, { uur: '07:45' })!;
    expect(vroeg.advies.opmerking).toContain('tussen 09:00 en 20:00');
  });
});

describe('berichten tellen mee, maar niet als gesprek', () => {
  const koen = c(RANDGEVAL.tweeKeerGeenAntwoord);
  const bericht = verwerkBelresultaat({ contact: koen, uitkomst: 'bericht_verstuurd', kanaal: 'sms', tijdstip: new Date('2026-10-13T10:00:00+02:00'), maakId });

  it('een verstuurd bericht is geen inhoudelijk contact', () => {
    expect(bericht.belpoging.isInhoudelijk).toBe(false);
    expect(bericht.belpoging.kanaal).toBe('sms');
  });

  it('na een bericht wacht de app 3 werkdagen', () => {
    const plaats = (vandaag: string) => {
      const l = berekenBellijst(invoer({ belpogingen: [...data.belpogingen, bericht.belpoging], vandaag }));
      return alle(l).some((k) => k.contact.id === koen.id) ? 'zichtbaar' : l.uitgesloten.find((u) => u.contact.id === koen.id)?.reden;
    };
    expect(plaats('2026-10-15')).toBe('wacht_na_geen_antwoord');
    // di + 3 werkdagen = vr 16/10 (dan heeft Koen een afspraak in de testdata); ma 19/10 weer zichtbaar.
    expect(plaats('2026-10-19')).toBe('zichtbaar');
  });

  it('na het bericht is het advies weer bellen (geen tweede bericht na elkaar)', () => {
    const k = alle(berekenBellijst(invoer({ belpogingen: [...data.belpogingen, bericht.belpoging], vandaag: '2026-10-19' }))).find((x) => x.contact.id === koen.id)!;
    expect(k.advies.kanaal).toBe('bellen');
  });

  it('een reactie telt wel als inhoudelijk contact en zet de teller terug', () => {
    const reactie = verwerkBelresultaat({ contact: koen, uitkomst: 'reactie', kanaal: 'sms', tijdstip: new Date('2026-10-13T14:00:00+02:00'), maakId });
    expect(reactie.belpoging.isInhoudelijk).toBe(true);
    const l = berekenBellijst(invoer({ belpogingen: [...data.belpogingen, bericht.belpoging, reactie.belpoging], vandaag: '2026-10-14' }));
    expect(l.uitgesloten.find((u) => u.contact.id === koen.id)?.reden).toBe('nog_niet_aan_de_beurt');
  });

  it('een bericht zonder kanaal wordt geweigerd', () => {
    expect(() => verwerkBelresultaat({ contact: koen, uitkomst: 'bericht_verstuurd', tijdstip: new Date(), maakId })).toThrow('kanaal');
  });
});

describe('waardehaken', () => {
  it('een geldige buurthaak (via het pand) geeft een scorebonus en een zin', () => {
    const k = vind(RANDGEVAL.tweeKeerGeenAntwoord)!; // Koen: ouderlijke woning Lindenlaan, Melle
    const buurt = k.haken.find((h) => h.soort === 'buurt');
    expect(buurt?.onderwerp).toContain('Lindenlaan');
    expect(k.onderdelen.some((o) => o.label.startsWith('Hook') && o.punten === 20)).toBe(true);
    expect(haakZin(buurt!, false)).toBe('Ik heb nieuws uit uw buurt: woning in de Lindenlaan verkocht na 3 weken.');
  });

  it('afgeleide dossierhaak (huurcontract loopt af) haalt een contact naar voren vanaf de helft van zijn ritme', () => {
    // Dhr. Verstraete: lauw, 33 dagen geleden (ritme 42 → nog niet aan de beurt zonder haak).
    const k = vind(RANDGEVAL.huurcontractLooptAf)!;
    expect(k.haken.some((h) => h.soort === 'dossier' && h.onderwerp.includes('Huurcontract'))).toBe(true);
    expect(k.reden).toContain('Hook: Huurcontract');
    const zonderPanden = berekenBellijst(invoer({ panden: [], contactPanden: [] }));
    expect(zonderPanden.uitgesloten.find((u) => u.contact.externId === RANDGEVAL.huurcontractLooptAf)?.reden).toBe('nog_niet_aan_de_beurt');
  });

  it('een haak haalt niemand naar voren vlak na een gesprek (vóór de helft van het ritme)', () => {
    const l = berekenBellijst(invoer({ vandaag: '2026-10-13' }));
    // Mevr. Willems: koud, 60 dagen geleden (ritme 180 → 0,33) heeft geen specifieke hook en blijft weg.
    expect(l.uitgesloten.find((u) => u.contact.externId === RANDGEVAL.koudNogNietAanDeBeurt)?.reden).toBe('nog_niet_aan_de_beurt');
  });

  it('een verlopen haak telt niet', () => {
    const k = vind(RANDGEVAL.warmOverRitme)!;
    expect(k.haken.some((h) => h.onderwerp.includes('Opendeurdag'))).toBe(false);
    expect(k.onderdelen.some((o) => o.label.startsWith('Hook'))).toBe(false);
  });

  it('een gevoelige haak wordt nooit gebruikt', () => {
    const k = vind(RANDGEVAL.terugbellenVandaagMetUur)!;
    expect(k.haken.some((h) => h.onderwerp.includes('overleden'))).toBe(false);
    expect(isGevoelig('Zoon is ziek')).toBe(true);
    expect(isGevoelig('Woning verkocht in de straat')).toBe(false);
  });

  it('algemene haken gelden voor iedereen, maar geven geen bonus', () => {
    const k = vind(RANDGEVAL.lauwOverRitme)!;
    expect(k.haken.some((h) => h.soort === 'algemeen')).toBe(true);
    expect(k.onderdelen.some((o) => o.label.startsWith('Hook'))).toBe(false);
  });

  it('persoonlijke haken zijn enkel een tip, nooit tekst', () => {
    const k = vind(RANDGEVAL.persoonlijkeHaak)!;
    const p = k.haken.find((h) => h.soort === 'persoonlijk')!;
    expect(p.onderwerp).toContain('Verjaardag');
    expect(haakZin(p, false)).toBeNull();
  });
});

describe('berichtteksten', () => {
  const ctx = { voornaamGebruiker: 'Jonas', organisatie: 'ERA' };

  it('sms na onbeantwoorde oproepen, met buurthaak, in de juiste aanspreekvorm', () => {
    const k = vind(RANDGEVAL.tweeKeerGeenAntwoord)!;
    const t = berichtTekst({ kandidaat: k, kanaal: 'sms', ...ctx });
    expect(t.tekst).toContain('meneer Van den Broeck');
    expect(t.tekst).toContain('Ik heb nieuws uit uw buurt');
    expect(t.tekst).toContain('Jonas');
    expect(t.tekst.length).toBeLessThan(400);
  });

  it('mail heeft een onderwerp en gebruikt nooit een persoonlijke of gevoelige haak', () => {
    const k = vind(RANDGEVAL.persoonlijkeHaak)!;
    const t = berichtTekst({ kandidaat: k, kanaal: 'mail', ...ctx });
    expect(t.onderwerp).toBeTruthy();
    expect(t.tekst).not.toMatch(/verjaardag/i);
    const peeters = vind(RANDGEVAL.terugbellenVandaagMetUur)!;
    expect(berichtTekst({ kandidaat: peeters, kanaal: 'sms', ...ctx }).tekst).not.toMatch(/overleden/i);
  });

  it('zonder haak een korte, neutrale tekst — geen "even checken"', () => {
    const k = vind(RANDGEVAL.warmOverRitme)!;
    const t = berichtTekst({ kandidaat: k, kanaal: 'whatsapp', ...ctx });
    expect(t.tekst).not.toMatch(/even (in)?checken/i);
    expect(t.tekst).toContain('Pieter'); // aanspreekvorm je
  });
});

describe('mail-app', () => {
  it('opent standaard Outlook, of de standaard-mailapp als je dat kiest', async () => {
    const { berichtLink } = await import('./berichten');
    const b = { onderwerp: 'Uw woning', tekst: 'Beste' };
    expect(berichtLink('mail', 'a@b.test', b)).toBe('ms-outlook://compose?to=a%40b.test&subject=Uw%20woning&body=Beste');
    expect(berichtLink('mail', 'a@b.test', b, 'standaard')).toBe('mailto:a@b.test?subject=Uw%20woning&body=Beste');
  });
});
