import { test } from 'node:test';
import assert from 'node:assert/strict';
import { score, leesMaat, prijsPerEenheid, geldigOp, vergelijk } from '../app/zoeken.js';
import { verwerk } from '../src/prijzen.js';

test('score: het gezochte product, niet iets waar het woord in voorkomt', () => {
  assert.equal(score('melk', 'Jumbo Halfvolle Melk 2 L'), 3);
  assert.equal(score('appels', 'Elstar appels'), 3);
  assert.equal(score('tomaten', 'Trostomaat'), 3); // meervoud → enkelvoud, als laatste deel van een samenstelling
  assert.equal(score('eieren', 'Scharreleieren 12 stuks'), 3);
  assert.equal(score('kipfilet', 'Kipfilet Americanos'), 1); // er komt nog iets achter
  // Geen treffer
  assert.equal(score('melk', 'Chocolademelk'), 0);
  assert.equal(score('melk', 'Melkchocolade'), 0);
  assert.equal(score('kaas', 'Calvé pindakaas'), 0);
  assert.equal(score('kaas', 'Philadelphia roomkaas'), 0);
  assert.equal(score('appels', 'Perssinaasappels'), 0);
  assert.equal(score('ei', 'Spaghetti met ei'), 0);
  assert.equal(score('brood', 'Halvarine op brood'), 0);
});

test('leesMaat en prijs per eenheid', () => {
  assert.deepEqual(leesMaat('1,5 l'), { eenheid: 'l', hoeveelheid: 1.5 });
  assert.deepEqual(leesMaat('3 x 200 ml'), { eenheid: 'l', hoeveelheid: 0.6 });
  assert.deepEqual(leesMaat('Per 350 g'), { eenheid: 'kg', hoeveelheid: 0.35 });
  assert.deepEqual(leesMaat('', 'Halfvolle Melk 2 L'), { eenheid: 'l', hoeveelheid: 2 });
  assert.deepEqual(leesMaat('per stuk'), { eenheid: 'stuk', hoeveelheid: 1 });
  assert.equal(leesMaat('los', 'Bloemkool'), null);
  assert.deepEqual(prijsPerEenheid(1.45, '2 L'), { eenheid: 'l', prijs: 0.73 });
});

test('geldigOp: geen online-acties, alleen binnen de looptijd', () => {
  const a = { geldig_van: '2026-11-09', geldig_tot: '2026-11-15', alleen: null };
  assert.equal(geldigOp(a, '2026-11-09'), true);
  assert.equal(geldigOp(a, '2026-11-16'), false);
  assert.equal(geldigOp(a, '2026-11-08'), false);
  assert.equal(geldigOp({ ...a, alleen: 'online' }, '2026-11-10'), false);
});

test('vergelijk: aanbiedingen en goedkoopste gewone prijs per winkel', () => {
  const aanbiedingen = [
    { winkel: 'jumbo', titel: 'Halfvolle melk', actie: '2 voor 2,00', actieprijs: 2, aantal: 2, geldig_van: '2026-11-09', geldig_tot: '2026-11-15' },
    { winkel: 'ah', titel: 'Chocolademelk', actie: '1+1 gratis', geldig_van: '2026-11-09', geldig_tot: '2026-11-15' },
    { winkel: 'lidl', titel: 'Volle melk', actie: '-20%', geldig_van: '2026-11-16', geldig_tot: '2026-11-22' }, // volgende week
  ];
  const producten = [
    { winkel: 'ah', naam: 'AH Halfvolle melk', prijs: 1.19, maat: '1 l' },
    { winkel: 'ah', naam: 'AH Halfvolle melk', prijs: 2.09, maat: '2 l' },
    { winkel: 'jumbo', naam: 'Jumbo Halfvolle Melk', prijs: 1.45, maat: '2 L' },
    { winkel: 'jumbo', naam: 'Jumbo Chocolademelk', prijs: 0.99, maat: '1 l' },
    { winkel: 'lidl', naam: 'Magere melk', prijs: 0.02, maat: '1 l' }, // fout in de brondata
  ];
  const r = vergelijk('melk', { aanbiedingen, producten, datum: '2026-11-10' });
  assert.deepEqual(r.acties.map((a) => a.titel), ['Halfvolle melk']);
  assert.equal(r.eenheid, 'l');
  assert.deepEqual(
    r.goedkoopst.map((p) => [p.winkel, p.perEenheid.prijs]),
    [['jumbo', 0.73], ['ah', 1.05]],
  );
});

test('verwerk: Checkjebon-data naar [winkel, naam, prijs, maat]', () => {
  const ruw = [
    { n: 'ah', d: [{ n: 'AH Melk', p: 1.19, s: '1 l' }, { n: 'Bloemkool', p: 1.5, s: 'per stuk' }, { n: 'Zonder maat', p: 2 }] },
    { n: 'plus', d: [{ n: 'Plus Melk', p: 1.1, s: '1 l' }] }, // geen winkel in Leek
    { n: 'jumbo', d: [{ n: 'Gratis', p: 0, s: '1 l' }] },
  ];
  assert.deepEqual(verwerk(ruw), {
    producten: [['ah', 'AH Melk', 1.19, '1 l'], ['ah', 'Bloemkool', 1.5, 'per stuk']],
    perWinkel: { ah: 2, jumbo: 0 },
  });
});
