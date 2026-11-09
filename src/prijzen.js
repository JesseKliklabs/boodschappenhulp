// Gewone (niet-actie)prijzen uit de open dataset van Checkjebon (github.com/supermarkt/checkjebon),
// die dagelijks het assortiment van de grote ketens bijhoudt. Wij bewaren alleen de winkels in Leek
// en alleen producten waarvan we de verpakkingsmaat kennen (anders kun je niet per kilo/liter vergelijken).
import { haal } from './lib.js';
import { leesMaat } from '../app/zoeken.js';

export const BRON = 'https://raw.githubusercontent.com/supermarkt/checkjebon/main/data/supermarkets.json';
export const WINKELS = ['ah', 'jumbo', 'lidl', 'poiesz']; // Aldi zit (nog) niet in Checkjebon

/** Zet de Checkjebon-data om naar ons compacte formaat: [winkel, naam, prijs, maat]. */
export function verwerk(ruw) {
  const producten = [];
  const perWinkel = {};
  for (const winkel of ruw) {
    if (!WINKELS.includes(winkel.n)) continue;
    let aantal = 0;
    for (const p of winkel.d ?? []) {
      if (!p.n || !(p.p > 0) || !leesMaat(p.s, p.n)) continue;
      producten.push([winkel.n, p.n.trim(), p.p, (p.s ?? '').trim()]);
      aantal++;
    }
    perWinkel[winkel.n] = aantal;
  }
  return { producten, perWinkel };
}

export async function haalPrijzen() {
  const ruw = JSON.parse(await haal(BRON, { timeoutMs: 120_000 }));
  const { producten, perWinkel } = verwerk(ruw);
  if (producten.length < 1000) throw new Error(`Checkjebon: maar ${producten.length} producten (bron veranderd?)`);
  return { bron: BRON, perWinkel, producten };
}
