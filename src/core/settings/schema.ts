// De centrale plaats voor alle instellingen. Eén document per gebruiker, gevalideerd met Zod.
// Nieuwe velden krijgen altijd een standaardwaarde, zodat oude opgeslagen instellingen geldig blijven.
import { z } from 'zod';

const uur = z.string().regex(/^\d{2}:\d{2}$/, 'Gebruik UU:MM');

export const InstellingenSchema = z.object({
  schemaVersie: z.number().int().default(2),

  /**
   * Welke gegevens de app toont: 'echt' = ERAForce (via de mirror), 'test' = fictieve testdata,
   * 'auto' = echt zodra er ERAForce-gegevens zijn. Met echte gegevens geldt altijd de echte datum.
   */
  gegevens: z.enum(['auto', 'test', 'echt']).default('auto'),

  /** Brusselse lokale tijd "YYYY-MM-DDTHH:mm", of null voor de echte datum. Enkel bij testdata. */
  testdatum: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).nullable().default('2026-10-13T07:30'),

  /** Voor de openingszin: "met Jonas van ERA". */
  gebruiker: z
    .object({ voornaam: z.string().min(1).default('Jonas'), organisatie: z.string().min(1).default('ERA') })
    .default({ voornaam: 'Jonas', organisatie: 'ERA' }),

  // Prioriteit (gebruikt vanaf fase 2)
  ritmeDagen: z
    // Warm = ritme wanneer er GEEN timeline is (dan binnen de week een timeline afspreken). Is er een timeline, dan geldt die.
    .object({ warm: z.number().int().min(1).default(7), lauw: z.number().int().min(1).default(60), koud: z.number().int().min(1).default(180) })
    .default({ warm: 7, lauw: 60, koud: 180 }),
  maxPerDag: z.number().int().min(1).max(100).default(15),
  nieuweLeadDagen: z.number().int().min(1).default(3),
  /** Een terugbeltaak uit ERAForce die langer dan dit aantal werkdagen verlopen is, telt als achterstand (niet op de daglijst). */
  achterstandNaWerkdagen: z.number().int().min(1).default(10),
  gewichten: z
    .object({
      ritmePerVerhouding: z.number().default(25),
      ritmeMax: z.number().default(60),
      faseWarm: z.number().default(15),
      faseLauw: z.number().default(8),
      horizonKort: z.number().default(40),
      horizonMiddel: z.number().default(10),
      eigenVervolgstap: z.number().default(20),
      waardehaak: z.number().default(20),
      bron: z.number().default(10),
    })
    .default({ ritmePerVerhouding: 25, ritmeMax: 60, faseWarm: 15, faseLauw: 8, horizonKort: 40, horizonMiddel: 10, eigenVervolgstap: 20, waardehaak: 20, bron: 10 }),

  // Contactstrategie (fase 3b): altijd aanwezig, nooit opdringerig.
  contact: z
    .object({
      berichtNaGeenAntwoord: z.number().int().min(1).default(2),
      werkdagenNaBericht: z.number().int().min(0).default(3),
      berichtenVanaf: uur.default('09:00'),
      berichtenTot: uur.default('20:00'),
      geenBerichtenOpZondag: z.boolean().default(true),
    })
    .default({ berichtNaGeenAntwoord: 2, werkdagenNaBericht: 3, berichtenVanaf: '09:00', berichtenTot: '20:00', geenBerichtenOpZondag: true }),

  // Herplanning na geen antwoord (fase 3)
  geenAntwoord: z
    .object({
      werkdagenTussenPogingen: z.array(z.number().int().min(0)).default([1, 2, 4]),
      maxPogingenOpRij: z.number().int().min(1).default(3),
      nieuweLeadZelfdeDagOpnieuw: z.boolean().default(true),
    })
    .default({ werkdagenTussenPogingen: [1, 2, 4], maxPogingenOpRij: 3, nieuweLeadZelfdeDagOpnieuw: true }),

  // Belmomenten (fase 6)
  werkdag: z
    .object({
      start: uur.default('08:30'),
      einde: uur.default('18:00'),
      pauzes: z.array(z.object({ start: uur, einde: uur })).default([{ start: '12:30', einde: '13:15' }]),
      belduurMinuten: z.number().int().min(1).default(6),
      reisbufferMinuten: z.number().int().min(0).default(20),
    })
    .default({ start: '08:30', einde: '18:00', pauzes: [{ start: '12:30', einde: '13:15' }], belduurMinuten: 6, reisbufferMinuten: 20 }),

  // ERAForce: bellen via "Maf Call" in de Salesforce-app (de app opent enkel het record).
  eraforce: z
    .object({
      /** Bel via ERAForce als het contact een ERAForce-record heeft; anders gewoon via de telefoon. */
      belViaEraforce: z.boolean().default(true),
      /** Na bellen via ERAForce nog "hoe ging het?" vragen? Standaard niet: de evaluatie staat dan al in ERAForce. */
      vraagNaBellenViaEraforce: z.boolean().default(false),
    })
    .default({ belViaEraforce: true, vraagNaBellenViaEraforce: false }),

  // Pushmeldingen (zonder klantgegevens tenzij toonNamen aan staat).
  meldingen: z
    .object({
      ochtend: z.boolean().default(true),
      ochtendUur: uur.default('08:00'),
      belmoment: z.boolean().default(true),
      terugbel: z.boolean().default(true),
      terugbelMinutenVooraf: z.number().int().min(0).max(120).default(10),
      toonNamen: z.boolean().default(false),
    })
    .default({ ochtend: true, ochtendUur: '08:00', belmoment: true, terugbel: true, terugbelMinutenVooraf: 10, toonNamen: false }),

  /** Welke mail-app opent bij "Mail": Outlook (standaard) of de standaard-mailapp van het toestel (Apple Mail). */
  mailApp: z.enum(['outlook', 'standaard']).default('outlook'),

  // AI (fase 4)
  ai: z
    .object({
      ingeschakeld: z.boolean().default(false),
      contextGebruikenInPlanning: z.boolean().default(false),
      budgetEurPerMaand: z.number().min(0).default(10),
      usdNaarEur: z.number().positive().default(0.92),
    })
    .default({ ingeschakeld: false, contextGebruikenInPlanning: false, budgetEurPerMaand: 10, usdNaarEur: 0.92 }),

  // Privacy
  bewaartermijnMaanden: z
    .object({ belpogingen: z.number().int().min(1).default(24), aiRuweUitvoer: z.number().int().min(1).default(3) })
    .default({ belpogingen: 24, aiRuweUitvoer: 3 }),
});

export type Instellingen = z.infer<typeof InstellingenSchema>;

export const STANDAARD_INSTELLINGEN: Instellingen = InstellingenSchema.parse({});

/** Lees opgeslagen instellingen veilig in: ongeldige of ontbrekende velden vallen terug op de standaard. */
/**
 * Opgeslagen instellingen van schemaversie 1 (vóór de afstemming met Jonas op 3/10/2026) bijwerken:
 * waarden die nog op de oude standaard stonden, krijgen de nieuwe standaard. Zelf gewijzigde waarden blijven.
 */
function migreer(ruw: unknown): unknown {
  if (typeof ruw !== 'object' || ruw === null) return ruw;
  const d = structuredClone(ruw) as Record<string, any>;
  if ((d.schemaVersie ?? 1) >= 2) return d;
  const vervang = (obj: Record<string, any> | undefined, sleutel: string, oud: number, nieuw: number) => {
    if (obj && obj[sleutel] === oud) obj[sleutel] = nieuw;
  };
  vervang(d.ritmeDagen, 'warm', 14, 7);
  vervang(d.ritmeDagen, 'lauw', 42, 60);
  vervang(d.ritmeDagen, 'koud', 90, 180);
  vervang(d, 'nieuweLeadDagen', 14, 3);
  vervang(d.gewichten, 'horizonKort', 15, 40);
  vervang(d.gewichten, 'horizonMiddel', 5, 10);
  vervang(d.gewichten, 'waardehaak', 10, 20);
  d.schemaVersie = 2;
  return d;
}

export function leesInstellingen(ruwOrigineel: unknown): Instellingen {
  const ruw = migreer(ruwOrigineel);
  const r = InstellingenSchema.safeParse(ruw ?? {});
  if (r.success) return r.data;
  // Alleen de ongeldige velden vervangen; de rest van je instellingen blijft behouden.
  const bron = (typeof ruw === 'object' && ruw !== null ? ruw : {}) as Record<string, unknown>;
  const geldig: Record<string, unknown> = {};
  for (const [sleutel, veldSchema] of Object.entries(InstellingenSchema.shape)) {
    if (sleutel in bron && veldSchema.safeParse(bron[sleutel]).success) geldig[sleutel] = bron[sleutel];
  }
  return InstellingenSchema.parse(geldig);
}
