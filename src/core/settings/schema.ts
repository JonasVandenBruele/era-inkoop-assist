// De centrale plaats voor alle instellingen. Eén document per gebruiker, gevalideerd met Zod.
// Nieuwe velden krijgen altijd een standaardwaarde, zodat oude opgeslagen instellingen geldig blijven.
import { z } from 'zod';

const uur = z.string().regex(/^\d{2}:\d{2}$/, 'Gebruik UU:MM');

export const InstellingenSchema = z.object({
  schemaVersie: z.literal(1).default(1),

  /** Brusselse lokale tijd "YYYY-MM-DDTHH:mm", of null voor de echte datum. */
  testdatum: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).nullable().default('2026-10-13T07:30'),

  /** Voor de openingszin: "met Jonas van ERA". */
  gebruiker: z
    .object({ voornaam: z.string().min(1).default('Jonas'), organisatie: z.string().min(1).default('ERA') })
    .default({ voornaam: 'Jonas', organisatie: 'ERA' }),

  // Prioriteit (gebruikt vanaf fase 2)
  ritmeDagen: z
    .object({ warm: z.number().int().min(1).default(14), lauw: z.number().int().min(1).default(42), koud: z.number().int().min(1).default(90) })
    .default({ warm: 14, lauw: 42, koud: 90 }),
  maxPerDag: z.number().int().min(1).max(100).default(15),
  nieuweLeadDagen: z.number().int().min(1).default(14),
  gewichten: z
    .object({
      ritmePerVerhouding: z.number().default(25),
      ritmeMax: z.number().default(60),
      faseWarm: z.number().default(15),
      faseLauw: z.number().default(8),
      horizonKort: z.number().default(15),
      horizonMiddel: z.number().default(5),
      eigenVervolgstap: z.number().default(20),
    })
    .default({ ritmePerVerhouding: 25, ritmeMax: 60, faseWarm: 15, faseLauw: 8, horizonKort: 15, horizonMiddel: 5, eigenVervolgstap: 20 }),

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
export function leesInstellingen(ruw: unknown): Instellingen {
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
