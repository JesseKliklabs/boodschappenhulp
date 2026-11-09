// Kleine webserver om de app op je eigen computer te bekijken: node scripts/serve.js
// Opent http://localhost:8123/app/ (de app haalt de prijzen uit ../data/).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POORT = Number(process.env.PORT) || 8123;
const SOORT = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  try {
    const pad = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let bestand = path.join(ROOT, pad);
    if (!bestand.startsWith(ROOT + path.sep) && bestand !== ROOT) throw Object.assign(new Error(), { code: 'ENOENT' });
    if ((await stat(bestand)).isDirectory()) {
      if (!pad.endsWith('/')) {
        res.writeHead(301, { Location: pad + '/' }).end();
        return;
      }
      bestand = path.join(bestand, 'index.html');
    }
    const inhoud = await readFile(bestand);
    res.writeHead(200, { 'Content-Type': SOORT[path.extname(bestand)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(inhoud);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Niet gevonden');
  }
}).listen(POORT, () => console.log(`App: http://localhost:${POORT}/app/`));
