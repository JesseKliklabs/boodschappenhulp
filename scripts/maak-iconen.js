// Maakt de app-iconen (PNG voor iPhone/Android, SVG voor de browser) zonder extra pakketten:
// een boodschappenbriefje met een pompoenkleurige %-sticker. Draai opnieuw na een wijziging: node scripts/maak-iconen.js
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');

const KLEUR = {
  groen: [87, 101, 43], // olijf
  papier: [242, 240, 232], // havermout
  sticker: [217, 123, 41], // pompoen
  inkt: [35, 38, 28],
};

// Vormen op een canvas van 512×512 (de middelste 80% is "veilig" voor ronde Android-iconen).
const PAPIER = { cx: 230, cy: 248, b: 210, h: 270, r: 24, hoek: -6 };
const REGELS = [
  { y: -72, b: 130 },
  { y: -18, b: 150 },
  { y: 36, b: 100 },
];
const STICKER = { cx: 338, cy: 346, r: 92 };
const PROCENT = { stip1: [312, 318], stip2: [366, 376], r: 17, lijn: [[370, 306], [306, 388]], dikte: 15 };

// --- afstandsfuncties (negatief = binnen de vorm) ---
function draai(x, y, cx, cy, graden) {
  const a = (-graden * Math.PI) / 180;
  const dx = x - cx, dy = y - cy;
  return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
}
function rondeRechthoek(px, py, b, h, r) {
  const qx = Math.abs(px) - b / 2 + r, qy = Math.abs(py) - h / 2 + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
const cirkel = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;
function staaf(x, y, [ax, ay], [bx, by], dikte) {
  const pax = x - ax, pay = y - ay, bax = bx - ax, bay = by - ay;
  const t = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * t, pay - bay * t) - dikte / 2;
}

/** Kleur op punt (x, y) van het 512-canvas. */
function kleurOp(x, y) {
  let k = KLEUR.groen;
  const [px, py] = draai(x, y, PAPIER.cx, PAPIER.cy, PAPIER.hoek);
  if (rondeRechthoek(px, py, PAPIER.b, PAPIER.h, PAPIER.r) < 0) {
    k = KLEUR.papier;
    for (const r of REGELS)
      if (rondeRechthoek(px + (150 - r.b) / 2, py - r.y, r.b, 20, 10) < 0) k = KLEUR.groen;
  }
  if (cirkel(x, y, STICKER.cx, STICKER.cy, STICKER.r) < 0) {
    k = KLEUR.sticker;
    if (
      cirkel(x, y, ...PROCENT.stip1, PROCENT.r) < 0 ||
      cirkel(x, y, ...PROCENT.stip2, PROCENT.r) < 0 ||
      staaf(x, y, ...PROCENT.lijn, PROCENT.dikte) < 0
    )
      k = KLEUR.inkt;
  }
  return k;
}

function teken(maat) {
  const n = 4; // 4×4 monsters per pixel voor zachte randen
  const schaal = 512 / maat;
  const rijen = [];
  for (let y = 0; y < maat; y++) {
    const rij = Buffer.alloc(1 + maat * 3); // filterbyte 0 + RGB
    for (let x = 0; x < maat; x++) {
      const som = [0, 0, 0];
      for (let sy = 0; sy < n; sy++)
        for (let sx = 0; sx < n; sx++) {
          const k = kleurOp((x + (sx + 0.5) / n) * schaal, (y + (sy + 0.5) / n) * schaal);
          som[0] += k[0]; som[1] += k[1]; som[2] += k[2];
        }
      for (let c = 0; c < 3; c++) rij[1 + x * 3 + c] = Math.round(som[c] / (n * n));
    }
    rijen.push(rij);
  }
  return png(maat, maat, Buffer.concat(rijen));
}

// --- PNG-bestand ---
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function blok(soort, inhoud) {
  const lengte = Buffer.alloc(4);
  lengte.writeUInt32BE(inhoud.length);
  const naamEnInhoud = Buffer.concat([Buffer.from(soort, 'ascii'), inhoud]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(naamEnInhoud));
  return Buffer.concat([lengte, naamEnInhoud, crc]);
}
function png(b, h, ruw) {
  const kop = Buffer.alloc(13);
  kop.writeUInt32BE(b, 0);
  kop.writeUInt32BE(h, 4);
  kop[8] = 8; // bits per kanaal
  kop[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    blok('IHDR', kop),
    blok('IDAT', deflateSync(ruw, { level: 9 })),
    blok('IEND', Buffer.alloc(0)),
  ]);
}

// --- SVG (dezelfde tekening) ---
const hex = (k) => `#${k.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
function svg() {
  const p = PAPIER;
  const regels = REGELS.map(
    (r) => `<rect x="${p.cx - 75}" y="${p.cy + r.y - 10}" width="${r.b}" height="20" rx="10" fill="${hex(KLEUR.groen)}"/>`,
  ).join('');
  const [[x1, y1], [x2, y2]] = PROCENT.lijn;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="112" fill="${hex(KLEUR.groen)}"/>
<g transform="rotate(${p.hoek} ${p.cx} ${p.cy})"><rect x="${p.cx - p.b / 2}" y="${p.cy - p.h / 2}" width="${p.b}" height="${p.h}" rx="${p.r}" fill="${hex(KLEUR.papier)}"/>${regels}</g>
<circle cx="${STICKER.cx}" cy="${STICKER.cy}" r="${STICKER.r}" fill="${hex(KLEUR.sticker)}"/>
<g fill="${hex(KLEUR.inkt)}"><circle cx="${PROCENT.stip1[0]}" cy="${PROCENT.stip1[1]}" r="${PROCENT.r}"/><circle cx="${PROCENT.stip2[0]}" cy="${PROCENT.stip2[1]}" r="${PROCENT.r}"/></g>
<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${hex(KLEUR.inkt)}" stroke-width="${PROCENT.dikte}" stroke-linecap="round"/>
</svg>
`;
}

for (const [naam, maat] of [['icoon-192.png', 192], ['icoon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(path.join(APP, naam), teken(maat));
  console.log(`✓ app/${naam}`);
}
writeFileSync(path.join(APP, 'icoon.svg'), svg());
console.log('✓ app/icoon.svg');
