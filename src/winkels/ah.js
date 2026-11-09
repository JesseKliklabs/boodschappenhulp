// Albert Heijn: ah.nl weigert automatische verzoeken, maar de Bonusfolder staat als PDF op
// folder.ah.nl (Publitas). In die PDF staat de tekst met positie en lettergrootte. Elke aanbieding
// is een tegel met een productnaam (kleine letters) en een groot actie-etiket ("25% korting",
// "1+1 gratis", "2 stuks 3.99") ernaast of eronder. We koppelen elke naam aan het dichtstbijzijnde
// etiket. Gratis, maar niet perfect: daarom krijgt elke aanbieding een link naar de folderpagina.
// Het resultaat wordt per folder bewaard in data/cache/, zodat de PDF maar één keer wordt verwerkt.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { aanbieding, haal, HttpFout, isoWeek, objectNa, weekGrenzen } from '../lib.js';

export const naam = 'ah';
const VERSIE = 1; // ophogen als de parser verandert, dan wordt de cache opnieuw opgebouwd

// --- tekst op een pagina indelen -------------------------------------------------------------

const KLEIN = 8.5; // kleiner = kleine lettertjes (voorwaarden), negeren
const GROOT = 12; // groter = etiket of kop

/** Woorden die bij een etiket horen. */
const ETIKET =
  /^(?:\d+\+\d*|\d+\+|\d+%|korting|gratis|halve prijs|e|\d+ (?:stuks?|netten?|pakken|pak|flessen|zakken)|1 (?:net|pak|fles|zak)|per (?:stuk|zak|bak|doos|set|fles|kilo|100 gram|\w+)|€\s?\d+(?:[.,]\d+)?|\d+(?:\.\d*)?-?|\.|⁄|\/|tot wel|vanaf|lager!|op=op|\d+\.\d{2}-\d+\.\d{2})$/i;
/** Versiering zonder betekenis. */
const VERSIERING = /^(?:deals?|superr+|altijd|laag!|pf|s|e|r|sup|p|su|lager|in prijs verlaagd!)$/i;

const box = (it) => ({ x0: it.x, x1: it.x + it.w, y0: it.y - it.h, y1: it.y });
const vereniging = (a, b) => ({
  x0: Math.min(a.x0, b.x0),
  x1: Math.max(a.x1, b.x1),
  y0: Math.min(a.y0, b.y0),
  y1: Math.max(a.y1, b.y1),
});
/** Kleinste afstand tussen twee rechthoeken (0 als ze overlappen). */
function afstand(a, b) {
  const dx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1);
  const dy = Math.max(0, a.y0 - b.y1, b.y0 - a.y1);
  return Math.hypot(dx, dy);
}

/** Voegt elementen samen die dicht bij elkaar liggen (union-find op afstand). */
function groepeer(items, maxAfstand) {
  const ouder = items.map((_, i) => i);
  const wortel = (i) => (ouder[i] === i ? i : (ouder[i] = wortel(ouder[i])));
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++)
      if (maxAfstand(items[i], items[j])) ouder[wortel(i)] = wortel(j);
  const groepen = new Map();
  items.forEach((it, i) => groepen.set(wortel(i), [...(groepen.get(wortel(i)) ?? []), it]));
  return [...groepen.values()].map((leden) => ({
    leden: leden.sort((a, b) => a.y - b.y || a.x - b.x),
    box: leden.map(box).reduce(vereniging),
  }));
}

/** Regels van een naamblok netjes aan elkaar ("uitloop-" + "kip" → "uitloopkip"). */
function plakRegels(regels) {
  return regels
    .reduce(
      (tekst, r) =>
        /[a-z]-$/.test(tekst) && /^[a-z]/.test(r) && !/^(of|en)\b/.test(r) ? tekst.slice(0, -1) + r : `${tekst} ${r}`,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

const prijs = (s) => Number(s);

/** Zet de tekstjes van één etiket om in actie, actieprijs, aantal en normaalprijs. */
export function leesEtiket(leden) {
  // Dubbele tekstjes weg, en bedragen die in stukjes staan ("0." met rechtsboven "99") samenvoegen.
  const uniek = leden.filter(
    (it, i) => leden.findIndex((o) => o.str === it.str && Math.abs(o.x - it.x) < 1 && Math.abs(o.y - it.y) < 1) === i,
  );
  const delen = uniek.map((it) => ({ ...it }));
  // Grootste bedragen eerst, en dan de grootste centen die er rechts naast staan
  // (zo gaat de dikke actieprijs niet met de centen van de kleine doorgestreepte prijs aan de haal).
  const euros = delen.filter((d) => /^\d+\.$/.test(d.str)).sort((a, b) => b.h - a.h);
  for (const euro of euros) {
    const rechts = euro.x + euro.w;
    const [centen] = delen
      .filter(
        (c) =>
          /^\d{2}$/.test(c.str) &&
          !c.weg &&
          c.h <= euro.h &&
          c.x >= rechts - 30 &&
          c.x - rechts < 25 &&
          c.y - c.h < euro.y &&
          c.y > euro.y - euro.h,
      )
      .sort((a, b) => b.h - a.h);
    if (centen) {
      euro.str += centen.str;
      centen.weg = true;
    }
  }
  for (let i = delen.length - 1; i >= 0; i--) if (delen[i].weg) delen.splice(i, 1);
  const tekst = delen.map((d) => d.str).join(' ');
  const t = tekst.toLowerCase();

  const bedragen = delen.filter((d) => /^\d+\.\d{2}$/.test(d.str)).sort((a, b) => b.h - a.h);
  const grootste = bedragen[0];
  const actieprijs = grootste ? prijs(grootste.str) : null;
  const doorgestreept = bedragen.find((d) => d !== grootste && d.h < grootste.h * 0.6);
  const bereik = delen.find((d) => /^\d+\.\d{2}-\d+\.\d{2}$/.test(d.str))?.str ?? null;
  const stuks = t.match(/(\d+) (?:stuks|netten|pakken|flessen|zakken)/);
  const per = t.match(/per (stuk|zak|bak|doos|set|fles|kilo|100 gram)/);

  let actie = null;
  let aantal = 1;
  const gratis = t.match(/(\d+)\s*\+\s*(\d+)?\s*gratis/);
  const procent = t.match(/(tot wel )?(\d+)%\s*korting/);
  const euroKorting = t.match(/€\s?(\d+(?:[.,]\d+)?)\s*korting/);
  if (gratis) actie = `${gratis[1]}+${gratis[2] ?? 1} gratis`;
  else if (/\b2 e halve prijs|2e halve prijs|\b2 e\b.*halve/.test(t) || /halve prijs/.test(t)) actie = '2e halve prijs';
  else if (procent && !actieprijs) actie = `${procent[1] ? 'tot wel ' : ''}${procent[2]}% korting`;
  else if (euroKorting) actie = `€${euroKorting[1]} korting`;

  if (actieprijs != null && !actie) {
    if (stuks) {
      aantal = Number(stuks[1]);
      actie = `${aantal} voor ${actieprijs.toFixed(2)}`;
    } else actie = per ? `${actieprijs.toFixed(2)} per ${per[1]}` : `voor ${actieprijs.toFixed(2)}`;
  }
  if (!actie && /op=op/.test(t)) actie = 'OP=OP';

  return {
    actie,
    actieprijs: actie && /gratis|halve prijs|korting/.test(actie) ? null : actieprijs,
    aantal,
    normaalprijs: doorgestreept ? prijs(doorgestreept.str) : null,
    bereik,
    tekst,
  };
}

/** Haalt de aanbiedingen uit de tekst-elementen van één folderpagina. */
export function leesPagina(items) {
  const bruikbaar = items.filter((it) => it.str.trim() && it.h > KLEIN);
  const etiketDelen = bruikbaar.filter((it) => it.h >= GROOT && ETIKET.test(it.str.trim()));
  const tekstDelen = bruikbaar.filter(
    (it) => !etiketDelen.includes(it) && !VERSIERING.test(it.str.trim()) && !(it.h >= GROOT * 2),
  );

  // Etiketten: grote tekstjes vlak bij elkaar.
  const etiketten = groepeer(etiketDelen, (a, b) => afstand(box(a), box(b)) < 22)
    .map((g) => ({ ...g, ...leesEtiket(g.leden) }))
    .filter((e) => e.actie);

  // Naamblokken: regels onder elkaar met overlappende breedte.
  const blokken = groepeer(tekstDelen, (a, b) => {
    const A = box(a);
    const B = box(b);
    const overlapX = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0) > -4;
    const gatY = Math.max(0, A.y0 - B.y1, B.y0 - A.y1);
    return overlapX && gatY < Math.max(a.h, b.h) * 0.9;
  })
    .map((g) => {
      const regels = g.leden.map((l) => l.str.trim());
      const info = regels.findIndex((r) =>
        /^de\s+(actie)?prij|^actieprijs|^\*?m\.u\.v|^diepvries$|^\d+\.\d{2}(-\d+\.\d{2})?$/i.test(r),
      );
      const naamRegels = info >= 0 ? regels.slice(0, info) : regels;
      const infoTekst = info >= 0 ? plakRegels(regels.slice(info)) : '';
      const vast = infoTekst.match(/actieprijs (?:per kilo )?is (\d+\.\d{2})/i);
      const varieert = infoTekst.match(/(per kilo )?vari[eë]ren van (\d+\.\d{2}-\d+\.\d{2})/i);
      // Staartjes als "Per zak", "Los" of "op=op" horen niet in de productnaam.
      let titel = plakRegels(naamRegels);
      const staart = [];
      for (let m; (m = titel.match(/\s+(per (?:zak|stuk|bak|doos|set|fles|100 gram)|los|op=op)$/i)); ) {
        staart.unshift(m[1]);
        titel = titel.slice(0, m.index);
      }
      return {
        ...g,
        titel,
        staart: staart.join(', '),
        heeftPrijsinfo: info >= 0,
        vasteprijs: vast ? prijs(vast[1]) : null,
        prijsbereik: varieert ? `${varieert[1] ? 'per kilo ' : ''}${varieert[2]}` : null,
      };
    })
    .filter((b) => /[a-z]{3}/i.test(b.titel) && /^[A-Z0-9'"]/.test(b.titel) && b.titel.length <= 90)
    .filter(
      (b) =>
        !/^(voor |de adviesprijs|kijk |kies |activeren|vanaf \d|groetjes|voucher|prijsfavorieten|in prijs verlaagd|bekijk|limited edition|altijd \d+ jaar|ontdek|nu vanaf)/i.test(
          b.titel,
        ) && !/wanneer jij wilt/i.test(b.titel),
    );

  // Deals van de AH Voordeelshop (koptelefoons, skipassen) zijn alleen online te koop.
  const voordeelshop = bruikbaar.some((it) => /voordeelshop|air miles|voucher/i.test(it.str));
  // Prijsfavorieten: blijvend verlaagde prijs van een AH-huismerkproduct.
  const prijsfavoriet = items.some((it) => /prijsfavorieten/i.test(it.str));

  // Koppelen: steeds het dichtstbijzijnde nog vrije paar naam ↔ etiket.
  const paren = [];
  for (const b of blokken) for (const e of etiketten) paren.push({ b, e, d: afstand(b.box, e.box) });
  paren.sort((p, q) => p.d - q.d);
  const koppeling = new Map();
  const bezet = new Set();
  // Eerst alleen dichtbij; daarna mogen overgebleven namen en etiketten verder uit elkaar liggen
  // (bv. naam links onderin de tegel, etiket rechts).
  for (const max of [130, 300]) {
    for (const { b, e, d } of paren) {
      if (d > max || koppeling.has(b) || bezet.has(e)) continue;
      koppeling.set(b, e);
      bezet.add(e);
    }
  }

  return blokken
    .filter((b) => koppeling.has(b) || b.heeftPrijsinfo)
    .map((b) => {
      const e = koppeling.get(b);
      const actieprijs = e?.actieprijs ?? b.vasteprijs ?? null;
      const aantal = e?.aantal ?? 1;
      // Bij "2 voor 1.99" staat de doorgestreepte prijs voor alle stuks samen; wij bewaren de prijs per stuk.
      const normaalprijs = e?.normaalprijs ? Math.round((e.normaalprijs / aantal) * 100) / 100 : null;
      return {
        titel: b.titel,
        actie:
          prijsfavoriet && actieprijs != null
            ? 'nieuwe lage prijs'
            : (e?.actie ?? (b.vasteprijs ? `voor ${b.vasteprijs.toFixed(2)}` : 'Bonus')),
        actieprijs,
        aantal,
        normaalprijs,
        alleen: voordeelshop ? 'online' : null,
        omschrijving: [
          b.staart,
          b.prijsbereik && `actieprijzen ${b.prijsbereik}`,
          e?.bereik && `normaal ${e.bereik}`,
        ]
          .filter(Boolean)
          .join(' · '),
        y: b.box.y0,
        x: b.box.x0,
      };
    })
    .sort((p, q) => p.y - q.y || p.x - q.x);
}

// --- folder ophalen ---------------------------------------------------------------------------

async function laadPdfjs() {
  // Het "legacy"-pakket draait in Node zonder browser-onderdelen.
  return import('pdfjs-dist/legacy/build/pdf.mjs');
}

/** Alle tekst-elementen per pagina, met positie (y van boven gemeten) en lettergrootte. */
export async function pdfTekst(bytes) {
  const pdfjs = await laadPdfjs();
  const doc = await pdfjs.getDocument({ data: bytes, verbosity: 0, isEvalSupported: false }).promise;
  const paginas = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const hoogte = pagina.getViewport({ scale: 1 }).height;
    const { items } = await pagina.getTextContent();
    paginas.push(
      items
        .filter((it) => it.str)
        .map((it) => {
          const [, , c, d, x, y] = it.transform;
          return { str: it.str, x, y: hoogte - y, h: Math.hypot(c, d), w: it.width };
        }),
    );
    pagina.cleanup();
  }
  await doc.destroy();
  return paginas;
}

function folderVan(datum, wekenVerder) {
  const grenzen = weekGrenzen(datum, wekenVerder);
  const { week, jaar } = isoWeek(grenzen.maandag);
  return { slug: `bonus-week-${week}-${jaar}`, ...grenzen };
}

async function pdfLink(folderSlug) {
  try {
    const html = await haal(`https://folder.ah.nl/${folderSlug}/`);
    const pdf = objectNa(html, 'var data =')?.config?.downloadPdfUrl;
    if (!pdf) throw new Error(`AH: geen PDF-link gevonden in folder ${folderSlug} (pagina-opbouw veranderd?)`);
    return pdf;
  } catch (err) {
    if (err instanceof HttpFout && err.status === 404) return null; // folder (nog) niet gepubliceerd
    throw err;
  }
}

async function leesFolder({ slug: folderSlug, maandag, zondag }, cacheMap) {
  const cachePad = path.join(cacheMap, `ah-${folderSlug}.json`);
  try {
    const cache = JSON.parse(await readFile(cachePad, 'utf8'));
    if (cache.versie === VERSIE) return cache;
  } catch {
    // nog niet verwerkt
  }

  const pdf = await pdfLink(folderSlug);
  if (!pdf) return null;
  const bytes = await haal(pdf, { als: 'bytes', timeoutMs: 120_000 });
  const paginas = await pdfTekst(bytes);

  const lijst = paginas.flatMap((items, i) =>
    leesPagina(items).map((a, j) =>
      aanbieding({
        winkel: naam,
        id: `${folderSlug}-p${i + 1}-${j + 1}`,
        titel: a.titel,
        omschrijving: a.omschrijving,
        alleen: a.alleen,
        actie: a.actie,
        actieprijs: a.actieprijs,
        aantal: a.aantal,
        normaalprijs: a.normaalprijs,
        geldig_van: maandag,
        geldig_tot: zondag,
        url: `https://folder.ah.nl/${folderSlug}/page/${i + 1}`,
      }),
    ),
  );
  console.log(`  ah: folder ${folderSlug}, ${paginas.length} pagina's → ${lijst.length} aanbiedingen`);
  if (lijst.length < 20) throw new Error(`AH: maar ${lijst.length} aanbiedingen gevonden in ${folderSlug} (folder-opmaak veranderd?)`);

  const resultaat = { versie: VERSIE, folder: folderSlug, pdf, verwerkt_op: new Date().toISOString(), aanbiedingen: lijst };
  await mkdir(cacheMap, { recursive: true });
  await writeFile(cachePad, JSON.stringify(resultaat, null, 1));
  return resultaat;
}

/** Bonusfolder van deze week, en vanaf vrijdagmiddag (als hij er is) ook die van volgende week. */
export async function haalAanbiedingen({ vandaag, cacheMap }) {
  const resultaat = [];
  for (const wekenVerder of [0, 1]) {
    const folder = folderVan(vandaag, wekenVerder);
    const gelezen = await leesFolder(folder, cacheMap);
    if (gelezen) resultaat.push(...gelezen.aanbiedingen);
    else if (wekenVerder === 0) throw new Error(`AH: folder ${folder.slug} niet gevonden`);
  }
  return resultaat;
}
