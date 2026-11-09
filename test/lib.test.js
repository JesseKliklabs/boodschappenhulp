import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dagEerder, isoWeek, nuxtData, objectNa, opschonen, parseVoorActie, weekGrenzen } from '../src/lib.js';
import { parse as parseLidl } from '../src/winkels/lidl.js';
import { leesEtiket, leesPagina } from '../src/winkels/ah.js';
import { actieTekst } from '../src/winkels/poiesz.js';
import { parse as parseAldi } from '../src/winkels/aldi.js';

test('parseVoorActie herkent "N voor X" en "voor X"', () => {
  assert.deepEqual(parseVoorActie('2 voor 3,99'), { aantal: 2, prijs: 3.99 });
  assert.deepEqual(parseVoorActie('voor 1,49'), { aantal: 1, prijs: 1.49 });
  assert.deepEqual(parseVoorActie('2 VOOR 5'), { aantal: 2, prijs: 5 });
  assert.equal(parseVoorActie('1+1 gratis'), null);
  assert.equal(parseVoorActie('25% korting'), null);
});

test('opschonen haalt HTML weg', () => {
  assert.equal(opschonen('Set à 4<br />M.u.v. X'), 'Set à 4 · M.u.v. X');
  assert.equal(opschonen('  <b>a</b>  b '), 'a b');
  assert.equal(opschonen(''), null);
});

test('dagEerder', () => {
  assert.equal(dagEerder('2026-11-15'), '2026-11-14');
  assert.equal(dagEerder('2026-03-01'), '2026-02-28');
});

test('nuxtData pakt devalue-formaat uit, inclusief wrappers en gedeelde verwijzingen', () => {
  const plat = [['ShallowReactive', 1], { data: 2, twee: 3 }, { lijst: 4 }, 3, [5, 5], { titel: 6 }, 'Druiven'];
  const html = `<script type="application/json" id="__NUXT_DATA__">${JSON.stringify(plat)}</script>`;
  const d = nuxtData(html);
  assert.equal(d.data.lijst[0].titel, 'Druiven');
  assert.equal(d.data.lijst[0], d.data.lijst[1]);
});

test('Poiesz-actieteksten', () => {
  assert.deepEqual(actieTekst({ offerTypeLine1: '2', offerTypeLine2: 'VOOR', newPriceLow: 2.5, newPriceHigh: 2.5 }), {
    actie: '2 voor €2,50', actieprijs: 2.5, aantal: 2,
  });
  assert.equal(actieTekst({ offerTypeLine1: 'PER', offerTypeLine2: 'ZAK', newPriceLow: 2, newPriceHigh: 2 }).actie, '€2,00 per zak');
  assert.equal(actieTekst({ offerTypeLine1: '500', offerTypeLine2: 'GRAM', newPriceLow: 7.99 }).actie, '€7,99 per 500 gram');
  const gratis = actieTekst({ offerTypeLine1: '1+1', offerTypeLine2: 'GRATIS', newPriceLow: 1.29, newPriceHigh: 3.49 });
  assert.equal(gratis.actie, '1+1 gratis (€1,29 - €3,49)');
  assert.equal(gratis.actieprijs, null);
});

test('Aldi: startdatum-label is geen actie, doorgestreepte prijs wordt normaalprijs', () => {
  const api = [['OFFER_GET', { res: {
    algoliaDataMap: {
      1: { objectID: '1', name: 'Avocado', salesUnit: '700 g', currentPrice: { priceValue: 2.39, strikePrice: { strikePriceValue: 2.79 }, priceTagLabels: { promoText1: '-14%' } } },
      2: { objectID: '2', name: 'Kerstster', currentPrice: { priceValue: 3.99, priceTagLabels: { promoText1: 'v.a. wo. 11.11.' } } },
    },
    categories: [{ startDate: '2026-11-11', endDate: '2026-11-15', content: [{ title: 'Bloemen', productIds: ['2'] }] }],
  } }]];
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { apiData: JSON.stringify(api) } } })}</script>`;
  const [avocado, kerstster] = parseAldi(html);
  assert.equal(avocado.actie, '-14%');
  assert.equal(avocado.normaalprijs, 2.79);
  assert.equal(kerstster.actie, null);
  assert.equal(kerstster.geldig_van, '2026-11-11');
  assert.equal(kerstster.categorie, 'Bloemen');
});

test('Lidl: tegels uit data-grid-data, korting en vaste lage prijs', () => {
  const tegel = (t) => `<div data-grid-data="${JSON.stringify(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></div>`;
  const html =
    tegel({ productId: 1, fullTitle: '- Chips paprika', canonicalUrl: '/p/chips/p1', regionsPrices: { nl: { currentPrice: {
      price: 1.29, oldPrice: 1.79, discount: { discountText: '28% korting' }, packaging: { text: '300 g' },
      startDate: '2026-11-08T23:00:00Z', endDate: '2026-11-15T22:59:59Z' } } } }) +
    tegel({ productId: 2, fullTitle: 'Halfvolle melk', regionsPrices: { nl: { currentPrice: {
      price: 0.99, oldPrice: 1.09, startDate: '2026-11-08T23:00:00Z', endDate: '2200-01-01T00:00:00Z' } } } }) +
    tegel({ productId: 1, fullTitle: 'dubbel' });
  const [chips, melk, ...rest] = parseLidl(html);
  assert.equal(rest.length, 0);
  assert.equal(chips.titel, 'Chips paprika');
  assert.equal(chips.actie, '28% korting');
  assert.equal(chips.geldig_van, '2026-11-09');
  assert.equal(chips.geldig_tot, '2026-11-15');
  assert.equal(chips.url, 'https://www.lidl.nl/p/chips/p1');
  assert.equal(melk.actie, 'nieuwe lage prijs');
  assert.equal(melk.geldig_tot, null);
});

test('AH: weeknummers en folderdata', () => {
  assert.deepEqual(isoWeek('2026-11-09'), { week: 46, jaar: 2026 });
  assert.deepEqual(isoWeek('2027-01-03'), { week: 53, jaar: 2026 });
  assert.deepEqual(isoWeek('2027-01-04'), { week: 1, jaar: 2027 });
  assert.deepEqual(weekGrenzen('2026-11-15', 1), { maandag: '2026-11-16', zondag: '2026-11-22' });
  const js = 'var x = 1; var data = {"slug":"bonus-week-46-2026","numPages":42,"t":"a } \\" {","config":{"downloadPdfUrl":"https://x/y.pdf"}}; var z = {};';
  const data = objectNa(js, 'var data =');
  assert.equal(data.config.downloadPdfUrl, 'https://x/y.pdf');
  assert.equal(data.numPages, 42);
  assert.equal(objectNa(js, 'var bestaatniet ='), null);
});

// Tekst-element zoals uit de PDF: x, y (onderkant, van boven gemeten), lettergrootte h, breedte w.
const t = (str, x, y, h, w = str.length * h * 0.5) => ({ str, x, y, h, w });

test('AH-etiket: gesplitste prijs, doorgestreepte prijs en acties', () => {
  // "2 stuks" boven een dikke "2." + "99", met klein doorgestreept "5.38" ernaast
  const focaccia = leesEtiket([t('2 stuks', 300, 180, 15), t('99', 340, 220, 40), t('2.', 290, 250, 75, 50), t('5.38', 345, 245, 12)]);
  assert.equal(focaccia.actie, '2 voor 2.99');
  assert.equal(focaccia.actieprijs, 2.99);
  assert.equal(focaccia.aantal, 2);
  assert.equal(focaccia.normaalprijs, 5.38);
  assert.equal(leesEtiket([t('1+1', 300, 100, 40), t('gratis', 300, 125, 24)]).actie, '1+1 gratis');
  assert.equal(leesEtiket([t('25%', 300, 100, 40), t('korting', 300, 125, 24)]).actie, '25% korting');
  assert.equal(leesEtiket([t('2', 300, 100, 55), t('e', 330, 80, 32), t('halve prijs', 290, 120, 17)]).actie, '2e halve prijs');
  assert.equal(leesEtiket([t('€2', 300, 100, 40), t('korting', 300, 125, 24)]).actie, '€2 korting');
});

test('AH-pagina: naam wordt aan het dichtstbijzijnde etiket gekoppeld, kleine lettertjes genegeerd', () => {
  const items = [
    t('Alle AH', 28, 140, 10), t('Pangasius', 28, 151, 10), t('De actieprijzen', 28, 162, 9), t('variëren van', 28, 172, 9), t('8.47-14.49', 28, 182, 9),
    t('25%', 103, 168, 40, 80), t('korting', 105, 190, 24, 70),
    t('Alle Mutti', 217, 588, 10), t('De actieprijzen', 217, 598, 9), t('variëren van', 217, 608, 9), t('2.38-7.48', 217, 618, 9),
    t('2', 308, 583, 55, 30), t('e', 341, 561, 32, 15), t('halve prijs', 293, 602, 17, 80),
    t('Voor 1+1 gratis geldt: per combinatie kan de prijs verschillen.', 20, 840, 6),
  ];
  const [pangasius, mutti, ...rest] = leesPagina(items);
  assert.equal(rest.length, 0);
  assert.equal(pangasius.titel, 'Alle AH Pangasius');
  assert.equal(pangasius.actie, '25% korting');
  assert.match(pangasius.omschrijving, /8\.47-14\.49/);
  assert.equal(mutti.titel, 'Alle Mutti');
  assert.equal(mutti.actie, '2e halve prijs');
});
