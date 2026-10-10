// Gegevensbron van de verkoopmodule. De schermen en de logica kennen enkel VerkoopBasis; welke bron die levert, is
// vervangbaar zonder de module opnieuw te bouwen.
//  - demoBron: fictieve dataset (fixtures/verkoop.ts) — NU ACTIEF, enkel in de demo-build.
//  - ERAForce-mirror: nog NIET aangesloten. Pas na expliciet akkoord van Jonas (zie VERKOOP.md §7 voor de vertaling
//    van ERA_Zoekopdracht__c, ERA_Object__c, Bezoekmoment__c en Onderhandeling__c naar dit model).
import { genereerVerkoopDemo } from '../../../fixtures/verkoop';
import { dagVan } from '../../core/dates';
import type { VerkoopBasis } from '../../domain/verkoop/model';

export interface VerkoopBron {
  naam: string;
  /** Brongegevens voor vandaag. Alleen-lezen: de bron wordt nooit gewijzigd. */
  laad(nu: Date): VerkoopBasis;
}

export const demoBron: VerkoopBron = {
  naam: 'Fictieve demo-bron',
  laad: (nu) => genereerVerkoopDemo(dagVan(nu), nu),
};
