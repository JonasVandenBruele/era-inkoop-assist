// Kleine, voorspelbare toevalsgenerator: zelfde seed = exact dezelfde testdata.
export function maakPrng(seed: number) {
  let a = seed >>> 0;
  const volgende = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    getal: volgende,
    tussen(min: number, max: number): number {
      return min + Math.floor(volgende() * (max - min + 1));
    },
    kies<T>(lijst: readonly T[]): T {
      const x = lijst[Math.floor(volgende() * lijst.length)];
      if (x === undefined) throw new Error('Lege lijst');
      return x;
    },
    kans(p: number): boolean {
      return volgende() < p;
    },
  };
}
export type Prng = ReturnType<typeof maakPrng>;

/** Deterministische UUID uit een tekst (FNV-1a, 128 bit uitgesmeerd). Geen beveiliging, enkel stabiele ID's. */
export function stabieleUuid(tekst: string): string {
  const delen: string[] = [];
  for (let ronde = 0; ronde < 4; ronde++) {
    let h = 0x811c9dc5 ^ ronde;
    for (let i = 0; i < tekst.length; i++) {
      h ^= tekst.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    delen.push((h >>> 0).toString(16).padStart(8, '0'));
  }
  const hex = delen.join('');
  // Versie-4/variant-bits zetten zodat het een geldige UUID is.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
