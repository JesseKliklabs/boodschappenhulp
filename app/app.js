// Boodschappenhulp Leek: een lijstje boodschappen → per boodschap de beste aanbieding en de goedkoopste
// gewone prijs. In de winkel kun je afvinken.
import { vergelijk, prijsPerEenheid, woorden, maakScorer, geldigOp } from './zoeken.js';
import { maakWoordenboek, suggesties, bedoeldeTerm } from './suggesties.js';

const WINKELS = {
  ah: 'Albert Heijn',
  jumbo: 'Jumbo',
  lidl: 'Lidl',
  aldi: 'Aldi',
  poiesz: 'Poiesz',
};
const PER = { kg: 'kilo', l: 'liter', stuk: 'stuk', rol: 'rol', wasbeurt: 'wasbeurt' };
const VOORBEELDEN = ['melk', 'brood', 'eieren', 'kaas', 'koffie', 'appels', 'kipfilet', 'wc-papier'];
const OPSLAG = 'boodschappen-lijst-v1';
const OPSLAG_VINK = 'boodschappen-afgevinkt-v1';

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const veiligeUrl = (u) => (/^https:\/\//i.test(u ?? '') ? u : null);
const euro = (n) => `€ ${n.toFixed(2).replace('.', ',')}`;
const vandaag = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
const kaal = (s) => String(s).toLowerCase().replace(/\s+/g, '');
const metHoofdletter = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const datumTekst = (iso, opties) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('nl-NL', { timeZone: 'Europe/Amsterdam', ...opties });
const totTekst = (a) =>
  a.geldig_tot ? `t/m ${datumTekst(a.geldig_tot, { weekday: 'short', day: 'numeric', month: 'short' })}` : '';

// --- de lijst bewaren op de telefoon ---------------------------------------------------------------

function laad(sleutel) {
  try {
    const l = JSON.parse(localStorage.getItem(sleutel) ?? '[]');
    return Array.isArray(l) ? l.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function bewaar() {
  try {
    localStorage.setItem(OPSLAG, JSON.stringify(lijst));
    localStorage.setItem(OPSLAG_VINK, JSON.stringify([...afgevinkt]));
  } catch {
    /* privévenster of opslag vol: de lijst werkt gewoon, alleen niet na herladen */
  }
}

let lijst = laad(OPSLAG);
let afgevinkt = new Set(laad(OPSLAG_VINK).filter((t) => lijst.includes(t)));
let data = null; // { aanbiedingen, producten, opgehaald, boek }
const uitkomsten = new Map(); // zoekterm → resultaat van vergelijk()
const open = new Set(); // boodschappen waarvan "alles bekijken" openstaat

// --- gegevens ophalen ------------------------------------------------------------------------------

async function haalJson(pad) {
  const r = await fetch(pad, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${pad}: ${r.status}`);
  return r.json();
}

async function laadData() {
  const [acties, prijzen] = await Promise.allSettled([
    haalJson('../data/aanbiedingen.json'),
    haalJson('../data/prijzen.json'),
  ]);
  if (acties.status === 'rejected') throw acties.reason;
  data = {
    aanbiedingen: acties.value.aanbiedingen ?? [],
    opgehaald: acties.value.datum ?? acties.value.opgehaald_op?.slice(0, 10),
    producten:
      prijzen.status === 'fulfilled'
        ? prijzen.value.producten.map(([winkel, naam, prijs, maat]) => ({ winkel, naam, prijs, maat }))
        : [],
  };
  // Woorden alvast splitsen (zoeken.js gebruikt _w) en daaruit de woordenlijst voor suggesties maken.
  for (const p of data.producten) p._w = woorden(p.naam);
  for (const a of data.aanbiedingen) a._w = woorden(`${a.merk ?? ''} ${a.titel}`);
  data.boek = maakWoordenboek([...data.producten, ...data.aanbiedingen].map((x) => x._w));
  uitkomsten.clear();
}

function uitkomst(term) {
  if (!uitkomsten.has(term)) {
    const r = vergelijk(term, { aanbiedingen: data.aanbiedingen, producten: data.producten, datum: vandaag() });
    // Dezelfde aanbieding staat soms twee keer in een folder.
    const gezien = new Set();
    r.acties = r.acties.filter((a) => {
      const k = `${a.winkel}|${a.merk ?? ''}|${a.titel}|${a.actie}`.toLowerCase();
      return gezien.has(k) ? false : gezien.add(k);
    });
    // Eerst wat echt over dit product gaat (score 2-3), dan de rest.
    r.acties = [...r.acties.filter((a) => a.score >= 2), ...r.acties.filter((a) => a.score < 2)];
    uitkomsten.set(term, r);
  }
  return uitkomsten.get(term);
}

// --- stukjes HTML ----------------------------------------------------------------------------------

const winkelLabel = (w) => `<span class="winkel winkel--${esc(w)}">${esc(WINKELS[w] ?? w)}</span>`;

/** "2 voor € 2,99" als dat niet al in de actietekst staat, plus de prijs per liter/kilo. */
function actiePrijzen(a, r) {
  const bedrag = a.actieprijs?.toFixed(2);
  const inTekst = bedrag && [bedrag, bedrag.replace('.', ',')].some((b) => String(a.actie).includes(b));
  const prijs = a.actieprijs != null && !inTekst
    ? `<span class="actieprijs">${a.aantal > 1 ? `${a.aantal} voor ` : ''}${euro(a.actieprijs)}</span>`
    : '';
  let per = '';
  if (a.actieprijs && r.eenheid) {
    const p = prijsPerEenheid(a.actieprijs / (a.aantal || 1), a.omschrijving, a.titel);
    if (p?.eenheid === r.eenheid) per = `<span class="per">${euro(p.prijs)} per ${PER[p.eenheid]}</span>`;
  }
  return prijs || per ? `<p class="actie-prijs">${prijs}${per}</p>` : '';
}

function actieHtml(a, r) {
  const titel = [a.merk, a.titel].filter(Boolean).join(' ');
  const url = veiligeUrl(a.url);
  const alleen = a.alleen === 'winkel' ? ' · alleen in de winkel' : a.alleen === 'slijterij' ? ' · bij de slijterij' : '';
  return `<li class="actie">
    <div class="actie-kop">${winkelLabel(a.winkel)}<span class="sticker">${esc(a.actie || 'aanbieding')}</span></div>
    <p class="actie-naam">${esc(titel)}</p>
    ${a.omschrijving ? `<p class="klein">${esc(a.omschrijving)}</p>` : ''}
    ${actiePrijzen(a, r)}
    <p class="klein">${esc(totTekst(a) + alleen)}${url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener">bekijk</a>` : ''}</p>
  </li>`;
}

/** Zoals op een schapkaartje: "2 L · € 0,73 per liter" (de maat alleen als die niet al in de naam staat). */
function kiloprijs(p) {
  const maat = p.maat && !kaal(p.naam).includes(kaal(p.maat)) ? `${esc(p.maat).replace(/ /g, ' ')} · ` : '';
  return `${maat}<span class="nowrap">${euro(p.perEenheid.prijs)} per ${PER[p.perEenheid.eenheid]}</span>`;
}

function prijsRegel(p, i) {
  return `<li class="prijs${i === 0 ? ' prijs--beste' : ''}">
    <div class="prijs-kop">${winkelLabel(p.winkel)}<span class="prijs-per">${euro(p.prijs)}</span></div>
    <p class="prijs-naam">${esc(p.naam)}</p>
    <p class="klein">${kiloprijs(p)}</p>
  </li>`;
}

/** Linkervak: de beste aanbieding. */
function vakActie(r) {
  const a = r.acties[0];
  if (!a) return `<section class="vak vak--leeg"><h3>Aanbieding</h3><p class="niets">Deze week nergens in de aanbieding</p></section>`;
  return `<section class="vak vak--actie">
    <h3>Aanbieding</h3>
    ${winkelLabel(a.winkel)}
    <p class="sticker sticker--groot">${esc(a.actie || 'aanbieding')}</p>
    <p class="vak-naam">${esc([a.merk, a.titel].filter(Boolean).join(' '))}</p>
    ${actiePrijzen(a, r)}
    <p class="klein">${esc(totTekst(a))}</p>
  </section>`;
}

/** Rechtervak: normaal het goedkoopst. */
function vakNormaal(r) {
  const p = r.goedkoopst[0];
  if (!data.producten.length || !p)
    return `<section class="vak vak--leeg"><h3>Normaal goedkoopst</h3><p class="niets">${
      data.producten.length ? 'Geen gewone prijs gevonden' : 'Gewone prijzen niet geladen'
    }</p></section>`;
  return `<section class="vak vak--normaal">
    <h3>Normaal goedkoopst</h3>
    ${winkelLabel(p.winkel)}
    <p class="vak-prijs">${euro(p.prijs)}</p>
    <p class="vak-naam">${esc(p.naam)}</p>
    <p class="klein">${kiloprijs(p)}</p>
  </section>`;
}

function kaartHtml(term, index) {
  const vink = `<button type="button" class="vink" data-vink="${esc(term)}" aria-pressed="${afgevinkt.has(term)}"
      aria-label="${esc(term)} ${afgevinkt.has(term) ? 'is in je mandje, tik om terug te zetten' : 'afvinken'}"></button>`;
  const weg = `<button type="button" class="weg" data-weg="${esc(term)}" aria-label="${esc(term)} van de lijst halen">✕</button>`;

  if (afgevinkt.has(term))
    return `<article class="kaart kaart--klaar" style="--i:${index}">
      <header class="kaart-kop">${vink}<h2>${esc(metHoofdletter(term))}</h2>${weg}</header>
    </article>`;

  const r = uitkomst(term);
  if (!r.acties.length && !r.goedkoopst.length) {
    const b = bedoeldeTerm(data.boek, term);
    return `<article class="kaart" style="--i:${index}">
      <header class="kaart-kop">${vink}<h2>${esc(metHoofdletter(term))}</h2>${weg}</header>
      ${b
        ? `<p class="bedoeld">Niets gevonden. Bedoelde je…</p>
           <button type="button" class="bedoeld-knop" data-vervang="${esc(term)}" data-door="${esc(b)}">${esc(b)}?</button>`
        : '<p class="niets">Niets gevonden. Probeer een ander of korter woord, bijvoorbeeld "kaas" in plaats van "Goudse".</p>'}
    </article>`;
  }
  const nActies = r.acties.length;
  const nPrijzen = r.goedkoopst.length;
  const meer = nActies > 1 || nPrijzen > 1;
  const delen = [
    nActies ? `${nActies} ${nActies === 1 ? 'aanbieding' : 'aanbiedingen'}` : '',
    nPrijzen ? `${nPrijzen} winkels` : '',
  ].filter(Boolean).join(', ');

  return `<article class="kaart" style="--i:${index}">
    <header class="kaart-kop">${vink}<h2>${esc(metHoofdletter(term))}</h2>${weg}</header>
    <div class="duo">${vakActie(r)}${vakNormaal(r)}</div>
    ${meer ? `<details class="meer" data-meer="${esc(term)}"${open.has(term) ? ' open' : ''}>
      <summary>Alles bekijken <span class="klein">(${delen})</span></summary>
      ${nActies ? `<h3 class="kopje">Alle aanbiedingen</h3><ul class="acties">${r.acties.map((a) => actieHtml(a, r)).join('')}</ul>` : ''}
      ${nPrijzen ? `<h3 class="kopje">Gewone prijs per winkel, goedkoopste eerst</h3><ol class="prijzen">${r.goedkoopst.map(prijsRegel).join('')}</ol>` : ''}
    </details>` : ''}
  </article>`;
}

/** Bovenaan: welke winkel past het best bij wat je nog moet halen? */
function overzichtHtml(nogTeHalen) {
  const telling = {};
  for (const w of Object.keys(WINKELS)) telling[w] = { acties: 0, goedkoopst: 0, boodschappen: new Set() };
  for (const term of nogTeHalen) {
    const r = uitkomst(term);
    for (const w of new Set(r.acties.filter((a) => a.score >= 2).map((a) => a.winkel))) {
      telling[w].acties++;
      telling[w].boodschappen.add(term);
    }
    if (r.goedkoopst[0]) {
      telling[r.goedkoopst[0].winkel].goedkoopst++;
      telling[r.goedkoopst[0].winkel].boodschappen.add(term);
    }
  }
  const rijen = Object.entries(telling)
    .filter(([, t]) => t.boodschappen.size)
    .sort((a, b) => b[1].boodschappen.size - a[1].boodschappen.size || b[1].acties - a[1].acties);
  if (!rijen.length) return '';

  const uitleg = (t) =>
    [t.acties ? `${t.acties} in de aanbieding` : '', t.goedkoopst ? `${t.goedkoopst}× normaal het goedkoopst` : '']
      .filter(Boolean).join(' · ');
  const [[beste, b], ...rest] = rijen;
  return `<h2 id="overzicht-titel">Waar kun je het beste heen?</h2>
    <div class="beste-winkel">
      ${winkelLabel(beste)}
      <p><strong>${b.boodschappen.size} van je ${nogTeHalen.length} boodschappen</strong> zijn daar in de aanbieding of het goedkoopst.</p>
      <p class="klein">${uitleg(b)}</p>
    </div>
    ${rest.length ? `<ul>${rest.map(([w, t]) => `<li>${winkelLabel(w)}<span class="klein">${uitleg(t)}</span></li>`).join('')}</ul>` : ''}`;
}

function teken() {
  $('wissen').hidden = !lijst.length;
  $('voorbeelden').hidden = lijst.length > 0 || !data;
  if (!data) return;

  // Afgevinkte boodschappen zakken naar onderen.
  const nog = lijst.filter((t) => !afgevinkt.has(t));
  const klaar = lijst.filter((t) => afgevinkt.has(t));
  $('lijst').innerHTML =
    nog.map(kaartHtml).join('') +
    (klaar.length ? `<h2 class="mandje">In je mandje <span class="aantal">${klaar.length}</span></h2>${klaar.map(kaartHtml).join('')}` : '');

  const overzicht = nog.length >= 2 ? overzichtHtml(nog) : '';
  $('overzicht').innerHTML = overzicht;
  $('overzicht').hidden = !overzicht;
}

function tekenVoorbeelden() {
  $('voorbeelden').innerHTML = `<p>Tik om te proberen:</p>
    <div class="knoppen">${VOORBEELDEN.map((v) => `<button type="button" data-voorbeeld="${esc(v)}">${esc(v)}</button>`).join('')}</div>`;
}

// --- bediening ---------------------------------------------------------------------------------------

function voegToe(tekst) {
  const nieuw = tekst
    .split(/\s*(?:[,;\n]|\s+en\s+)\s*/i)
    .map((t) => t.trim().toLowerCase())
    .filter((t, i, alle) => t && !lijst.includes(t) && alle.indexOf(t) === i);
  if (!nieuw.length) return;
  lijst = [...nieuw, ...lijst]; // nieuwe bovenaan (in de volgorde waarin je ze typte)
  bewaar();
  teken();
}

$('invoer').addEventListener('submit', (e) => {
  e.preventDefault();
  const veld = $('wat');
  voegToe(veld.value);
  veld.value = '';
  verbergSuggesties();
  veld.blur(); // toetsenbord weg, zodat het resultaat in beeld komt
  $('overzicht').hidden ? $('lijst').scrollIntoView({ behavior: 'smooth' }) : $('overzicht').scrollIntoView({ behavior: 'smooth' });
});

document.addEventListener('click', (e) => {
  const knop = e.target.closest('[data-weg], [data-vink], [data-voorbeeld], [data-vervang], [data-kies]');
  if (!knop) return;
  const { weg, vink, voorbeeld, vervang, door, kies } = knop.dataset;
  if (voorbeeld) return voegToe(voorbeeld);
  if (kies) return kiesSuggestie(kies);
  if (vervang) {
    lijst = lijst.includes(door) ? lijst.filter((t) => t !== vervang) : lijst.map((t) => (t === vervang ? door : t));
    afgevinkt.delete(vervang);
  } else if (weg) {
    lijst = lijst.filter((t) => t !== weg);
    afgevinkt.delete(weg);
  } else if (vink) {
    afgevinkt.has(vink) ? afgevinkt.delete(vink) : afgevinkt.add(vink);
  }
  bewaar();
  teken();
});

// Onthoud welke "Alles bekijken" open staan, zodat afvinken ze niet dichtklapt.
document.addEventListener('toggle', (e) => {
  const t = e.target.dataset?.meer;
  if (t) e.target.open ? open.add(t) : open.delete(t);
}, true);

$('wissen').addEventListener('click', () => {
  if (!confirm('Weet je zeker dat je de hele lijst wilt leegmaken?')) return;
  lijst = [];
  afgevinkt = new Set();
  bewaar();
  teken();
});

// --- suggesties tijdens het typen ------------------------------------------------------------------

/** Het stuk dat nu getypt wordt: na de laatste komma. */
const huidigStuk = (tekst) => tekst.split(/[,;]/).at(-1);

/** Is er vandaag een aanbieding voor dit woord? */
function inAanbieding(term) {
  const scorer = maakScorer(term);
  const dag = vandaag();
  return data.aanbiedingen.some((a) => geldigOp(a, dag) && scorer(a._w) >= 2);
}

function toonSuggesties() {
  const veld = $('wat');
  const stuk = huidigStuk(veld.value).trim();
  const lijstEl = $('suggesties');
  if (!data || woorden(stuk).join('').length < 2) return verbergSuggesties();
  const s = suggesties(data.boek, stuk, 6);
  if (!s.length) return verbergSuggesties();

  const getypt = woorden(stuk).join(' ');
  const opmaak = (w) =>
    w.startsWith(getypt) ? `${esc(getypt)}<b>${esc(w.slice(getypt.length))}</b>` : `<b>${esc(w)}</b>`;
  const bedoeld = s[0].soort === 'bedoeld';
  lijstEl.innerHTML =
    (bedoeld ? '<li class="sugg-kop">Bedoelde je…</li>' : '') +
    s.map(({ woord }) => `<li><button type="button" data-kies="${esc(woord)}">
        <span class="sugg-woord">${opmaak(woord)}</span>
        ${inAanbieding(woord) ? '<span class="sugg-actie">in de aanbieding</span>' : ''}
      </button></li>`).join('');
  lijstEl.hidden = false;
  veld.setAttribute('aria-expanded', 'true');
}

function verbergSuggesties() {
  $('suggesties').hidden = true;
  $('suggesties').innerHTML = '';
  $('wat').setAttribute('aria-expanded', 'false');
}

function kiesSuggestie(woord) {
  const veld = $('wat');
  const delen = veld.value.split(/[,;]/);
  delen[delen.length - 1] = woord;
  voegToe(delen.join(','));
  veld.value = '';
  verbergSuggesties();
  veld.blur();
  ($('overzicht').hidden ? $('lijst') : $('overzicht')).scrollIntoView({ behavior: 'smooth' });
}

let wachten;
$('wat').addEventListener('input', () => {
  clearTimeout(wachten);
  wachten = setTimeout(toonSuggesties, 80);
});
$('wat').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') verbergSuggesties();
});
// Tik je ergens anders, dan gaan de suggesties weg.
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('#invoer')) verbergSuggesties();
});

// --- opstarten ---------------------------------------------------------------------------------------

function isoWeek(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - jan4) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
}

function begroeting() {
  const uur = Number(new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', hour: 'numeric', hour12: false }));
  if (uur < 6) return 'Goedenacht!';
  if (uur < 12) return 'Goedemorgen!';
  if (uur < 18) return 'Goedemiddag!';
  return 'Goedenavond!';
}

async function start() {
  const dag = vandaag();
  $('groet').textContent = begroeting();
  $('week').textContent = `Het is ${datumTekst(dag, { weekday: 'long', day: 'numeric', month: 'long' })}, week ${isoWeek(dag)}.`;
  tekenVoorbeelden();
  try {
    await laadData();
  } catch {
    $('status').textContent = 'De prijzen konden niet worden geladen. Heb je internet? Probeer het straks opnieuw.';
    $('status').classList.add('status--fout');
    return;
  }
  const oud = data.opgehaald && data.opgehaald < dag;
  $('status').textContent = oud
    ? `Let op: de aanbiedingen zijn van ${datumTekst(data.opgehaald, { weekday: 'long', day: 'numeric', month: 'long' })}.`
    : '';
  if (data.opgehaald)
    $('bijgewerkt').textContent = `Bijgewerkt op ${datumTekst(data.opgehaald, { weekday: 'long', day: 'numeric', month: 'long' })}.`;
  teken();
}

start();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
