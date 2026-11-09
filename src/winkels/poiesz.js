// Poiesz: Nuxt-webwinkel; data.offers.offers bevat de acties per categorie.
import { aanbieding, dagEerder, euro, isoDatum, nuxtData } from '../lib.js';

export const naam = 'poiesz';
export const url = 'https://webwinkel.poiesz-supermarkten.nl/aanbiedingen';

/** Poiesz geeft "geldig tot" als middernacht van de dag erna; zet om naar de laatste geldige dag. */
function laatsteDag(waarde) {
  if (!waarde) return null;
  return /T00:00:00/.test(waarde) ? dagEerder(isoDatum(waarde)) : isoDatum(waarde);
}

/**
 * Poiesz splitst het actie-etiket in drie regels. Dat is óf een actie ("2 VOOR", "1+1 GRATIS",
 * "25% KORTING") óf alleen een eenheid bij een scherpe prijs ("PER ZAK", "100 GRAM").
 */
export function actieTekst(o) {
  const type = [o.offerTypeLine1, o.offerTypeLine2, o.offerTypeLine3].filter(Boolean).join(' ').toLowerCase().trim();
  const laag = o.newPriceLow ?? null;
  const hoog = o.newPriceHigh ?? null;
  const bereik = laag != null && hoog != null && hoog !== laag;
  const prijsTekst = laag == null ? '' : bereik ? `${euro(laag)} - ${euro(hoog)}` : euro(laag);

  const voor = type.match(/^(\d+)\s+voor$/);
  if (voor) return { actie: `${type} ${prijsTekst}`.trim(), actieprijs: bereik ? null : laag, aantal: Number(voor[1]) };

  const isEenheid = !type || /^(per\s|\d+\s*(gram|g|kilo|kg|stuks?|liter|l|ml)\b)/.test(type);
  if (isEenheid) {
    const eenheid = /^\d/.test(type) ? `per ${type}` : type;
    return { actie: `${prijsTekst} ${eenheid}`.trim() || null, actieprijs: bereik ? null : laag, aantal: 1 };
  }

  // Korting/gratis-acties: de prijs is dan het (bereik van het) actiebedrag per product.
  return { actie: prijsTekst ? `${type} (${prijsTekst})` : type, actieprijs: bereik ? null : laag, aantal: 1 };
}

export function parse(html) {
  const data = nuxtData(html);
  const offers = data?.data?.offers?.offers;
  if (!offers?.categories) throw new Error('Poiesz: offers niet gevonden (pagina-opbouw veranderd?)');

  const resultaat = [];
  for (const cat of offers.categories) {
    for (const o of cat.offers ?? []) {
      const { actie, actieprijs, aantal } = actieTekst(o);
      resultaat.push(
        aanbieding({
          winkel: naam,
          id: o.id,
          titel: [o.commercialTextLine1, o.commercialTextLine2].filter(Boolean).join(' '),
          omschrijving: [o.commercialTextDetailsLine1, o.commercialTextDetailsLine2, o.commercialTextDetailsLine3].filter(Boolean).join(' '),
          actie,
          actieprijs,
          aantal,
          normaalprijs: o.oldPriceLow ?? null,
          geldig_van: isoDatum(o.validFrom ?? offers.validFrom),
          geldig_tot: laatsteDag(o.validUntil ?? offers.validUntil),
          categorie: cat.name,
          url,
        }),
      );
    }
  }
  if (resultaat.length === 0) throw new Error('Poiesz: geen aanbiedingen gevonden');
  return resultaat;
}
