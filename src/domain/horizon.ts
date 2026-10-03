// Tijdshorizon uit een kort bronveld ("binnen 3 mnd", "volgend voorjaar") naar een categorie.
// Eenvoudige, voorspelbare trefwoorden. Vanaf fase 5 kan een goedgekeurd AI-inzicht of jouw correctie dit vervangen.

export type HorizonCategorie = 'kort' | 'middel' | 'lang' | 'onbekend';

const KORT = [/asap/i, /zo snel/i, /dringend/i, /binnen\s*[1-3]\s*(mnd|maand)/i, /eind dit jaar/i, /deze maand/i, /binnen (enkele|paar) weken/i];
const MIDDEL = [/zomer/i, /voorjaar/i, /lente/i, /volgend jaar/i, /binnen\s*([4-9]|1[0-2])\s*(mnd|maand)/i, /binnen het jaar/i, /najaar/i];
const LANG = [/pensioen/i, /\b(2|twee|drie|3)\s*jaar/i, /geen idee/i, /pas als/i, /nog niet/i];

export function horizonCategorie(tekst: string | null | undefined): HorizonCategorie {
  if (!tekst) return 'onbekend';
  if (LANG.some((r) => r.test(tekst))) return 'lang';
  if (KORT.some((r) => r.test(tekst))) return 'kort';
  if (MIDDEL.some((r) => r.test(tekst))) return 'middel';
  return 'onbekend';
}

export const HORIZON_LABEL: Record<HorizonCategorie, string> = {
  kort: 'binnen 3 maanden',
  middel: '3 tot 12 maanden',
  lang: 'later dan een jaar',
  onbekend: 'onbekend',
};
