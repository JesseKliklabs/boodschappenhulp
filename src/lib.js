// Gedeelde hulpfuncties: ophalen, ingebedde paginadata uitlezen, prijzen en datums.

const USER_AGENT = 'Mozilla/5.0 (compatible; boodschappen-ophaler/0.1; prive gebruik)';

export class HttpFout extends Error {
  constructor(status, url) {
    super(`HTTP ${status} voor ${url}`);
    this.status = status;
  }
}

/** Haalt een URL op met een paar herkansingen. `als: 'tekst' | 'bytes'`. Een 404 wordt niet herhaald. */
export async function haal(url, { pogingen = 3, timeoutMs = 30_000, als = 'tekst' } = {}) {
  let laatsteFout;
  for (let poging = 1; poging <= pogingen; poging++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'nl-NL,nl;q=0.9' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new HttpFout(res.status, url);
      return als === 'bytes' ? new Uint8Array(await res.arrayBuffer()) : await res.text();
    } catch (err) {
      laatsteFout = err;
      if (err instanceof HttpFout && err.status === 404) break;
      if (poging < pogingen) await new Promise((r) => setTimeout(r, 2000 * poging));
    }
  }
  throw laatsteFout;
}

export const haalHtml = (url, opties) => haal(url, opties);

/** ISO-weeknummer en -jaar van een datum ("2026-11-09" → { week: 46, jaar: 2026 }). */
export function isoWeek(datum) {
  const d = new Date(`${datum}T12:00:00Z`);
  const dag = (d.getUTCDay() + 6) % 7; // ma=0 .. zo=6
  d.setUTCDate(d.getUTCDate() - dag + 3); // donderdag van deze week bepaalt het jaar
  const jaar = d.getUTCFullYear();
  const eersteDonderdag = new Date(Date.UTC(jaar, 0, 4));
  eersteDonderdag.setUTCDate(eersteDonderdag.getUTCDate() - ((eersteDonderdag.getUTCDay() + 6) % 7) + 3);
  return { week: 1 + Math.round((d - eersteDonderdag) / (7 * 864e5)), jaar };
}

/** Maandag en zondag van de week waar `datum` in valt, plus `wekenVerder` weken. */
export function weekGrenzen(datum, wekenVerder = 0) {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 7 * wekenVerder);
  const maandag = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  return { maandag, zondag: d.toISOString().slice(0, 10) };
}

/** Pakt het JSON-object dat direct na `marker` in een stuk JavaScript staat (haakjes tellen, strings respecteren). */
export function objectNa(tekst, marker) {
  const i = tekst.indexOf(marker);
  if (i < 0) return null;
  const start = tekst.indexOf('{', i + marker.length);
  let diepte = 0;
  let inString = false;
  for (let j = start; j < tekst.length; j++) {
    const c = tekst[j];
    if (inString) {
      if (c === '\\') j++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') diepte++;
    else if (c === '}' && --diepte === 0) return JSON.parse(tekst.slice(start, j + 1));
  }
  return null;
}

/** Inhoud van <script id="..."> als tekst, of null. */
export function scriptInhoud(html, id) {
  const m = html.match(new RegExp(`<script[^>]*\\bid="${id}"[^>]*>([^]*?)</script>`));
  return m ? m[1] : null;
}

/**
 * Nuxt 3 zet zijn paginadata als "platte" array (devalue-formaat) in __NUXT_DATA__:
 * objecten verwijzen naar elkaar via indexnummers. Dit bouwt er weer gewone objecten van.
 */
export function nuxtData(html) {
  const ruw = scriptInhoud(html, '__NUXT_DATA__');
  if (!ruw) throw new Error('__NUXT_DATA__ niet gevonden in pagina');
  const arr = JSON.parse(ruw);
  const cache = new Map();
  const wrappers = new Set(['Reactive', 'ShallowReactive', 'Ref', 'ShallowRef', 'NuxtError']);

  function h(i) {
    if (typeof i !== 'number') return i;
    if (i < 0) return undefined; // -1 = undefined, andere negatieven = speciale waarden
    if (cache.has(i)) return cache.get(i);
    const v = arr[i];
    if (v === null || typeof v !== 'object') {
      cache.set(i, v);
      return v;
    }
    if (Array.isArray(v)) {
      const tag = typeof v[0] === 'string' ? v[0] : null;
      if (tag && wrappers.has(tag)) {
        const r = h(v[1]);
        cache.set(i, r);
        return r;
      }
      if (tag === 'EmptyRef' || tag === 'EmptyShallowRef') return undefined;
      if (tag === 'Date') return v[1];
      if (tag === 'Set') {
        const out = [];
        cache.set(i, out);
        for (const x of v.slice(1)) out.push(h(x));
        return out;
      }
      if (tag === 'Map') {
        const out = {};
        cache.set(i, out);
        for (let k = 1; k < v.length; k += 2) out[h(v[k])] = h(v[k + 1]);
        return out;
      }
      const out = [];
      cache.set(i, out);
      for (const x of v) out.push(h(x));
      return out;
    }
    const out = {};
    cache.set(i, out);
    for (const k of Object.keys(v)) out[k] = h(v[k]);
    return out;
  }
  return h(0);
}

/** Next.js-paginadata uit __NEXT_DATA__. */
export function nextData(html) {
  const ruw = scriptInhoud(html, '__NEXT_DATA__');
  if (!ruw) throw new Error('__NEXT_DATA__ niet gevonden in pagina');
  return JSON.parse(ruw);
}

/** "3,99" / "€ 3.99" → 3.99 */
export function parsePrijs(tekst) {
  if (tekst == null) return null;
  const m = String(tekst).match(/(\d+)[,.](\d{2})/);
  return m ? Number(`${m[1]}.${m[2]}`) : null;
}

/** "2 voor 3,99" → { aantal: 2, prijs: 3.99 }; "voor 1,49" → { aantal: 1, prijs: 1.49 }. */
export function parseVoorActie(tekst) {
  if (!tekst) return null;
  const m = String(tekst).match(/(?:^|\s|^)(\d+)?\s*voor\s*€?\s*(\d+(?:[,.]\d{1,2})?)/i);
  if (!m) return null;
  return { aantal: m[1] ? Number(m[1]) : 1, prijs: Number(m[2].replace(',', '.')) };
}

/** Eerste 10 tekens van een ISO-datum ("2026-11-10T23:59:59+01:00" → "2026-11-10"). */
export function isoDatum(waarde) {
  return waarde ? String(waarde).slice(0, 10) : null;
}

/** Eén dag terug, voor "geldig tot 15-11 00:00" → laatste geldige dag 14-11. */
export function dagEerder(datum) {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function opschonen(tekst) {
  if (tekst == null) return null;
  return (
    String(tekst)
      .replace(/<br\s*\/?>/gi, ' · ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .replace(/^[\s·]+|[\s·]+$/g, '')
      .trim() || null
  );
}

/** HTML-entiteiten in attribuutwaarden terugzetten (&quot; &amp; &#39; &#x27; ...). */
export function decodeerEntiteiten(tekst) {
  return String(tekst)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** UTC-tijdstip → datum in Nederland ("2026-11-04T23:00Z" → "2026-11-05"). */
export function lokaleDatum(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
}

export const euro = (n) => `€${Number(n).toFixed(2).replace('.', ',')}`;

/** Gemeenschappelijk formaat voor één aanbieding, ongeacht de winkel. */
export function aanbieding(velden) {
  return {
    winkel: velden.winkel,
    id: String(velden.id),
    titel: opschonen(velden.titel),
    merk: opschonen(velden.merk) ?? null,
    omschrijving: opschonen(velden.omschrijving) ?? null,
    actie: opschonen(velden.actie) ?? null,
    actieprijs: velden.actieprijs ?? null,
    aantal: velden.aantal ?? 1,
    normaalprijs: velden.normaalprijs ?? null,
    // 'winkel' | 'online' | 'slijterij' | null (= overal). Voor je ouders telt vooral wat in de winkel geldt.
    alleen: velden.alleen ?? null,
    geldig_van: velden.geldig_van ?? null,
    geldig_tot: velden.geldig_tot ?? null,
    categorie: opschonen(velden.categorie) ?? null,
    url: velden.url ?? null,
    afbeelding: velden.afbeelding ?? null,
  };
}
