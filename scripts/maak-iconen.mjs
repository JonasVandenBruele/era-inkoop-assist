// Maakt de app-iconen (PNG + SVG) zonder externe beeldtools. Eenmalig draaien: node scripts/maak-iconen.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BLAUW = [0, 0, 133]; // ERA-blauw #000085
const WIT = [255, 255, 255];
const ROOD = [214, 10, 41]; // ERA-rood #D60A29
const ROOD_DONKER = [149, 16, 58]; // dieprood #95103A

// Ossenpikker (witte vogel, rode snavel) op de nok van een tweekleurig rood dak — een knipoog naar het ERA-dak.
function kleurOp(x, y0) {
  // --- dak: band onder de daklijn, met korte zijmuren; links ERA-rood, rechts dieprood ---
  const links = 0.12, rechts = 0.88, nok = 0.54, helling = 0.2, dikte = 0.11;
  if (x >= links && x <= rechts) {
    const daklijn = nok + (Math.abs(x - 0.5) / (0.5 - links)) * helling;
    const inBand = y0 >= daklijn && y0 <= daklijn + dikte;
    const inMuur = (x <= links + dikte * 0.9 || x >= rechts - dikte * 0.9) && y0 >= daklijn && y0 <= 0.9;
    if (inBand || inMuur) return x < 0.5 ? ROOD : ROOD_DONKER;
  }
  // --- vogel, 0.2 hoger getekend zodat de poten op de nok staan ---
  const y = y0 + 0.2;
  const inEllips = (cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const inDriehoek = (ax, ay, bx, by, cx, cy) => {
    const d = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
    const d1 = d(x, y, ax, ay, bx, by), d2 = d(x, y, bx, by, cx, cy), d3 = d(x, y, cx, cy, ax, ay);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  if (inEllips(0.6, 0.38, 0.028, 0.028)) return BLAUW;
  if (inEllips(0.6, 0.38, 0.045, 0.045)) return ROOD;
  if (inDriehoek(0.66, 0.37, 0.66, 0.45, 0.84, 0.43)) return ROOD;
  if (inEllips(0.58, 0.41, 0.1, 0.1)) return WIT;
  if (inEllips(0.47, 0.55, 0.18, 0.12)) return WIT;
  if (inDriehoek(0.32, 0.5, 0.33, 0.62, 0.16, 0.68)) return WIT;
  if ((Math.abs(x - 0.47) < 0.012 || Math.abs(x - 0.53) < 0.012) && y > 0.64 && y < 0.745) return WIT;
  return BLAUW;
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (const b of buf) {
    c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(grootte) {
  const ss = 3; // supersampling voor zachte randen
  const rijen = [];
  for (let y = 0; y < grootte; y++) {
    const rij = Buffer.alloc(1 + grootte * 3);
    for (let x = 0; x < grootte; x++) {
      const som = [0, 0, 0];
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const k = kleurOp((x + (sx + 0.5) / ss) / grootte, (y + (sy + 0.5) / ss) / grootte);
          for (let i = 0; i < 3; i++) som[i] += k[i];
        }
      for (let i = 0; i < 3; i++) rij[1 + x * 3 + i] = Math.round(som[i] / (ss * ss));
    }
    rijen.push(rij);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(grootte, 0);
  ihdr.writeUInt32BE(grootte, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rijen))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync('public/icon-192.png', png(192));
writeFileSync('public/icon-512.png', png(512));
writeFileSync('public/apple-touch-icon.png', png(180));
writeFileSync(
  'public/icon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#000085"/><path d="M12 74 L50 54 L50 65 L22 80 L22 90 L12 90 Z" fill="#D60A29"/><path d="M88 74 L50 54 L50 65 L78 80 L78 90 L88 90 Z" fill="#95103A"/><path d="M32 30 L33 42 L16 48 Z" fill="#fff"/><ellipse cx="47" cy="35" rx="18" ry="12" fill="#fff"/><circle cx="58" cy="21" r="10" fill="#fff"/><path d="M66 17 L66 25 L84 23 Z" fill="#D60A29"/><circle cx="60" cy="18" r="4.5" fill="#D60A29"/><circle cx="60" cy="18" r="2.8" fill="#000085"/><rect x="46" y="44" width="2.4" height="10" fill="#fff"/><rect x="52" y="44" width="2.4" height="10" fill="#fff"/></svg>\n`,
);
console.log('Iconen gemaakt in public/');
