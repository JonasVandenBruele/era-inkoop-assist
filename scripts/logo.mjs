// Bron van het Oxpecker-beeldmerk (logo-optie 3, gekozen door Jonas op 3/10/2026).
// ERA brand system "rood, wijzend naar boven" (Brand Guide 2021 p.48): rood vlak, witte negatieve pijl
// met de punt in het midden van de drager, donkerrode plooi; daarop een witte ossenpikker in lijnstijl.
// Het logodak van ERA wordt NIET gebruikt (Brand Guide p.14).
/** Donkerrode plooi als reeks stroken (werkt in elke SVG-renderer, ook zonder verloopondersteuning). */
function plooi(stroken = 16) {
  const kleur = (t) => {
    const a = [0x96, 0x0e, 0x34], b = [0xd7, 0x0a, 0x28];
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
  };
  const boven = (x) => 56 - (6 * x) / 50;
  const onder = (x) => 82 - (32 * x) / 50;
  let uit = '';
  for (let i = 0; i < stroken; i++) {
    const x0 = (50 * i) / stroken, x1 = Math.min(50, (50 * (i + 1)) / stroken + 0.4);
    const p = [[x0, boven(x0)], [x1, boven(x1)], [x1, onder(x1)], [x0, onder(x0)]].map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`);
    uit += `<path d="M${p.join(' L')} Z" fill="${kleur(i / (stroken - 1))}"/>`;
  }
  return uit;
}

export function logoSvg({ afgerond = true } = {}) {
  const rx = afgerond ? 20 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs>
<clipPath id="vorm"><rect width="100" height="100" rx="${rx}"/></clipPath></defs>
<g clip-path="url(#vorm)">
<rect width="100" height="100" fill="#D70A28"/>
${plooi()}
<path d="M0 100 L0 82 L50 50 L100 82 L100 100 Z" fill="#FFFFFF"/>
<g transform="translate(16.4 -1.8) scale(0.7)" fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
<path d="M70 40 C70 33 64 29 58 30 C53 31 50 35 50 39 C44 38 34 39 28 46 L14 54 L28 55 C32 62 42 65 52 63 C62 61 70 52 70 40 Z"/>
</g>
<path d="M47.2 42 L46.4 49.6 M52.6 42 L53 49.6" fill="none" stroke="#FFFFFF" stroke-width="3.6" stroke-linecap="round"/>
<path d="M65.4 23 L77 25.6 L65.4 28.3 Z" fill="#FFFFFF"/>
<circle cx="57.6" cy="24.6" r="1.7" fill="#FFFFFF"/>
</g>
</svg>
`;
}
