// Haalt de aanbiedingen van alle winkels op en schrijft ze naar data/.
//
//   node src/run.js                 → live ophalen
//   node src/run.js --offline <map> → opgeslagen pagina's <map>/<winkel>.html gebruiken (handig bij ontwikkelen)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { haalHtml } from './lib.js';
import * as jumbo from './winkels/jumbo.js';
import * as aldi from './winkels/aldi.js';
import * as poiesz from './winkels/poiesz.js';
import * as lidl from './winkels/lidl.js';
import * as ah from './winkels/ah.js';
import { haalPrijzen } from './prijzen.js';

const WINKELS = [jumbo, aldi, poiesz, lidl, ah];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');

const args = process.argv.slice(2);
const offlineIdx = args.indexOf('--offline');
const offlineMap = offlineIdx >= 0 ? path.resolve(args[offlineIdx + 1]) : null;

const vandaag = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });

const aanbiedingen = [];
const status = {};

async function haalWinkel(winkel) {
  // Winkels met een eigen ophaalfunctie (AH: folder-PDF) regelen alles zelf.
  if (winkel.haalAanbiedingen) {
    if (offlineMap) throw new Error('overgeslagen in --offline-modus');
    return winkel.haalAanbiedingen({ vandaag, cacheMap: path.join(DATA, 'cache') });
  }
  const html = offlineMap
    ? await readFile(path.join(offlineMap, `${winkel.naam}.html`), 'utf8')
    : await haalHtml(winkel.url);
  return winkel.parse(html);
}

for (const winkel of WINKELS) {
  const start = Date.now();
  try {
    const lijst = await haalWinkel(winkel);
    aanbiedingen.push(...lijst);
    status[winkel.naam] = { ok: true, aantal: lijst.length, ms: Date.now() - start };
    console.log(`✓ ${winkel.naam.padEnd(8)} ${String(lijst.length).padStart(4)} aanbiedingen`);
  } catch (err) {
    status[winkel.naam] = { ok: false, fout: String(err.message ?? err) };
    console.log(`✗ ${winkel.naam.padEnd(8)} MISLUKT: ${err.message ?? err}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::warning::${winkel.naam} ophalen mislukt: ${err.message ?? err}`);
  }
}

// Alles mislukt (geen internet, verkeerde map): de bestaande gegevens niet overschrijven met niets.
if (!Object.values(status).some((s) => s.ok)) {
  console.error('Geen enkele winkel gelukt; data/ is niet aangepast.');
  process.exit(1);
}

const uitvoer = {
  opgehaald_op: new Date().toISOString(),
  datum: vandaag,
  winkels: status,
  aanbiedingen,
};

await mkdir(path.join(DATA, 'archief'), { recursive: true });
await writeFile(path.join(DATA, 'aanbiedingen.json'), JSON.stringify(uitvoer, null, 1));
// Archief: compact en zonder links/afbeeldingen, alleen voor prijsgeschiedenis ("is dit echt een aanbieding?").
const archief = {
  ...uitvoer,
  aanbiedingen: aanbiedingen.map(({ url, afbeelding, ...rest }) => rest),
};
await writeFile(path.join(DATA, 'archief', `${vandaag}.json`), JSON.stringify(archief));
console.log(`\n${aanbiedingen.length} aanbiedingen opgeslagen in data/aanbiedingen.json (+ archief/${vandaag}.json)`);

// Gewone prijzen (voor "waar is het het goedkoopst als het nergens in de aanbieding is").
// Mislukt dit, dan blijft het bestand van gisteren gewoon staan.
if (!offlineMap) {
  try {
    const prijzen = await haalPrijzen();
    await writeFile(
      path.join(DATA, 'prijzen.json'),
      JSON.stringify({ opgehaald_op: new Date().toISOString(), ...prijzen }),
    );
    const perWinkel = Object.entries(prijzen.perWinkel).map(([w, n]) => `${w} ${n}`).join(', ');
    console.log(`${prijzen.producten.length} gewone prijzen opgeslagen in data/prijzen.json (${perWinkel})`);
  } catch (err) {
    console.log(`✗ gewone prijzen MISLUKT: ${err.message ?? err}`);
    if (process.env.GITHUB_ACTIONS) console.log(`::warning::gewone prijzen ophalen mislukt: ${err.message ?? err}`);
  }
}
