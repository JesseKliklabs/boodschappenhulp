// Aldi: Next.js-pagina; de acties zitten als JSON-tekst in pageProps.apiData.
import { aanbieding, nextData, parseVoorActie } from '../lib.js';

export const naam = 'aldi';
export const url = 'https://www.aldi.nl/aanbiedingen.html';

export function parse(html) {
  const data = nextData(html);
  const apiRuw = data?.props?.pageProps?.apiData;
  if (!apiRuw) throw new Error('Aldi: apiData niet gevonden (pagina-opbouw veranderd?)');
  const api = typeof apiRuw === 'string' ? JSON.parse(apiRuw) : apiRuw;

  const resultaat = [];
  const gezien = new Set();

  for (const [type, inhoud] of api) {
    if (type !== 'OFFER_GET') continue;
    const res = inhoud?.res ?? {};
    const producten = res.algoliaDataMap ?? {};

    // productId → { categorie, van, tot } uit de dag-blokken ("Vanaf maandag" etc.)
    const indeling = new Map();
    for (const dag of res.categories ?? []) {
      for (const groep of dag.content ?? []) {
        for (const id of groep.productIds ?? []) {
          if (!indeling.has(id)) indeling.set(id, { categorie: groep.title, van: dag.startDate, tot: dag.endDate });
        }
      }
    }

    for (const p of Object.values(producten)) {
      if (gezien.has(p.objectID)) continue;
      gezien.add(p.objectID);

      const prijs = p.currentPrice ?? {};
      const promo = (p.promotionPrices ?? [])[0];
      // "v.a. wo. 11.11." is een startdatum, geen actie; die staat al in geldig_van.
      const ruwLabel = prijs.priceTagLabels?.promoText1 ?? null;
      const label = ruwLabel && !/^v\.\s?a\./i.test(ruwLabel) ? ruwLabel : null;
      const indelingInfo = indeling.get(p.objectID) ?? {};
      const voor = parseVoorActie(label ? `${label} ${prijs.priceValue ?? ''}` : null);

      resultaat.push(
        aanbieding({
          winkel: naam,
          id: p.objectID,
          titel: p.name,
          merk: p.brandName,
          omschrijving: p.salesUnit ?? p.shortDescription,
          actie: label,
          actieprijs: prijs.priceValue ?? null,
          aantal: voor?.aantal,
          normaalprijs: prijs.strikePrice?.strikePriceValue ?? null,
          geldig_van: promo?.validFromLocalDate ?? indelingInfo.van ?? null,
          geldig_tot: promo?.validUntilLocalDate ?? indelingInfo.tot ?? null,
          categorie: indelingInfo.categorie ?? null,
          url: p.productSlug ? `https://www.aldi.nl/product/${p.productSlug}.html` : null,
          afbeelding: (p.assets ?? []).find((a) => a.type === 'primary')?.url ?? null,
        }),
      );
    }
  }
  if (resultaat.length === 0) throw new Error('Aldi: geen aanbiedingen gevonden');
  return resultaat;
}
