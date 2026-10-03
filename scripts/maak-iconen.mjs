// Maakt de app-iconen (PNG + SVG) zonder externe beeldtools. Eenmalig draaien: node scripts/maak-iconen.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BLAUW = [0, 0, 133]; // ERA-blauw #000085
const WIT = [255, 255, 255];
const LICHT = [214, 10, 41]; // ERA-rood #D60A29
const ORANJE = [0, 0, 133];

function kleurOp(x, y) {
  // x, y in 0..1
  const inRect = (x0, y0, x1, y1, r = 0) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = Math.min(Math.max(x, x0 + r), x1 - r);
    const cy = Math.min(Math.max(y, y0 + r), y1 - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  // ringen van de kalender
  if (inRect(0.34, 0.2, 0.39, 0.33, 0.02) || inRect(0.61, 0.2, 0.66, 0.33, 0.02)) return WIT;
  if (inRect(0.2, 0.26, 0.8, 0.8, 0.06)) {
    if (y < 0.4) return LICHT;
    // vinkje
    const opLijn = (ax, ay, bx, by, dikte) => {
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
      return (x - (ax + t * (bx - ax))) ** 2 + (y - (ay + t * (by - ay))) ** 2 <= dikte ** 2;
    };
    if (opLijn(0.36, 0.6, 0.46, 0.7, 0.035) || opLijn(0.46, 0.7, 0.66, 0.5, 0.035)) return ORANJE;
    return WIT;
  }
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
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#000085"/><rect x="20" y="26" width="60" height="54" rx="6" fill="#fff"/><rect x="20" y="26" width="60" height="14" rx="6" fill="#D60A29"/><rect x="34" y="20" width="5" height="13" rx="2" fill="#fff"/><rect x="61" y="20" width="5" height="13" rx="2" fill="#fff"/><path d="M36 60 L46 70 L66 50" stroke="#000085" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`,
);
console.log('Iconen gemaakt in public/');
