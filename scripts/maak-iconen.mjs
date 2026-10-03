// Maakt de app-iconen uit het beeldmerk in scripts/logo.mjs.
// SVG's schrijft Node; de PNG's worden gerenderd met PyMuPDF (python3 -m pip install --user pymupdf).
// Draaien: node scripts/maak-iconen.mjs
import { writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logoSvg } from './logo.mjs';

writeFileSync('public/icon.svg', logoSvg({ afgerond: true }));
const tmp = mkdtempSync(join(tmpdir(), 'oxpecker-'));
const vierkant = join(tmp, 'vierkant.svg');
writeFileSync(vierkant, logoSvg({ afgerond: false })); // iOS rondt de hoeken zelf af

const py = `
import pymupdf, sys
src = pymupdf.open(sys.argv[1])
for grootte, uit in [(180, 'public/apple-touch-icon.png'), (192, 'public/icon-192.png'), (512, 'public/icon-512.png')]:
    zoom = grootte / src[0].rect.width
    src[0].get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False).save(uit)
`;
execFileSync('python3', ['-c', py, vierkant], { stdio: 'inherit' });
console.log('Iconen gemaakt in public/');
