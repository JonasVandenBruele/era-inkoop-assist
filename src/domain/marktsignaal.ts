// Te koop gezet (6/10/2026): staat de woning van een prospect te koop — zelf of via een andere makelaar — dan krijgt
// hij de dag erna een kort bericht van Jonas met veel succes. Urgentie: heel hoog (Jonas, 6/10/2026).
// Pure functies; de signalen zelf komen van de Mac (scripts/marktsignalen.ts).
import { dagVan, korteDag, type DagKey } from '../core/dates';
import type { Belpoging, Bronactiviteit, Contact, Marktsignaal } from './model';
import { plusWerkdagen } from './werkdagen';

/** Hoe lang een signaal na de ontdekking op de lijst blijft als er nog niets gebeurde. */
export const SIGNAAL_DAGEN = 21;

const DAG_MS = 86_400_000;

/** De dag waarop het bericht vertrekt: de (werk)dag na de ontdekking. */
export function berichtDag(s: Pick<Marktsignaal, 'eerstGezienOp'>): DagKey {
  return plusWerkdagen(dagVan(s.eerstGezienOp), 1);
}

/** Is er sinds de ontdekking al contact geweest (gesprek, bericht of geregistreerde poging)? */
export function alOpgevolgd(s: Marktsignaal, belpogingen: Belpoging[], activiteiten: Bronactiviteit[]): boolean {
  const na = s.eerstGezienOp.getTime();
  return (
    belpogingen.some((p) => p.contactId === s.contactId && !p.ongedaanOp && p.tijdstip.getTime() > na) ||
    activiteiten.some((a) => a.contactId === s.contactId && a.type !== 'taak' && a.gebeurdOp && a.gebeurdOp.getTime() > na)
  );
}

/**
 * Het signaal dat vandaag om actie vraagt: te koop of onder optie, nog niet afgehandeld of opgevolgd, ontdekt in de
 * laatste drie weken, dezelfde woning, en de berichtdag is bereikt. Nieuwste eerst.
 */
export function signaalVoorVandaag(
  contactId: string,
  signalen: Marktsignaal[],
  belpogingen: Belpoging[],
  activiteiten: Bronactiviteit[],
  vandaag: DagKey,
): Marktsignaal | null {
  const vandaagMs = new Date(`${vandaag}T12:00:00Z`).getTime();
  const kandidaten = signalen.filter(
    (s) =>
      s.contactId === contactId &&
      // Enkel dezelfde woning; een andere unit in hetzelfde gebouw is info, geen reden voor een bericht.
      s.overeenkomst === 'adres' &&
      !s.afgehandeldOp &&
      (s.status === 'te_koop' || s.status === 'onder_optie') &&
      berichtDag(s) <= vandaag &&
      vandaagMs - s.eerstGezienOp.getTime() <= SIGNAAL_DAGEN * DAG_MS &&
      !alOpgevolgd(s, belpogingen, activiteiten),
  );
  kandidaten.sort((a, b) => (a.overeenkomst === b.overeenkomst ? b.eerstGezienOp.getTime() - a.eerstGezienOp.getTime() : a.overeenkomst === 'adres' ? -1 : 1));
  return kandidaten[0] ?? null;
}

/** Laatste bekende signaal per contact (ook afgehandeld), voor de contactpagina. */
export function signalenVan(contactId: string, signalen: Marktsignaal[]): Marktsignaal[] {
  return signalen.filter((s) => s.contactId === contactId).sort((a, b) => b.laatstGezienOp.getTime() - a.laatstGezienOp.getTime());
}

const euro = (n: number) => `€ ${n.toLocaleString('nl-BE', { maximumFractionDigits: 0 })}`;

/** "Staat zelf te koop op Immoweb sinds 3 okt., vraagprijs € 395.000". */
export function signaalTekst(s: Marktsignaal): string {
  const via = s.verkoper === 'particulier' ? 'zelf te koop' : s.makelaar ? `te koop via ${s.makelaar}` : s.verkoper === 'notaris' ? 'te koop via een notaris' : 'te koop via een andere makelaar';
  const waar = s.bron === 'immoweb' ? ' op Immoweb' : '';
  const sinds = s.onlineSinds ? ` sinds ${korteDag(s.onlineSinds)}` : '';
  const optie = s.status === 'onder_optie' ? ' (onder optie)' : '';
  const prijs = s.vraagprijs ? `, vraagprijs ${euro(s.vraagprijs)}` : '';
  const gebouw = s.overeenkomst === 'gebouw' ? ' — zelfde gebouw, andere bus: controleer of het om zijn unit gaat' : '';
  return `Staat ${via}${waar}${sinds}${optie}${prijs}${gebouw}`;
}

/**
 * Standaardbericht in Jonas' stijl (kort, warm, geen verkooppraat), voor als er geen hook van Claude is.
 * Je-vorm tenzij de aanspreekvorm "u" is.
 */
export function succesbericht(c: Pick<Contact, 'voornaam' | 'achternaam' | 'aanhef' | 'aanspreekvormBron'>, s: Pick<Marktsignaal, 'verkoper'>): string {
  const u = c.aanspreekvormBron === 'u';
  const naam = u ? [c.aanhef ?? '', c.achternaam].join(' ').trim() : (c.voornaam ?? c.achternaam);
  const jullie = u ? 'uw' : 'jullie';
  const je = u ? 'u' : 'je';
  const hulp = s.verkoper === 'particulier' ? ` Mocht ${je} onderweg ergens hulp bij kunnen gebruiken, laat ${u ? 'het me gerust weten' : 'gerust iets weten'}.` : '';
  return `${u ? 'Goeiedag' : 'Dag'} ${naam}, ik zag dat ${jullie} woning te koop staat. Ik wens ${je} alvast heel veel succes met de verkoop!${hulp} Groetjes, Jonas van ERA`;
}
