// Lidl: elke producttegel op de aanbiedingenpagina heeft een data-grid-data-attribuut met JSON.
// Let op: de pagina toont alleen de eerste ~50 tegels; de rest laadt Lidl pas na "Toon meer".
import { aanbieding, decodeerEntiteiten, lokaleDatum, opschonen } from '../lib.js';

export const naam = 'lidl';
export const url = 'https://www.lidl.nl/c/aanbiedingen/a10008785';

/** Prijzen die tot "2200" gelden zijn vaste (verlaagde) prijzen, geen tijdelijke actie. */
const isVerreToekomst = (iso) => !iso || Number(String(iso).slice(0, 4)) > 2100;

export function parse(html) {
  const tegels = [...html.matchAll(/data-grid-data="([^"]*)"/g)].map((m) => JSON.parse(decodeerEntiteiten(m[1])));
  if (tegels.length === 0) throw new Error('Lidl: geen producttegels gevonden (pagina-opbouw veranderd?)');

  const gezien = new Set();
  const resultaat = [];
  for (const t of tegels) {
    if (gezien.has(t.productId)) continue;
    gezien.add(t.productId);

    const huidige = Object.values(t.regionsPrices ?? {})[0]?.currentPrice ?? t.price ?? {};
    const korting = huidige.discount ?? {};
    const tijdelijk = !isVerreToekomst(huidige.endDate);
    const label = opschonen(korting.discountText);
    const actie =
      label ?? (korting.percentageDiscount ? `-${korting.percentageDiscount}%` : null) ?? (tijdelijk ? null : 'nieuwe lage prijs');

    resultaat.push(
      aanbieding({
        winkel: naam,
        id: t.productId,
        titel: (t.fullTitle ?? t.title ?? '').replace(/^\s*-\s*/, ''),
        omschrijving: huidige.packaging?.text ?? null,
        actie,
        actieprijs: huidige.price ?? null,
        normaalprijs: huidige.oldPrice ?? null,
        geldig_van: lokaleDatum(huidige.startDate),
        geldig_tot: tijdelijk ? lokaleDatum(huidige.endDate) : null,
        categorie: t.category ?? null,
        url: t.canonicalUrl ? new URL(t.canonicalUrl, 'https://www.lidl.nl').href : null,
        afbeelding: t.image ?? null,
      }),
    );
  }
  return resultaat;
}
