// De lijst van de dag stabiel houden (PLAN.md §5.5): de volgorde wordt bij de eerste opening vastgelegd.
// Lokale resultaten werken meteen door (wie gebeld is, verdwijnt of krijgt een label), maar de lijst
// wordt niet vanzelf aangevuld of door elkaar geschud. Enkel terugbelafspraken met uur, vastgepinde
// contacten, woningen die te koop gezet werden en nieuwe leads die later op de dag binnenkomen, worden toegevoegd.
import { dagVan, type DagKey } from '../core/dates';
import type { Belpoging, Contact } from './model';
import type { Bellijst, Kandidaat } from './prioriteit';

export interface GebeldVandaag {
  contact: Contact;
  pogingen: Belpoging[]; // nieuwste eerst
}

export interface DagWeergave {
  /** Nog te bellen, in vaste volgorde. */
  actief: Kandidaat[];
  /** Aan de beurt, maar niet op de vastgelegde lijst. */
  nietOpLijst: Kandidaat[];
  gebeld: GebeldVandaag[];
  /** Contact-ID's om vast te leggen als er nog geen dagplan is. */
  nieuwPlan: string[] | null;
}

const VOORRANG_LATER = new Set(['A', 'S', 'pin', 'B']);

export function dagWeergave(lijst: Bellijst, plan: { contactIds: string[] } | null, belpogingen: Belpoging[], contacten: Contact[], vandaag: DagKey): DagWeergave {
  const nieuwPlan = plan ? null : lijst.vandaag.map((k) => k.contact.id);
  const vastgelegd = plan?.contactIds ?? nieuwPlan!;
  const positie = new Map(vastgelegd.map((id, i) => [id, i]));

  const alle = [...lijst.vandaag, ...lijst.nietOpLijst];
  const actief: Kandidaat[] = [];
  const nietOpLijst: Kandidaat[] = [];
  for (const k of alle) {
    if (positie.has(k.contact.id) || (VOORRANG_LATER.has(k.groep) && lijst.vandaag.includes(k))) actief.push(k);
    else nietOpLijst.push(k);
  }

  // Volgorde: groep A en vastgepind bovenaan (zoals berekend), daarna de vastgelegde volgorde, daarna later toegevoegde.
  const top = actief.filter((k) => k.groep === 'A' || k.groep === 'S' || k.groep === 'pin');
  const rest = actief
    .filter((k) => k.groep !== 'A' && k.groep !== 'S' && k.groep !== 'pin')
    .sort((a, b) => (positie.get(a.contact.id) ?? Number.MAX_SAFE_INTEGER) - (positie.get(b.contact.id) ?? Number.MAX_SAFE_INTEGER));

  const perContact = new Map<string, Belpoging[]>();
  for (const p of belpogingen) {
    if (p.ongedaanOp || dagVan(p.tijdstip) !== vandaag) continue;
    perContact.set(p.contactId, [...(perContact.get(p.contactId) ?? []), p]);
  }
  const contactOpId = new Map(contacten.map((c) => [c.id, c]));
  const gebeld = [...perContact.entries()]
    .map(([id, pogingen]) => ({ contact: contactOpId.get(id)!, pogingen: pogingen.sort((a, b) => b.tijdstip.getTime() - a.tijdstip.getTime()) }))
    .filter((g) => g.contact)
    .sort((a, b) => b.pogingen[0]!.tijdstip.getTime() - a.pogingen[0]!.tijdstip.getTime());

  return { actief: [...top, ...rest], nietOpLijst, gebeld, nieuwPlan };
}
