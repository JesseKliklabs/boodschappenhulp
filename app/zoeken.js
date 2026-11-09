// Zoeken en vergelijken. Wordt gebruikt door de app (in de browser) én door de ophaler (in Node),
// dus geen Node-specifieke dingen hierin.

/** "Crème Fraîche!" → ["creme", "fraiche"] */
export function woorden(tekst) {
  return String(tekst ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Onregelmatige meervouden en veelgebruikte andere namen. */
const VARIANTEN = {
  ei: ['eieren'],
  eieren: ['ei'],
  kip: ['kippen'],
  frisdrank: ['cola', 'sinas', 'frisdrank'],
  wc: ['toiletpapier'],
  wcpapier: ['toiletpapier'],
  pasta: ['pasta', 'spaghetti', 'penne', 'macaroni', 'fusilli'],
  aardappel: ['aardappelen', 'aardappels', 'krieltjes'],
  aardappelen: ['aardappel', 'aardappels', 'krieltjes'],
  piepers: ['aardappelen'],
};

/** Andere namen voor een woord (wcpapier → toiletpapier), of []. */
export const varianten = (woord) => VARIANTEN[woord] ?? [];

/** Vormen van één zoekwoord: "appels" → appels, appel; "tomaten" → tomaten, tomaat. */
function vormen(w) {
  const v = new Set([w, ...(VARIANTEN[w] ?? [])]);
  if (w.length > 4 && w.endsWith('en')) {
    const stam = w.slice(0, -2);
    v.add(stam);
    // tomaten → tomaat, bonen → boon
    if (/([aeou])([^aeiou])$/.test(stam)) v.add(stam.replace(/([aeou])([^aeiou])$/, '$1$1$2'));
    // flessen → fles
    if (/([^aeiou])\1$/.test(stam)) v.add(stam.slice(0, -1));
  }
  if (w.length > 3 && /[^s]s$/.test(w)) v.add(w.slice(0, -1));
  if (w.endsWith("'s")) v.add(w.slice(0, -2));
  return [...v].filter((x) => x.length >= 2);
}

const ACHTERVOEGSEL = /^(s|en|n|jes|je|tjes|tje|pjes|etjes)$/;

/**
 * Past een woord uit de productnaam bij een zoekvorm?
 *  - precies hetzelfde, of met meervoud/verkleinwoord: melk, appels, worstjes
 *  - als laatste deel van een samenstelling (vanaf 4 letters): karneMELK, scharrelKIPFILET
 * Niet als eerste deel: "melkchocolade" is chocolade, geen melk.
 */
function woordPast(woord, vorm) {
  if (woord === vorm) return true;
  if (woord.startsWith(vorm) && ACHTERVOEGSEL.test(woord.slice(vorm.length))) return true;
  if (vorm.length >= 4 && woord.length > vorm.length) {
    const stam = vorm.replace(/(en|s)$/, '');
    if (MISLEIDEND.some((m) => [vorm, stam].some((x) => m.length > x.length && m.endsWith(x)) && woord.includes(m))) return false;
    for (const v of [vorm, ...['s', 'en', 'jes', 'tjes'].map((a) => vorm + a)])
      if (woord.endsWith(v) && woord.length - v.length >= 2) return true;
  }
  return false;
}

/** Samenstellingen die wel op het zoekwoord eindigen, maar iets anders zijn. */
const MISLEIDEND = [
  'aardappel', 'sinaasappel', 'granaatappel', 'chocolademelk', 'kokosmelk', 'havermelk', 'sojamelk',
  'amandelmelk', 'rijstmelk', 'karnemelk', 'koffiemelk', 'pindakaas', 'roomkaas', 'smeerkaas', 'leverkaas',
  'zeekraal', 'ijskoffie', 'pannenkoek', 'ontbijtkoek', 'kruidkoek', 'stroopwafel', 'paprikachips',
];

/** Voorzetsels: "spaghetti MET ei", "halvarine OP brood", "creamer VOOR koffie" gaan niet over ei/brood/koffie. */
const VOORZETSEL = new Set(['met', 'op', 'voor', 'in', 'zonder', 'naar', 'uit']);

/** Woorden die ná het eigenlijke product mogen staan zonder dat het iets anders wordt. */
const KWALIFICATIE = new Set(
  ('ca x l g kg ml cl lt liter gram kilo stuks st stuk rollen rol pak pakken pakje fles flessen literpak blik pot zak ' +
    'zakje bak doos tray emmer naturel natuur halfvol halfvolle vol volle mager magere light bio biologisch vers verse ' +
    'groot grote klein kleine xl xxl xs extra original origineel classic regular zero suiker sugar free voordeelverpakking ' +
    'voordeelpak multipack heel hele half halve gesneden plakken plak stukken stukjes wit witte bruin bruine volkoren jong ' +
    'jonge belegen oud oude fairtrade los rood rode groen groene geel gele houdbaar houdbare gekoeld diepvries ongezouten ' +
    'gezouten fijn grof mild pittig plus scharrel vrije uitloop mini maxi family familie gemalen bonen snelfiltermaling ' +
    'filtermaling pads capsules cups lactosevrij lactosevrije ongezoet gezoet tros rond ronde dun dunne dik dikke')
    .split(' '),
);
const isMaatOfGetal = (w) => /^\d/.test(w) || KWALIFICATIE.has(w);

/** Huismerken en lidwoorden: tellen niet mee als "ander woord" in een productnaam. */
const NEUTRAAL = new Set(['ah', 'jumbo', 'lidl', 'aldi', 'poiesz', 'alle', 'de', 'het', 'een', 'en', 'of', 'excellent', 'basic', 'huismerk']);

/** Woorden die nooit zelf een boodschap zijn (voor de suggesties): lidwoorden, voorzetsels, maten. */
const RUIS = new Set(
  ('van voor met het een der des als ook per pak pakken pakje fles flessen zak zakje zakken doos bak bakje pot potje blik ' +
    'tray stuks stuk gram kilo liter ltr gr kg ml cl st ca x xl xxl mini maxi verpakking voordeelverpakking multipack ' +
    'and the with of en de la le du al ah jumbo lidl aldi poiesz alle excellent basic huismerk').split(' '),
);
export const isOnbelangrijk = (w) => RUIS.has(w) || VOORZETSEL.has(w);

/**
 * Hoe goed past een naam bij de zoekterm?
 *   3 = de naam gaat alleen over dit product ("Jumbo Halfvolle Melk 2 L", "Elstar appels")
 *   2 = het gezochte woord is het hoofdproduct, met meer erbij ("De Zaanse Hoeve Halfvolle melk")
 *   1 = het woord komt erin voor ("Kipfilet Americanos", "Alle Coca-Cola of Fanta")
 *   0 = past niet, of alleen als bijzaak ("Spaghetti met ei", "Kaasstengels met Goudse kaas")
 */
export function maakScorer(zoekterm) {
  const ws = woorden(zoekterm);
  // "wc-papier", "wc papier" → één woord als we het aan elkaar kennen
  const samen = ws.join('');
  const delen = (ws.length > 1 && VARIANTEN[samen] ? [samen] : ws).map(vormen);
  // `naam` mag ook al in woorden gesplitst zijn (scheelt veel werk bij 40.000 producten).
  return (naam) => scoreVoor(delen, Array.isArray(naam) ? naam : woorden(naam));
}

export const score = (zoekterm, naam) => maakScorer(zoekterm)(naam);

function scoreVoor(delen, w) {
  if (!delen.length) return 0;
  const gevonden = new Set();
  let laatste = -1;
  for (const vs of delen) {
    const i = w.findIndex((x, j) => !gevonden.has(j) && vs.some((v) => woordPast(x, v)));
    if (i < 0 || w.slice(0, i).some((x) => VOORZETSEL.has(x))) return 0;
    gevonden.add(i);
    laatste = Math.max(laatste, i);
  }
  if (!w.slice(laatste + 1).every(isMaatOfGetal)) return 1;
  const anders = w.filter((x, j) => !gevonden.has(j) && !isMaatOfGetal(x) && !NEUTRAAL.has(x));
  return anders.length <= 1 ? 3 : 2;
}

/** Een zoekopdracht klaarzetten: geeft een functie naam → past (true/false). */
export function maakZoeker(zoekterm) {
  const scorer = maakScorer(zoekterm);
  return (naam) => scorer(naam) > 0;
}

// --- maten en prijs per eenheid --------------------------------------------------------------

const EENHEID = {
  g: ['kg', 0.001], gr: ['kg', 0.001], gram: ['kg', 0.001], kg: ['kg', 1], kilo: ['kg', 1], kilogram: ['kg', 1],
  ml: ['l', 0.001], milliliter: ['l', 0.001], cl: ['l', 0.01], centiliter: ['l', 0.01], l: ['l', 1], lt: ['l', 1], liter: ['l', 1],
  st: ['stuk', 1], stuk: ['stuk', 1], stuks: ['stuk', 1], rollen: ['rol', 1], rol: ['rol', 1],
  wasbeurten: ['wasbeurt', 1], wasbeurt: ['wasbeurt', 1],
};

/**
 * Leest een verpakkingsmaat: "1,5 l" → { eenheid: 'l', hoeveelheid: 1.5 }, "3 x 200 ml" → 0.6 l,
 * "Per 350 g" → 0.35 kg, "6 stuks" → 6 stuk. Kijkt desnoods in de productnaam ("... Melk 1 L").
 */
export function leesMaat(maat, naam = '') {
  for (const bron of [maat, naam]) {
    if (!bron) continue;
    const t = String(bron).toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
    const re = /(?:(\d+)\s*x\s*)?(\d+(?:\.\d+)?)\s*(kilogram|kilo|kg|gram|gr|g|milliliter|ml|centiliter|cl|liter|lt|l|stuks|stuk|st|rollen|rol|wasbeurten|wasbeurt)\b/g;
    let laatste = null;
    for (const m of t.matchAll(re)) laatste = m; // in een naam staat de maat meestal achteraan
    if (laatste) {
      const [eenheid, factor] = EENHEID[laatste[3]];
      const ruw = (laatste[1] ? Number(laatste[1]) : 1) * Number(laatste[2]) * factor;
      const hoeveelheid = Math.round(ruw * 1e6) / 1e6; // 0.35000000000000003 → 0.35
      if (hoeveelheid > 0) return { eenheid, hoeveelheid };
    }
    if (/^per stuk$|^1 stuk$/.test(t.trim())) return { eenheid: 'stuk', hoeveelheid: 1 };
  }
  return null;
}

/** Prijs per kilo/liter/stuk, of null. */
export function prijsPerEenheid(prijs, maat, naam) {
  const m = leesMaat(maat, naam);
  if (!m || !prijs) return null;
  return { eenheid: m.eenheid, prijs: Math.round((prijs / m.hoeveelheid) * 100) / 100 };
}

// --- de vergelijking zelf ------------------------------------------------------------------------

/** Is een aanbieding vandaag geldig (en niet alleen online)? */
export function geldigOp(a, datum) {
  if (a.alleen === 'online') return false;
  if (a.geldig_van && a.geldig_van > datum) return false;
  if (a.geldig_tot && a.geldig_tot < datum) return false;
  return true;
}

/**
 * Alles voor één boodschap: aanbiedingen die er nu zijn, en per winkel het goedkoopste product
 * (per kilo/liter/stuk) uit het gewone assortiment.
 * `producten`: [{ winkel, naam, prijs, maat }]
 */
export function vergelijk(zoekterm, { aanbiedingen = [], producten = [], datum }) {
  const scorer = maakScorer(zoekterm);
  // Aanbiedingen: alles wat past, beste treffers eerst.
  const acties = aanbiedingen
    .filter((a) => geldigOp(a, datum))
    .map((a) => ({ ...a, score: scorer((a._w ??= woorden(`${a.merk ?? ''} ${a.titel}`))) }))
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score || a.winkel.localeCompare(b.winkel) || (a.actieprijs ?? 99) - (b.actieprijs ?? 99));

  // Gewone prijzen: alleen producten die echt over het gezochte product gaan, anders vergelijk je
  // melk met chocolademelk. Liefst score 3; zijn dat er te weinig, dan ook score 2.
  const kandidaten = producten
    .map((p) => ({ ...p, score: scorer((p._w ??= woorden(p.naam))) }))
    .filter((p) => p.score >= 2)
    .map((p) => ({ ...p, perEenheid: prijsPerEenheid(p.prijs, p.maat, p.naam) }))
    .filter((p) => p.perEenheid);
  const zuiver = kandidaten.filter((p) => p.score === 3);
  const treffers = new Set(zuiver.map((p) => p.winkel)).size >= 2 ? zuiver : kandidaten;

  // Vergelijk alleen in de eenheid die het vaakst voorkomt (melk: liter, kaas: kilo, eieren: stuk).
  const telling = {};
  for (const t of treffers) telling[t.perEenheid.eenheid] = (telling[t.perEenheid.eenheid] ?? 0) + 1;
  const eenheid = Object.entries(telling).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const vergelijkbaar = treffers.filter((t) => t.perEenheid.eenheid === eenheid);

  // Fouten in de brondata (kaas voor €0,27 per kilo) eruit: veel goedkoper dan de mediaan kan niet kloppen.
  const prijzen = vergelijkbaar.map((t) => t.perEenheid.prijs).sort((a, b) => a - b);
  const mediaan = prijzen[Math.floor(prijzen.length / 2)] ?? 0;
  const ondergrens = mediaan * 0.25;

  const perWinkel = {};
  for (const t of vergelijkbaar) {
    if (t.perEenheid.prijs < ondergrens) continue;
    const huidig = perWinkel[t.winkel];
    if (!huidig || t.perEenheid.prijs < huidig.perEenheid.prijs) perWinkel[t.winkel] = t;
  }
  const goedkoopst = Object.values(perWinkel).sort((a, b) => a.perEenheid.prijs - b.perEenheid.prijs);

  return { zoekterm, acties, goedkoopst, eenheid, aantalTreffers: vergelijkbaar.length };
}
